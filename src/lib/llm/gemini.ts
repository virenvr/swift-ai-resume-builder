import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ProviderRequest } from "@/lib/llm/client";

export async function generateWithGemini(
  args: ProviderRequest & { apiKey?: string },
): Promise<string> {
  const key = args.apiKey ?? process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is missing. Set it in .env.local or enable DEMO_MODE=true.",
    );
  }
  const model = new GoogleGenerativeAI(key).getGenerativeModel({
    model: args.model,
    systemInstruction: args.system,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });

  const result = await model.generateContent(args.user);
  return result.response.text();
}
