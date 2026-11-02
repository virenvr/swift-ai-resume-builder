import { makeMetadataFromLatex } from "@/lib/agents/makeMetadata";
import {
  corsHeaders,
  forbidden,
  getExtensionOrigin,
} from "@/lib/extensionRequest";
import { discoverResumeTypes, resumeTypeLabel } from "@/lib/resume/resumeTypes";
import { saveUploadedResume } from "@/lib/resume/upload";
import { z } from "zod";

export const runtime = "nodejs";

const UploadSchema = z.object({
  // Far larger than any resume, and small enough to stop an accidental huge file.
  texSource: z.string().max(1_000_000, "That file is too large for a resume."),
  name: z.string().optional(),
  replaceType: z.string().optional(),
});

export async function OPTIONS(request: Request) {
  const origin = getExtensionOrigin(request);
  if (!origin) return forbidden();
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function GET(request: Request) {
  const origin = getExtensionOrigin(request);
  if (!origin) return forbidden();
  return Response.json(
    { ok: true, types: await discoverResumeTypes() },
    { headers: corsHeaders(origin) },
  );
}

/** Saves the resume, then builds the master JSON that tailoring reads. */
export async function POST(request: Request) {
  const origin = getExtensionOrigin(request);
  if (!origin) return forbidden();

  let type: string;
  try {
    const parsed = UploadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    type = await saveUploadedResume(parsed.data);
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400, headers: corsHeaders(origin) },
    );
  }

  const label = resumeTypeLabel(type);
  let message = `Saved ${label}. It's now selected and ready to tailor.`;
  try {
    const { usedDemo } = await makeMetadataFromLatex({ type });
    if (usedDemo) {
      message = `Saved ${label}, but demo mode can't read resumes. Log in to an AI provider, then click Make MetaData in the app before tailoring it.`;
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    message = `Saved ${label}, but swift-taylor couldn't read it yet (${reason}). Click Make MetaData in the app to try again.`;
  }

  return Response.json(
    { ok: true, type, message, types: await discoverResumeTypes() },
    { headers: corsHeaders(origin) },
  );
}
