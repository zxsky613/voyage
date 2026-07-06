import {
  getDeepSeekKey,
  getDeepSeekModel,
  getGeminiKey,
  getGeminiModel,
  getGroqKey,
  runDeepSeekJson,
  runGeminiJson,
  runGroqJson,
  formatError,
} from "../_helpers.js";

const LLM_MAX_TOKENS = 8000;

function forcedProvider() {
  const v = String(process.env.FORCE_LLM_PROVIDER || "").trim().toLowerCase();
  if (v === "deepseek" || v === "groq" || v === "gemini") return v;
  return "";
}

/**
 * Chaîne planner : DeepSeek → Groq → Gemini.
 * @returns {Promise<{ data: object, provider: string }>}
 */
export async function runPlannerLlmJson({ prompt, systemPrompt, temperature = 0.2, maxTokens = LLM_MAX_TOKENS }) {
  const force = forcedProvider();
  const deepseekKey = getDeepSeekKey();
  const groqKey = getGroqKey();
  const geminiKey = getGeminiKey();

  const tryDeepSeek = async () => {
    if (!deepseekKey) throw new Error("DEEPSEEK_API_KEY missing");
    const data = await runDeepSeekJson({
      key: deepseekKey,
      model: getDeepSeekModel(),
      prompt,
      systemPrompt,
      temperature,
      maxTokens,
    });
    return { data, provider: "deepseek" };
  };

  const tryGroq = async () => {
    if (!groqKey) throw new Error("GROQ_API_KEY missing");
    const data = await runGroqJson({
      key: groqKey,
      prompt,
      systemPrompt,
      temperature,
      maxTokens,
    });
    return { data, provider: "groq" };
  };

  const tryGemini = async () => {
    if (!geminiKey) throw new Error("GEMINI_API_KEY missing");
    const data = await runGeminiJson({
      key: geminiKey,
      modelId: getGeminiModel(),
      prompt,
      systemInstruction: systemPrompt,
      generationConfigExtra: { temperature },
    });
    return { data, provider: "gemini" };
  };

  if (force === "deepseek") {
    const out = await tryDeepSeek();
    console.info(`[planner/llm] provider=${out.provider} (forced)`);
    return out;
  }
  if (force === "groq") {
    const out = await tryGroq();
    console.info(`[planner/llm] provider=${out.provider} (forced)`);
    return out;
  }
  if (force === "gemini") {
    const out = await tryGemini();
    console.info(`[planner/llm] provider=${out.provider} (forced)`);
    return out;
  }

  if (deepseekKey) {
    try {
      const out = await tryDeepSeek();
      console.info(`[planner/llm] provider=${out.provider}`);
      return out;
    } catch (e) {
      console.error(`[planner/llm] DeepSeek KO, repli Groq/Gemini: ${formatError(e).slice(0, 200)}`);
      if (!groqKey && !geminiKey) throw e;
    }
  }

  if (groqKey) {
    try {
      const out = await tryGroq();
      console.info(`[planner/llm] provider=${out.provider}`);
      return out;
    } catch (e) {
      console.error(`[planner/llm] Groq KO, repli Gemini: ${formatError(e).slice(0, 200)}`);
      if (!geminiKey) throw e;
    }
  }

  if (!geminiKey) {
    throw new Error("Aucune clé LLM (DEEPSEEK_API_KEY / GROQ_API_KEY / GEMINI_API_KEY) configurée.");
  }
  const out = await tryGemini();
  console.info(`[planner/llm] provider=${out.provider}`);
  return out;
}
