import { randomBytes } from "crypto";
import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { z } from "zod";

// Plain text, like .env.local, and gitignored for the same reason.
const LOGIN_PATH = path.join(process.cwd(), ".google-login.json");

// Must match the URI registered on the Google OAuth client, and the extension's APP_URL.
const REDIRECT_URI = "http://localhost:3000/api/google-login/callback";

// Opening a sheet from a pasted link needs the full spreadsheets scope: Google has no
// narrower one for a sheet Taylor didn't create. It doesn't cover other Drive files.
const SCOPES = "openid email https://www.googleapis.com/auth/spreadsheets";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REQUEST_TIMEOUT_MS = 30_000;

const GoogleLoginSchema = z.object({
  refreshToken: z.string().optional(),
  email: z.string().optional(),
  // Kept after logging out, so reconnecting carries on with the same sheet.
  spreadsheetId: z.string().optional(),
  sheetId: z.number().optional(),
  pendingState: z.string().optional(),
  lastError: z.string().optional(),
  lastSyncedAt: z.string().optional(),
});

export type GoogleLogin = z.infer<typeof GoogleLoginSchema>;

export function readGoogleLogin(): GoogleLogin {
  try {
    return GoogleLoginSchema.parse(JSON.parse(readFileSync(LOGIN_PATH, "utf8")));
  } catch {
    return {};
  }
}

/** Merges into the saved login. Set a field to undefined to remove it. */
export function updateGoogleLogin(changes: GoogleLogin): void {
  const login = { ...readGoogleLogin(), ...changes };
  writeFileSync(LOGIN_PATH, JSON.stringify(login), { mode: 0o600 });
}

function getClient(): { id: string; secret: string } {
  const id = process.env.GOOGLE_CLIENT_ID?.trim();
  const secret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!id || !secret) {
    throw new Error(
      "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env.local, then restart the app. The README explains how to get them.",
    );
  }
  return { id, secret };
}

/** Starts a login and returns the Google page to send the user to. */
export function beginGoogleLogin(): string {
  const { id } = getClient();
  const state = randomBytes(32).toString("hex");
  updateGoogleLogin({ pendingState: state });
  const params = new URLSearchParams({
    client_id: id,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    // Offline + consent is what makes Google return a refresh token every time.
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function requestToken(params: Record<string, string>) {
  const { id, secret } = getClient();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...params }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

/** Swaps the code Google sent to the callback for a saved login. */
export async function finishGoogleLogin(code: string): Promise<void> {
  const { ok, data } = await requestToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
  });
  if (!ok || !data.refresh_token) {
    throw new Error(data.error_description || "Google didn't complete the login.");
  }
  // Came straight from Google over TLS, so the signature doesn't need checking.
  const claims = JSON.parse(
    Buffer.from(String(data.id_token).split(".")[1], "base64url").toString(),
  );
  updateGoogleLogin({
    refreshToken: data.refresh_token,
    email: claims.email,
    lastError: undefined,
  });
}

/** A short-lived token for API calls. Clears the login if Google has ended it. */
export async function getAccessToken(refreshToken: string): Promise<string> {
  const { ok, data } = await requestToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  if (data.error === "invalid_grant") {
    updateGoogleLogin({ refreshToken: undefined });
    throw new Error("Your Google login has expired. Connect again to keep syncing.");
  }
  if (!ok) throw new Error(data.error_description || "Couldn't reach Google.");
  return data.access_token;
}

export async function logOutOfGoogle(): Promise<void> {
  const { refreshToken } = readGoogleLogin();
  updateGoogleLogin({
    refreshToken: undefined,
    email: undefined,
    pendingState: undefined,
    lastError: undefined,
  });
  if (!refreshToken) return;
  // Best effort: the local copy is already gone either way.
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    body: new URLSearchParams({ token: refreshToken }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => {});
}
