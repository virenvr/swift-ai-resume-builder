import Anthropic from "@anthropic-ai/sdk";
import type { ProviderRequest } from "@/lib/llm/client";

// Models that accept a server-side retry after a safety decline. Haiku does not.
const SUPPORTS_FALLBACK = /^claude-(sonnet-5-5|opus-5|opus-5-5|fable-5-1)$/;

export async function generateWithAnthropic(
  args: ProviderRequest & { apiKey?: string },
): Promise<string> {
  // No temperature: current Claude models reject non-default sampling values.
  const request = {
    model: args.model,
    max_tokens: 16000,
    system: args.system,
    messages: [{ role: "user" as const, content: args.user }],
  };
  // Without a key, the SDK reads ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN.
  const client = new Anthropic({ apiKey: args.apiKey });
  const message = SUPPORTS_FALLBACK.test(args.model)
    ? await client.beta.messages.create({
        ...request,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      })
    : await client.beta.messages.create(request);

  if (message.stop_reason === "refusal") {
    throw new Error(
      "Claude declined this request. Try again, or switch LLM_MODEL_PRO / LLM_MODEL_FLASH.",
    );
  }
  if (message.stop_reason === "max_tokens") {
    throw new Error("Claude's response was cut off before the JSON finished.");
  }
  return message.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
}
