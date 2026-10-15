import { WASI, File, OpenFile, ConsoleStdout, WASIProcExit } from '@bjorn3/browser_wasi_shim';
import { makeStreams } from './stream.js';

const TRAPS = [
  [/unreachable/, 'Runtime error: program aborted (failed assert, abort(), thrown exception, or UB)'],
  [/out of bounds|index out of bounds/, 'Runtime error: memory access out of bounds (segfault / stack overflow)'],
  [/divide by zero|integer divide/, 'Runtime error: integer division by zero'],
  [/call stack|recursion/, 'Runtime error: stack overflow'],
];

self.onmessage = async ({ data: { wasm, stdin } }) => {
  const { write, flush } = makeStreams();
  const out = new TextDecoder(), err = new TextDecoder();
  const wasi = new WASI(['a.out'], [], [
    new OpenFile(new File(new TextEncoder().encode(stdin))),
    new ConsoleStdout((b) => write('stdout', out.decode(b, { stream: true }))),
    new ConsoleStdout((b) => write('stderr', err.decode(b, { stream: true }))),
  ]);
  const instance = await WebAssembly.instantiate(await WebAssembly.compile(wasm), {
    wasi_snapshot_preview1: wasi.wasiImport,
  });
  const start = performance.now();
  let exitCode = 0;
  try {
    exitCode = wasi.start(instance);
  } catch (e) {
    if (e instanceof WASIProcExit) exitCode = e.code;
    else {
      const msg = TRAPS.find(([re]) => re.test(e?.message))?.[1] ?? `Runtime error: ${e?.message ?? e}`;
      write('stderr', `\n${msg}\n`);
      exitCode = 139;
    }
  }
  const ms = Math.round(performance.now() - start);
  flush();
  self.postMessage({ type: 'done', exitCode, ms });
};
