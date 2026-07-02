import {
  handleCors, sendJson, parseBody, getGroqKey, getGeminiKey, getGeminiModel,
  runGroqJson, runGeminiJson, formatError,
} from "../_helpers.js";

/**
 * Groq d'abord, Gemini en secours — une seule implémentation LLM pour le planner.
 */
export async function runPlannerLlmJson({ prompt, systemPrompt, temperature = 0.2 }) {
  const groqKey = getGroqKey();
  if (groqKey) {
    try {
      return await runGroqJson({ key: groqKey, prompt, systemPrompt, temperature });
    } catch (e) {
      const geminiKey = getGeminiKey();
      if (!geminiKey) throw e;
    }
  }
  const geminiKey = getGeminiKey();
  if (!geminiKey) throw new Error("Aucune clé LLM (GROQ_API_KEY / GEMINI_API_KEY) configurée.");
  return runGeminiJson({
    key: geminiKey,
    modelId: getGeminiModel(),
    prompt,
    systemInstruction: systemPrompt,
    generationConfigExtra: { temperature },
  });
}
