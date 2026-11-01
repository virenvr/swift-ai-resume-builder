import OpenAI from "openai";
import type { ProviderRequest } from "@/lib/llm/client";

/** OpenAI, or any server that speaks its Chat Completions API (see LLM_BASE_URL). */
export async function generateWithOpenAI(
  args: ProviderRequest & { apiKey: string; baseURL?: string },
): Promise<string> {
  const client = new OpenAI({ apiKey: args.apiKey, baseURL: args.baseURL });
  // No temperature or response_format: support varies by model, and every
  // prompt already asks for JSON only (parseJsonFromModel handles the rest).
  const completion = await client.chat.completions.create({
    model: args.model,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content: args.user },
    ],
  });

  const choice = completion.choices[0];
  if (choice?.finish_reason === "length") {
    throw new Error("The model's response was cut off before the JSON finished.");
  }
  if (choice?.message.refusal) {
    throw new Error(`The model declined this request: ${choice.message.refusal}`);
  }
  return choice?.message.content ?? "";
}
