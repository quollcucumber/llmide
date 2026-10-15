const LIMIT = 1 << 21;

// Posts output as it is written so a TLE still shows what was printed.
export function makeStreams() {
  let total = 0, truncated = false;
  const write = (stream, text) => {
    if (truncated || !text) return;
    if (total + text.length > LIMIT) {
      text = text.slice(0, LIMIT - total) + '\n[output truncated]\n';
      truncated = true;
    }
    total += text.length;
    self.postMessage({ type: 'output', stdout: stream === 'stdout' ? text : '', stderr: stream === 'stderr' ? text : '' });
  };
  return { write, flush: () => {} };
}
