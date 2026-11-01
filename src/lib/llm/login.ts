import { readFileSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { z } from "zod";

// Plain text, like .env.local, and gitignored for the same reason.
const LOGIN_PATH = path.join(process.cwd(), ".llm-login.json");

export const LlmLoginSchema = z
  .object({
    provider: z.enum(["gemini", "anthropic", "openai", "openai-compatible"]),
    apiKey: z.string().trim().default(""),
    baseURL: z.string().trim().default(""),
    model: z.string().trim().default(""),
  })
  .refine((l) => l.provider === "openai-compatible" || l.apiKey, {
    message: "Enter your API key.",
  })
  .refine((l) => l.provider !== "openai-compatible" || /^https?:\/\/\S+$/.test(l.baseURL), {
    message: "Enter the server URL, starting with http:// or https://.",
  })
  .refine((l) => l.provider !== "openai-compatible" || l.model, {
    message: "Enter a model: this provider has no default.",
  });

export type LlmLogin = z.infer<typeof LlmLoginSchema>;

/** The login saved from the extension, or null when .env.local is in charge. */
export function readLogin(): LlmLogin | null {
  try {
    return LlmLoginSchema.parse(JSON.parse(readFileSync(LOGIN_PATH, "utf8")));
  } catch {
    return null;
  }
}

export function saveLogin(login: LlmLogin): void {
  writeFileSync(LOGIN_PATH, JSON.stringify(login), { mode: 0o600 });
}

export function clearLogin(): void {
  rmSync(LOGIN_PATH, { force: true });
}
