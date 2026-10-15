const API = 'https://generativelanguage.googleapis.com/v1beta';

export const DEFAULT_MODEL = 'gemini-2.5-flash';

export async function listModels(key) {
  const res = await fetch(`${API}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
  if (!res.ok) throw new Error(await errorText(res));
  const { models = [] } = await res.json();
  return models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name))
    .map((m) => m.name.replace(/^models\//, ''));
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

export async function fixCode({ key, model, language, code, stdin, lastError, signal }) {
  const parts = [`Language: ${language}`, `Source file:\n${code}`];
  if (stdin.trim()) parts.push(`Sample stdin the program will be run with:\n${stdin}`);
  if (lastError) parts.push(`The previous run produced this error:\n${lastError}`);

  const res = await fetch(`${API}/models/${model}:generateContent`, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: parts.join('\n\n') }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.2 },
    }),
  });
  if (!res.ok) throw new Error(await errorText(res));
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  if (!text) throw new Error(`Gemini returned nothing (${data.candidates?.[0]?.finishReason ?? data.promptFeedback?.blockReason ?? 'unknown reason'})`);
  const out = JSON.parse(text);
  return { intent: out.intent ?? '', changes: out.changes ?? [], code: stripFences(out.code ?? '') };
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
