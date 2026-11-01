import {
  finishGoogleLogin,
  readGoogleLogin,
  updateGoogleLogin,
} from "@/lib/google/login";
import { syncSheet } from "@/lib/google/sheet";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const reply = (text: string, status = 200) =>
  new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** Google sends the browser here after the consent screen. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const state = params.get("state");
  const code = params.get("code");

  // Only the login the extension started can finish here, so a website can't send
  // you to this URL with a code that connects Taylor to its own Google account.
  const { pendingState } = readGoogleLogin();
  if (!state || state !== pendingState) {
    return reply("This login link is no longer valid. Start again from the Taylor extension.", 400);
  }
  updateGoogleLogin({ pendingState: undefined });

  if (!code) return reply("Google login was cancelled. You can close this tab.");

  try {
    await finishGoogleLogin(code);
  } catch (error) {
    return reply(
      `Couldn't log in to Google: ${error instanceof Error ? error.message : "unknown error"}`,
      400,
    );
  }

  const { spreadsheetId } = readGoogleLogin();
  if (!spreadsheetId) {
    return reply("Logged in. Go back to Taylor and paste the link to your Google Sheet.");
  }

  // Logging back in carries on with the sheet linked before.
  await syncSheet();
  const { lastError } = readGoogleLogin();
  if (lastError) {
    return reply(`Logged in, but the sheet couldn't be updated: ${lastError}`, 502);
  }
  return Response.redirect(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
}
