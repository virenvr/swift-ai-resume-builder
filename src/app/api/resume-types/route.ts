import { discoverResumeTypes } from "@/lib/resume/resumeTypes";
import { corsHeaders, getExtensionOrigin } from "@/lib/extensionRequest";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * List available resume archetypes (one per template_{type}.tex in data/). Called
 * same-origin by the Workbench, and directly (cross-origin) by the extension. A plain
 * GET with no custom headers never triggers a CORS preflight, so no OPTIONS handler
 * is needed — only the response needs the extension's origin echoed back.
 */
export async function GET(request: Request) {
  const origin = getExtensionOrigin(request);
  try {
    const types = await discoverResumeTypes();
    return NextResponse.json(
      { ok: true, types },
      origin ? { headers: corsHeaders(origin) } : undefined,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list resume types";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: origin ? corsHeaders(origin) : undefined },
    );
  }
}
