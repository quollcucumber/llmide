const API = 'https://generativelanguage.googleapis.com/v1beta';

export const DEFAULT_MODEL = 'gemini-3.5-flash';

const NON_TEXT = /tts|image|robotics|computer-use|transcribe|omni|customtools|embedding|banana|lyria|research|antigravity/;

export async function listModels(key) {
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  if (!res.ok) throw new Error(await errorText(res));
  const { models = [] } = await res.json();
  return models
    .map((m) => m.supportedGenerationMethods?.includes('generateContent') && m.name.replace(/^models\//, ''))
    .filter((name) => name && name.startsWith('gemini') && !NON_TEXT.test(name));
}

const SYSTEM = `You are the compiler front-end of a joke IDE called vibe-ide.
The user writes rough, buggy, half-finished, or even pseudo-code. Your job:
1. Work out what program they are actually trying to write.
2. Return a complete, correct, compilable file in the requested language that does that.
Rules:
- Keep their structure, names, style and template (macros, pragmas, #define int long long, etc.) wherever it is not the bug. Make the smallest changes that make it correct.
- If the code is already correct, return it unchanged.
- Fill in obviously missing pieces (includes, input reading, unfinished functions) when intent is clear.
- If a sample stdin or a previous error is given, use it to infer the intended input format and behaviour.
- Never add explanations, markdown fences or extra output to the code itself, and do not add prompts like "Enter n:" to the program's output.
- C++ is compiled with g++/clang as C++20; Python is Python 3.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    intent: { type: 'STRING', description: 'One sentence: what the program is meant to do.' },
    changes: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Short bullet list of fixes made; empty if none.' },
    code: { type: 'STRING', description: 'The full corrected source file.' },
  },
  required: ['intent', 'changes', 'code'],
  propertyOrdering: ['intent', 'changes', 'code'],
};

// Tried in order when the chosen model is overloaded or rate limited.
const FALLBACKS = ['gemini-3.5-flash', 'gemini-flash-latest', 'gemini-flash-lite-latest'];
const RETRYABLE = new Set([404, 429, 500, 503]);
const ATTEMPT_TIMEOUT_MS = 40000;

export async function fixCode({ key, model, language, code, stdin, lastError, signal, onStatus }) {
  const parts = [`Language: ${language}`, `Source file:\n${code}`];
  if (stdin.trim()) parts.push(`Sample stdin the program will be run with:\n${stdin}`);
  if (lastError) parts.push(`The previous run produced this error:\n${lastError}`);
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: SYSTEM }] },
    contents: [{ role: 'user', parts: [{ text: parts.join('\n\n') }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
  });

  let res;
  for (const m of [...new Set([model, ...FALLBACKS])]) {
    if (m !== model) onStatus?.(`${model} is busy or unavailable, trying ${m}…`);
    try {
      res = await fetch(`${API}/models/${m}:generateContent`, {
        method: 'POST', body,
        signal: AbortSignal.any([signal, AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)]),
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      });
    } catch (e) {
      if (e.name !== 'TimeoutError') throw e;
      res = { ok: false, status: 503, statusText: `${m} timed out`, json: async () => ({}) };
      continue;
    }
    if (res.ok) { model = m; break; }
    if (!RETRYABLE.has(res.status)) break;
  }
  if (!res.ok) throw new Error(await errorText(res));
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!text) throw new Error(`Gemini returned nothing (${data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason ?? 'unknown reason'})`);
  const out = JSON.parse(text);
  return { model, intent: out.intent ?? '', changes: out.changes ?? [], code: stripFences(out.code ?? '') };
}

function stripFences(code) {
  const m = code.match(/^\s*```[\w+]*\n([\s\S]*?)\n```\s*$/);
  return m ? m[1] : code;
}

async function errorText(res) {
  try {
    const j = await res.json();
    return `Gemini ${res.status}: ${j.error?.message ?? JSON.stringify(j)}`;
  } catch {
    return `Gemini ${res.status} ${res.statusText}`;
  }
}
