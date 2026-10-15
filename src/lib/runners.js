import ClangWorker from '../workers/clang.worker.js?worker';
import WasmRunWorker from '../workers/wasm-run.worker.js?worker';
import PythonWorker from '../workers/python.worker.js?worker';
import { runOnWandbox } from './wandbox.js';

let clang, compileId = 0;

function compileCpp(code, onStatus) {
  clang ??= new ClangWorker();
  const id = ++compileId;
  return new Promise((resolve) => {
    clang.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        if (data.done < data.total) onStatus(`Downloading compiler (first run only)… ${Math.round((100 * data.done) / data.total)}%`);
        else onStatus('Compiling (clang → WebAssembly)…');
      } else if (data.id === id) resolve(data);
    };
    clang.postMessage({ id, code });
  });
}

// Runs a worker that streams {type:'output'} chunks and ends with {type:'done'}.
// The time limit starts at `startEvent` (so Pyodide's load time doesn't count).
function runWithLimit(worker, message, { timeLimitMs, onOutput, onStatus, startEvent, kill }) {
  return new Promise((resolve) => {
    let stdout = '', stderr = '', timer;
    const startTimer = () => {
      onStatus('Running…');
      timer = setTimeout(() => {
        kill();
        resolve({ stdout, stderr: `${stderr}${stderr && !stderr.endsWith("\n") ? "\n" : ""}Time limit exceeded (${timeLimitMs / 1000}s)`, exitCode: 124, ms: timeLimitMs, tle: true });
      }, timeLimitMs);
    };
    worker.onmessage = ({ data }) => {
      if (data.type === 'loading') onStatus('Loading Python (first run only)…');
      else if (data.type === startEvent) startTimer();
      else if (data.type === 'output') {
        stdout += data.stdout;
        stderr += data.stderr;
        onOutput({ stdout, stderr });
      } else if (data.type === 'done') {
        clearTimeout(timer);
        resolve({ stdout, stderr, exitCode: data.exitCode, ms: data.ms });
      }
    };
    worker.onerror = (e) => {
      clearTimeout(timer);
      kill();
      resolve({ stdout, stderr: `${stderr}\nWorker crashed: ${e.message ?? 'unknown error'}`, exitCode: 1, ms: 0 });
    };
    worker.postMessage(message);
    if (!startEvent) startTimer();
  });
}

async function runCppInBrowser({ code, stdin, timeLimitMs, onStatus, onOutput }) {
  onStatus('Compiling (clang → WebAssembly)…');
  const compiled = await compileCpp(code, onStatus);
  if (!compiled.ok) return { phase: 'compile', stdout: '', stderr: compiled.stderr, exitCode: 1, compileMs: compiled.ms };
  const worker = new WasmRunWorker();
  const result = await runWithLimit(worker, { wasm: compiled.wasm, stdin }, {
    timeLimitMs, onOutput, onStatus, kill: () => worker.terminate(),
  });
  worker.terminate();
  return { phase: 'run', ...result, compileMs: compiled.ms, warnings: compiled.stderr };
}

let python;
async function runPythonInBrowser({ code, stdin, timeLimitMs, onStatus, onOutput }) {
  python ??= new PythonWorker();
  const worker = python;
  const indexURL = new URL('pyodide/', document.baseURI).href;
  const kill = () => { worker.terminate(); if (python === worker) python = undefined; };
  const result = await runWithLimit(worker, { code, stdin, indexURL }, {
    timeLimitMs, onOutput, onStatus, startEvent: 'started', kill,
  });
  return { phase: 'run', ...result };
}

export async function runCode({ language, runner, code, stdin, timeLimitMs, onStatus, onOutput, signal }) {
  if (runner === 'wandbox') {
    onStatus('Sending to wandbox.org…');
    return runOnWandbox({ language, code, stdin, signal });
  }
  return language === 'cpp'
    ? runCppInBrowser({ code, stdin, timeLimitMs, onStatus, onOutput })
    : runPythonInBrowser({ code, stdin, timeLimitMs, onStatus, onOutput });
}
