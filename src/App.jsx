import { useCallback, useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { fixCode, listModels, DEFAULT_MODEL } from './lib/gemini.js';
import { runCode } from './lib/runners.js';
import { SAMPLES } from './samples.js';
import './App.css';

const LANGS = { cpp: { label: 'C++', ext: cpp() }, python: { label: 'Python', ext: python() } };
const SHARED_KEY = import.meta.env.VITE_GEMINI_API_KEY ?? '';
const RUNNERS = { browser: 'In-browser', wandbox: 'Wandbox (real g++/CPython)' };

function useStored(key, initial) {
  const [value, setValue] = useState(() => {
    const raw = localStorage.getItem(key);
    return raw === null ? initial : JSON.parse(raw);
  });
  useEffect(() => localStorage.setItem(key, JSON.stringify(value)), [key, value]);
  return [value, setValue];
}

export default function App() {
  const [language, setLanguage] = useStored('vibe.language', 'cpp');
  const [codes, setCodes] = useStored('vibe.codes', { cpp: SAMPLES.cpp.code, python: SAMPLES.python.code });
  const [stdins, setStdins] = useStored('vibe.stdins', { cpp: SAMPLES.cpp.stdin, python: SAMPLES.python.stdin });
  const [runners, setRunners] = useStored('vibe.runners', { cpp: 'browser', python: 'browser' });
  const [apiKey, setApiKey] = useStored('vibe.geminiKey', '');
  const [model, setModel] = useStored('vibe.model', DEFAULT_MODEL);
  const [timeLimit, setTimeLimit] = useStored('vibe.timeLimit', 5);
  const [history, setHistory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState(null);
  const [result, setResult] = useState(null);
  const [lastError, setLastError] = useState({});
  const key = apiKey || SHARED_KEY;
  const [showSettings, setShowSettings] = useState(!key);
  const [flash, setFlash] = useState(0);
  const abortRef = useRef(null);

  const code = codes[language];
  const stdin = stdins[language];
  const runner = runners[language];
  const setCode = (c) => setCodes((all) => ({ ...all, [language]: c }));

  const go = useCallback(async (useAI) => {
    if (busy) return;
    if (useAI && !key) { setShowSettings(true); return; }
    const abort = new AbortController();
    abortRef.current = abort;
    setBusy(true);
    setResult(null);
    let source = code;
    try {
      if (useAI) {
        setStatus(`${model} is figuring out what you meant…`);
        setNote(null);
        const fixed = await fixCode({
          key, model, language: LANGS[language].label, code, stdin,
          lastError: lastError[language], signal: abort.signal, onStatus: setStatus,
        });
        setNote(fixed);
        if (fixed.code !== code) {
          setHistory((h) => [...h, { language, code }].slice(-50));
          setCode(fixed.code);
          setFlash((f) => f + 1);
        }
        source = fixed.code;
      }
      const r = await runCode({
        language, runner, code: source, stdin, timeLimitMs: timeLimit * 1000, signal: abort.signal,
        onStatus: setStatus,
        onOutput: (o) => setResult({ phase: 'run', running: true, ...o }),
      });
      setResult(r);
      const failed = r.phase === 'compile' || r.exitCode !== 0;
      setLastError((e) => ({ ...e, [language]: failed ? `${r.phase === 'compile' ? 'Compile error' : `Exit code ${r.exitCode}`}:\n${r.stderr.slice(-4000)}` : '' }));
    } catch (e) {
      if (e.name !== 'AbortError') setResult({ phase: 'error', stdout: '', stderr: String(e.message ?? e), exitCode: -1 });
    } finally {
      setBusy(false);
      setStatus('');
    }
  }, [busy, key, code, stdin, language, model, runner, timeLimit, lastError]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); go(!e.shiftKey); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const undo = () => {
    const last = history.at(-1);
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setLanguage(last.language);
    setCodes((all) => ({ ...all, [last.language]: last.code }));
    setNote(null);
  };

  const canUndo = history.length > 0 && history.at(-1).language === language;

  return (
    <div className="app">
      <header>
        <h1>vibe<span>ide</span></h1>
        <p className="tagline">write roughly what you mean. the AI rewrites your file. then it runs.</p>
        <div className="toolbar">
          <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={busy}>
            {Object.entries(LANGS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={runner} onChange={(e) => setRunners((r) => ({ ...r, [language]: e.target.value }))} disabled={busy} title="Where the code runs">
            {Object.entries(RUNNERS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="primary" onClick={() => go(true)} disabled={busy} title="Ctrl+Enter">Vibe &amp; Run</button>
          <button onClick={() => go(false)} disabled={busy} title="Ctrl+Shift+Enter">Run as-is</button>
          {busy && <button onClick={() => abortRef.current?.abort()} title="Cancel the Gemini/Wandbox request">Cancel</button>}
          <button onClick={undo} disabled={busy || !canUndo} title="Restore the code from before the last AI rewrite">Undo AI</button>
          <button className="icon" onClick={() => setShowSettings(true)} title="Settings">⚙</button>
        </div>
      </header>

      <main>
        <section className={`editor flash-${flash % 2}`} key={language}>
          <CodeMirror
            value={code}
            onChange={setCode}
            theme={oneDark}
            extensions={[LANGS[language].ext]}
            height="100%"
            style={{ height: '100%' }}
            readOnly={busy}
            basicSetup={{ tabSize: 4 }}
          />
        </section>

        <aside>
          <label className="panel">
            <span className="panel-title">stdin</span>
            <textarea value={stdin} onChange={(e) => setStdins((s) => ({ ...s, [language]: e.target.value }))} spellCheck={false} />
          </label>

          {note && (
            <div className="panel note">
              <span className="panel-title">what {note.model} thinks you meant</span>
              <p className="intent">{note.intent}</p>
              {note.changes.length > 0
                ? <ul>{note.changes.map((c, i) => <li key={i}>{c}</li>)}</ul>
                : <p className="muted">No changes needed. Your code was already correct.</p>}
            </div>
          )}

          <div className="panel output">
            <span className="panel-title">
              output
              {result && !result.running && <ResultBadge r={result} />}
            </span>
            {status && <p className="status"><span className="spinner" />{status}</p>}
            {result && (
              <pre>
                {result.stdout}
                {result.stderr && <span className="stderr">{result.stdout && !result.stdout.endsWith('\n') ? '\n' : ''}{result.stderr}</span>}
              </pre>
            )}
            {!result && !status && <p className="muted">Ctrl+Enter to vibe &amp; run, Ctrl+Shift+Enter to run as-is.</p>}
          </div>
        </aside>
      </main>

      {showSettings && (
        <Settings
          apiKey={apiKey} setApiKey={setApiKey} activeKey={key} model={model} setModel={setModel}
          timeLimit={timeLimit} setTimeLimit={setTimeLimit} onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

function ResultBadge({ r }) {
  const times = r.remote
    ? `wandbox round trip ${r.ms} ms`
    : [r.compileMs != null && `compile ${r.compileMs} ms`, r.ms != null && r.phase === 'run' && `run ${r.ms} ms`].filter(Boolean).join(' · ');
  let label, cls;
  if (r.phase === 'error') [label, cls] = ['error', 'bad'];
  else if (r.phase === 'compile') [label, cls] = ['compile error', 'bad'];
  else if (r.tle) [label, cls] = ['TLE', 'bad'];
  else if (r.exitCode !== 0) [label, cls] = [`exit ${r.exitCode}`, 'bad'];
  else [label, cls] = ['ok', 'good'];
  return <span className="badges"><span className={`badge ${cls}`}>{label}</span>{times && <span className="muted">{times}</span>}</span>;
}

function Settings({ apiKey, setApiKey, activeKey, model, setModel, timeLimit, setTimeLimit, onClose }) {
  const [draft, setDraft] = useState(apiKey);
  const [models, setModels] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeKey) return;
    let live = true;
    listModels(activeKey).then((m) => live && setModels(m), (e) => live && setError(e.message));
    return () => { live = false; };
  }, [activeKey]);

  const save = () => { setError(''); setApiKey(draft.trim()); };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>
        <label>
          {SHARED_KEY ? 'Your own Gemini API key (optional)' : 'Gemini API key'}
          <div className="row">
            <input type="password" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={SHARED_KEY ? 'Leave empty to use the site’s key' : 'AIza…'} autoFocus={!SHARED_KEY} />
            <button onClick={save} disabled={draft.trim() === apiKey}>Save</button>
            {SHARED_KEY && apiKey && <button onClick={() => { setDraft(''); setApiKey(''); }}>Use site key</button>}
          </div>
        </label>
        <p className="muted small">
          {SHARED_KEY && 'This site comes with a shared key, so you only need your own if the shared one hits its rate limit. '}
          Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>.
          Your key is stored in this browser only. Your code and stdin are sent to Google's Gemini API.
        </p>
        <label>
          Model
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {[...new Set([model, ...models])].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>
        <label>
          Time limit (in-browser runs), seconds
          <input type="number" min="1" max="60" value={timeLimit} onChange={(e) => setTimeLimit(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
        </label>
        {error && <p className="stderr small">{error}</p>}
        <p className="muted small">
          C++ in-browser uses clang 22 compiled to WebAssembly (a ~27 MB download the first time, no exceptions, libc++).
          Wandbox sends your code to wandbox.org and runs it with real g++ 13 / CPython 3.13.
        </p>
        <div className="row end"><button className="primary" onClick={onClose}>Done</button></div>
      </div>
    </div>
  );
}
