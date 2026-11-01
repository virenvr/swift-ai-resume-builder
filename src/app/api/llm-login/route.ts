import {
  corsHeaders,
  forbidden,
  getExtensionOrigin,
} from "@/lib/extensionRequest";
import { getModelName, isDemoMode, verifyLogin } from "@/lib/llm/client";
import {
  clearLogin,
  LlmLoginSchema,
  readLogin,
  saveLogin,
} from "@/lib/llm/login";

export const runtime = "nodejs";

// Never includes the key.
function loginReply(origin: string) {
  const login = readLogin();
  return Response.json(
    {
      ok: true,
      login: login && { provider: login.provider, model: getModelName("pro") },
      demoMode: isDemoMode(),
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
      "Access-Control-Allow-Methods": "GET, POST, DELETE",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function GET(request: Request) {
  const origin = getExtensionOrigin(request);
  if (!origin) return forbidden();
  return loginReply(origin);
}

export async function POST(request: Request) {
  const origin = getExtensionOrigin(request);
  if (!origin) return forbidden();

  const fail = (error: string) =>
    Response.json(
      { ok: false, error },
      { status: 400, headers: corsHeaders(origin) },
    );

  const parsed = LlmLoginSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return fail(parsed.error.issues[0].message);

  try {
    await verifyLogin(parsed.data);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Login failed");
  }
  saveLogin(parsed.data);
  return loginReply(origin);
}

export async function DELETE(request: Request) {
  const origin = getExtensionOrigin(request);
  if (!origin) return forbidden();
  clearLogin();
  return loginReply(origin);
}
