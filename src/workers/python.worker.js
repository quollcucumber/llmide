import { makeStreams } from './stream.js';

let pyodide;

self.onmessage = async ({ data: { code, stdin, indexURL } }) => {
  if (!pyodide) {
    self.postMessage({ type: 'loading' });
    const { loadPyodide } = await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`);
    pyodide = await loadPyodide({ indexURL });
  }
  self.postMessage({ type: 'started' });

  const { write, flush } = makeStreams();
  const out = new TextDecoder(), err = new TextDecoder();
  pyodide.setStdout({ write: (b) => (write('stdout', out.decode(b, { stream: true })), b.length) });
  pyodide.setStderr({ write: (b) => (write('stderr', err.decode(b, { stream: true })), b.length) });
  pyodide.globals.set('_vibe_stdin', stdin);
  pyodide.runPython('import sys, io\nsys.stdin = io.TextIOWrapper(io.BytesIO(_vibe_stdin.encode()))\ndel _vibe_stdin');

  const globals = pyodide.globals.get('dict')();
  globals.set('__name__', '__main__');
  const start = performance.now();
  let exitCode = 0;
  try {
    await pyodide.runPythonAsync(code, { globals, filename: 'main.py' });
  } catch (e) {
    const m = String(e?.message ?? e).match(/SystemExit: ?(\d*)/);
    if (m) exitCode = Number(m[1] || 0);
    else {
      write('stderr', String(e?.message ?? e).replace(/^[\s\S]*?(?=File "main\.py")/, 'Traceback (most recent call last):\n  '));
      exitCode = 1;
    }
  }
  pyodide.runPython('import sys; sys.stdout.flush(); sys.stderr.flush()');
  globals.destroy();
  const ms = Math.round(performance.now() - start);
  flush();
  self.postMessage({ type: 'done', exitCode, ms });
};
