import { runClang } from '@yowasp/clang';
import { stdcppShim } from '../lib/stdcpp.js';

const FLAGS = [
  '-std=c++20', '-O2', '-fno-exceptions',
  '-Wno-unknown-pragmas', '-Wno-ignored-pragmas', '-Wno-macro-redefined',
  '-Wl,-z,stack-size=67108864', '-Wl,--stack-first',
];

const progress = new Map();
function onProgress({ source, totalLength, doneLength }) {
  progress.set(source, [doneLength, totalLength]);
  let done = 0, total = 0;
  for (const [d, t] of progress.values()) { done += d; total += t; }
  self.postMessage({ type: 'progress', done, total });
}

self.onmessage = async ({ data: { id, code } }) => {
  const decoder = new TextDecoder();
  let stderr = '';
  const stderrStream = (bytes) => { if (bytes) stderr += decoder.decode(bytes, { stream: true }); };
  const start = performance.now();
  try {
    const out = await runClang(
      ['clang++', ...FLAGS, '-I', 'inc', 'main.cpp', '-o', 'a.out'],
      { 'main.cpp': code, inc: { bits: { 'stdc++.h': stdcppShim } } },
      { stderr: stderrStream, stdout: stderrStream, fetchProgress: onProgress },
    );
    const wasm = out['a.out'];
    self.postMessage({ type: 'done', id, ok: true, wasm, stderr, ms: Math.round(performance.now() - start) }, [wasm.buffer]);
  } catch (e) {
    if (typeof e?.code !== 'number') stderr += `\n${e?.message ?? e}`;
    self.postMessage({ type: 'done', id, ok: false, stderr: stderr.trim() || 'Compilation failed', ms: Math.round(performance.now() - start) });
  }
};
