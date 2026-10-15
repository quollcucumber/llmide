const COMPILERS = { cpp: 'gcc-13.2.0', python: 'cpython-3.13.8' };

export async function runOnWandbox({ language, code, stdin, signal }) {
  const t = performance.now();
  const res = await fetch('https://wandbox.org/api/compile.json', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      compiler: COMPILERS[language],
      code,
      stdin,
      'compiler-option-raw': language === 'cpp' ? '-O2\n-std=gnu++20' : '',
      save: false,
    }),
  });
  if (!res.ok) throw new Error(`Wandbox ${res.status} ${res.statusText}`);
  const r = await res.json();
  const ms = Math.round(performance.now() - t);
  if (r.compiler_error && r.status !== '0' && !r.program_output && !r.program_error) {
    return { phase: 'compile', stdout: '', stderr: r.compiler_error, exitCode: Number(r.status) || 1, ms, remote: true };
  }
  let stderr = r.program_error ?? '';
  if (r.signal) stderr += `${stderr && !stderr.endsWith('\n') ? '\n' : ''}Killed by signal: ${r.signal}`;
  return { phase: 'run', stdout: r.program_output ?? '', stderr, exitCode: Number(r.status) || 0, ms, remote: true };
}
