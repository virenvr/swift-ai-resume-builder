import { generateWithAnthropic } from "@/lib/llm/anthropic";
import { generateWithGemini } from "@/lib/llm/gemini";
import { readLogin, type LlmLogin } from "@/lib/llm/login";
import { generateWithOpenAI } from "@/lib/llm/openai";

type ModelKind = "pro" | "flash";
type LlmProvider = LlmLogin["provider"];

const LOGIN_TIMEOUT_MS = 60_000;

export type ProviderRequest = { model: string; system: string; user: string };

const DEFAULT_MODELS: Record<LlmProvider, Record<ModelKind, string | null>> = {
  gemini: { pro: "gemini-2.5-flash", flash: "gemini-2.5-flash" },
  anthropic: { pro: "claude-sonnet-5-5", flash: "claude-haiku-5-5" },
  openai: { pro: "gpt-6-luna", flash: "gpt-6-luna" },
  "openai-compatible": { pro: null, flash: null },
};

function getProvider(login: LlmLogin | null = readLogin()): LlmProvider {
  if (login) return login.provider;
  const raw = process.env.LLM_PROVIDER?.trim().toLowerCase() || "gemini";
  if (raw in DEFAULT_MODELS) return raw as LlmProvider;
  throw new Error(
    `Unknown LLM_PROVIDER "${raw}". Use one of: ${Object.keys(DEFAULT_MODELS).join(", ")}.`,
  );
}

function hasCredentials(provider: LlmProvider): boolean {
  switch (provider) {
    case "gemini":
      return Boolean(process.env.GEMINI_API_KEY?.trim());
    case "anthropic":
      return Boolean(
        process.env.ANTHROPIC_API_KEY?.trim() ||
          process.env.ANTHROPIC_AUTH_TOKEN?.trim(),
      );
    case "openai":
      return Boolean(process.env.OPENAI_API_KEY?.trim());
    case "openai-compatible":
      // Local servers such as Ollama need no key.
      return Boolean(process.env.LLM_BASE_URL?.trim());
  }
}

export function isDemoMode(): boolean {
  // Logging in is an explicit request for real AI, whatever .env.local says.
  if (readLogin()) return false;
  if (process.env.DEMO_MODE === "true") return true;
  if (process.env.DEMO_MODE === "false") return false;
  return !hasCredentials(getProvider());
}

export function getModelName(
  kind: ModelKind = "pro",
  login: LlmLogin | null = readLogin(),
): string {
  const provider = getProvider(login);
  // .env.local models belong to its provider, so they don't apply to a login.
  if (login) return login.model || (DEFAULT_MODELS[provider][kind] as string);
  const suffix = kind === "flash" ? "FLASH" : "PRO";
  const model =
    process.env[`LLM_MODEL_${suffix}`]?.trim() ||
    // Older .env.local files set these instead.
    (provider === "gemini" && process.env[`GEMINI_MODEL_${suffix}`]?.trim()) ||
    DEFAULT_MODELS[provider][kind];
  if (!model) {
    throw new Error(
      `Set LLM_MODEL_${suffix} in .env.local: LLM_PROVIDER=${provider} has no default model.`,
    );
  }
  return model;
}

/** Strip optional markdown fences and parse JSON. */
export function parseJsonFromModel<T>(raw: string): T {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Model returned empty response (expected JSON).");
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let payload = (fenced ? fenced[1] : trimmed).trim();

  // If extra prose sneaks in, take the outermost JSON object/array.
  if (!payload.startsWith("{") && !payload.startsWith("[")) {
    const startObj = payload.indexOf("{");
    const startArr = payload.indexOf("[");
    const start =
      startObj === -1
        ? startArr
        : startArr === -1
          ? startObj
          : Math.min(startObj, startArr);
    if (start === -1) {
      throw new Error(
        `Model did not return JSON. Preview: ${payload.slice(0, 160)}`,
      );
    }
    const endObj = payload.lastIndexOf("}");
    const endArr = payload.lastIndexOf("]");
    const end = Math.max(endObj, endArr);
    payload = payload.slice(start, end + 1);
  }

  try {
    return JSON.parse(payload) as T;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "JSON parse failed";
    throw new Error(
      `${detail}. Preview: ${payload.slice(0, 220).replace(/\s+/g, " ")}`,
    );
  }
}

export async function generateJson<T>(args: {
  system: string;
  user: string;
  kind?: ModelKind;
}): Promise<{ raw: string; parsed: T; usedDemo: false }> {
  const request: ProviderRequest = {
    model: getModelName(args.kind ?? "pro"),
    system: args.system,
    user: args.user,
  };
  const raw = await generateRaw(request);
  return { raw, parsed: parseJsonFromModel<T>(raw), usedDemo: false };
}

/** Makes one small real call, so a bad key or model fails at login, not mid-run. */
export async function verifyLogin(login: LlmLogin): Promise<void> {
  const request: ProviderRequest = {
    model: getModelName("flash", login),
    system: "Reply with JSON only.",
    user: 'Return {"ok":true}',
  };
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("The provider didn't answer in time.")),
      LOGIN_TIMEOUT_MS,
    );
  });
  try {
    await Promise.race([generateRaw(request, login), timeout]);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed";
    // Some providers repeat the key in their error text.
    throw new Error(
      login.apiKey ? message.replaceAll(login.apiKey, "[your key]") : message,
    );
  } finally {
    clearTimeout(timer);
  }
}

function generateRaw(
  request: ProviderRequest,
  login: LlmLogin | null = readLogin(),
): Promise<string> {
  const provider = getProvider(login);
  switch (provider) {
    case "gemini":
      return generateWithGemini({ ...request, apiKey: login?.apiKey });
    case "anthropic":
      return generateWithAnthropic({ ...request, apiKey: login?.apiKey });
    case "openai": {
      const apiKey = login?.apiKey ?? process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) {
        throw new Error(
          "OPENAI_API_KEY is missing. Set it in .env.local or enable DEMO_MODE=true.",
        );
      }
      return generateWithOpenAI({ ...request, apiKey });
    }
    case "openai-compatible": {
      const baseURL = login?.baseURL ?? process.env.LLM_BASE_URL?.trim();
      if (!baseURL) {
        throw new Error(
          "LLM_BASE_URL is missing. Set it in .env.local or enable DEMO_MODE=true.",
        );
      }
      const apiKey = login ? login.apiKey : process.env.LLM_API_KEY?.trim();
      return generateWithOpenAI({
        ...request,
        baseURL,
        // The SDK requires a value, but local servers ignore it.
        apiKey: apiKey || "not-needed",
      });
    }
  }
}
