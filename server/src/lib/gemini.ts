// Gemini through Google Cloud Vertex AI (billed to our GCP project, so it uses
// our promotional credits). Uses the Google Gen AI SDK (@google/genai) in
// Vertex mode; the older @google-cloud/vertexai VertexAI class was deprecated
// in June 2025 and removed in June 2026.
//
// Auth is Application Default Credentials: either `gcloud auth
// application-default login` on a laptop, or GOOGLE_APPLICATION_CREDENTIALS
// pointing at a service-account key file. No AI Studio API key is used.

import { ApiError, GoogleGenAI, ThinkingLevel } from "@google/genai";

export const GCP_PROJECT_ID = process.env.GCP_PROJECT_ID || "project-79cc0670-01b4-43ca-94d";
// "global": the newer Gemini models (3.x) aren't served from us-central1 for this project.
export const GCP_LOCATION = process.env.GCP_LOCATION || "global";
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

export { ApiError as GeminiApiError, ThinkingLevel };

let client: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  // `enterprise: true` is the SDK's current name for Vertex AI mode (same as `vertexai: true`).
  client ??= new GoogleGenAI({ enterprise: true, project: GCP_PROJECT_ID, location: GCP_LOCATION });
  return client;
}

export interface GenerateOptions {
  system?: string;
  model?: string;
  // When set, Gemini must answer with JSON matching this JSON Schema.
  jsonSchema?: unknown;
  // Less thinking = faster, cheaper answers for simple tasks. Default: the model's own default.
  thinkingLevel?: ThinkingLevel;
  timeoutMs?: number;
}

// One prompt in, the model's text out. Throws GeminiApiError (with .status)
// for API failures, or Error when the response has no text.
export async function generateText(prompt: string, opts: GenerateOptions = {}): Promise<string> {
  const response = await getGemini().models.generateContent({
    model: opts.model ?? GEMINI_MODEL,
    contents: prompt,
    config: {
      systemInstruction: opts.system,
      ...(opts.jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: opts.jsonSchema } : {}),
      ...(opts.thinkingLevel ? { thinkingConfig: { thinkingLevel: opts.thinkingLevel } } : {}),
      httpOptions: { timeout: opts.timeoutMs ?? 180000 },
    },
  });
  const text = response.text;
  if (!text) {
    throw new Error(`Empty Gemini response (finishReason: ${response.candidates?.[0]?.finishReason ?? "none"})`);
  }
  return text;
}
