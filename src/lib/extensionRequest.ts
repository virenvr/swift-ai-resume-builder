// Browsers set Origin themselves, so a website can't pass this check. Without it,
// any page you visit could point the app at its own server and receive your resume.
const EXTENSION_ORIGIN = /^(chrome|moz|safari-web)-extension:\/\/[^/]+$/;

export function getExtensionOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  return origin && EXTENSION_ORIGIN.test(origin) ? origin : null;
}

export const forbidden = () =>
  Response.json(
    { ok: false, error: "Only the swift-taylor extension can use this." },
    { status: 403 },
  );

// Browsers skip CORS for extensions with host access, but users can revoke that.
export function corsHeaders(origin: string) {
  return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
}
