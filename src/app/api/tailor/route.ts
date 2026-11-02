import { runTailorCascade } from "@/lib/agents/cascade";
import { isDemoMode } from "@/lib/llm/client";
import { KeywordExtractSchema, TailorControlsSchema } from "@/lib/types";
import { corsHeaders, forbidden, getExtensionOrigin } from "@/lib/extensionRequest";
import { z } from "zod";

export const runtime = "nodejs";

const BodySchema = z.object({
  jdText: z.string().min(1),
  controls: TailorControlsSchema,
  companyName: z.string().optional(),
  keywords: KeywordExtractSchema.optional(),
  stream: z.boolean().optional().default(true),
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
 * Runs the tailoring cascade. Called same-origin by the Workbench, and directly
 * (cross-origin) by the extension's one-click "Create resume".
 */
export async function POST(request: Request) {
  const origin = getExtensionOrigin(request);
  const extCors = origin ? corsHeaders(origin) : undefined;

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid tailor request";
    return Response.json({ ok: false, error: message }, { status: 400, headers: extCors });
  }

  if (!body.stream) {
    try {
      const result = await runTailorCascade({
        jdText: body.jdText,
        controls: body.controls,
        companyName: body.companyName,
        keywords: body.keywords,
      });
      return Response.json(
        {
          ok: true,
          steps: result.steps,
          usedDemo: result.usedDemo,
          demoMode: isDemoMode(),
          pdfUrl: result.pdfUrl,
          pdfFilename: result.pdfFilename,
          texFilename: result.texFilename,
          texSource: result.texSource,
          changeSummary: result.changeSummary,
        },
        { headers: extCors },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Cascade failed";
      return Response.json({ ok: false, error: message }, { status: 400, headers: extCors });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
      };
      try {
        send({ type: "meta", demoMode: isDemoMode() });
        await runTailorCascade({
          jdText: body.jdText,
          controls: body.controls,
          companyName: body.companyName,
          keywords: body.keywords,
          onEvent: async (event) => {
            send(event);
          },
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Cascade failed";
        send({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      ...extCors,
    },
  });
}
