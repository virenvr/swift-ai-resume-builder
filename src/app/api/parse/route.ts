import { extractKeywords } from "@/lib/agents/extractKeywords";
import { parseJd } from "@/lib/agents/parseJd";
import { isDemoMode } from "@/lib/llm/client";
import { resolveJdInput } from "@/lib/ingest/fetchJdUrl";
import { corsHeaders, forbidden, getExtensionOrigin } from "@/lib/extensionRequest";
import { NextResponse } from "next/server";
import { z } from "zod";

const BodySchema = z
  .object({
    jdText: z.string().optional(),
    jdUrl: z.string().optional(),
  })
  .refine((b) => Boolean(b.jdText?.trim() || b.jdUrl?.trim()), {
    message: "Provide jdText and/or jdUrl.",
  });

// Same-origin calls (the Workbench itself) send no Origin header and skip this
// entirely; only a genuine cross-origin preflight (the extension) reaches here.
export async function OPTIONS(request: Request) {
  const origin = getExtensionOrigin(request);
  if (!origin) return forbidden();
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

/**
 * Parses a JD into suggestions + keywords. Called same-origin by the Workbench, and
 * directly (cross-origin) by the extension's one-click "Create resume".
 */
export async function POST(request: Request) {
  const origin = getExtensionOrigin(request);
  try {
    const body = BodySchema.parse(await request.json());
    const resolved = await resolveJdInput({
      jdText: body.jdText,
      jdUrl: body.jdUrl,
    });
    const result = await parseJd(resolved.jdText);

    // Detect keywords immediately after parse so UI can show them before cascade.
    const keywordsResult = await extractKeywords({
      jdText: resolved.jdText,
      roleFamily: result.suggestions.roleFamily,
    });

    return NextResponse.json(
      {
        ok: true,
        suggestions: result.suggestions,
        keywords: keywordsResult.data,
        jdText: resolved.jdText,
        source: resolved.source,
        fetchedUrl: resolved.fetchedUrl,
        warning: resolved.warning,
        usedDemo: result.usedDemo || keywordsResult.usedDemo,
        demoMode: isDemoMode(),
        promptId: result.promptId,
      },
      origin ? { headers: corsHeaders(origin) } : undefined,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse JD";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 400, headers: origin ? corsHeaders(origin) : undefined },
    );
  }
}
