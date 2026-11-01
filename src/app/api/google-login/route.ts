import {
  corsHeaders,
  forbidden,
  getExtensionOrigin,
} from "@/lib/extensionRequest";
import {
  beginGoogleLogin,
  logOutOfGoogle,
  readGoogleLogin,
} from "@/lib/google/login";
import { connectSheet, syncSheet } from "@/lib/google/sheet";
import { z } from "zod";

export const runtime = "nodejs";

const LinkSheetSchema = z.object({ sheetUrl: z.string() });

// Never includes the tokens.
function loginReply(origin: string) {
  const { refreshToken, email, spreadsheetId, lastError, lastSyncedAt } =
    readGoogleLogin();
  return Response.json(
    {
      ok: true,
      connected: Boolean(refreshToken),
      email,
      sheetUrl:
        spreadsheetId && `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      lastError,
      lastSyncedAt,
    },
    { headers: corsHeaders(origin) },
  );
}

export async function OPTIONS(request: Request) {
  const origin = getExtensionOrigin(request);
  if (!origin) return forbidden();
  return new Response(null, {
    status: 204,
    headers: {
      ...corsHeaders(origin),
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function GET(request: Request) {
  const origin = getExtensionOrigin(request);
  if (!origin) return forbidden();
  return loginReply(origin);
}

/** Starts a login and returns the Google page for the extension to open. */
export async function POST(request: Request) {
  const origin = getExtensionOrigin(request);
  if (!origin) return forbidden();
  try {
    return Response.json(
      { ok: true, url: beginGoogleLogin() },
      { headers: corsHeaders(origin) },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Login failed" },
      { status: 400, headers: corsHeaders(origin) },
    );
  }
}

/** Syncs now. Failures come back in lastError. */
export async function PUT(request: Request) {
  const origin = getExtensionOrigin(request);
  if (!origin) return forbidden();
  await syncSheet();
  return loginReply(origin);
}

/** Links the sheet the user pasted. Sync failures come back in lastError. */
export async function PATCH(request: Request) {
  const origin = getExtensionOrigin(request);
  if (!origin) return forbidden();
  const parsed = LinkSheetSchema.safeParse(await request.json().catch(() => null));
  try {
    if (!parsed.success) throw new Error("Paste a link to your Google Sheet.");
    await connectSheet(parsed.data.sheetUrl);
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Couldn't link that sheet." },
      { status: 400, headers: corsHeaders(origin) },
    );
  }
  return loginReply(origin);
}

export async function DELETE(request: Request) {
  const origin = getExtensionOrigin(request);
  if (!origin) return forbidden();
  await logOutOfGoogle();
  return loginReply(origin);
}
