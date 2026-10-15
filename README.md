# vibe-ide

An online IDE where you write roughly what you mean. When you hit **Vibe & Run**, your file goes to Gemini, which works out what you were trying to write, fixes it, and replaces the file in the editor. Then the result runs like in a normal online IDE.

- **Languages:** C++ and Python.
- **AI:** Google Gemini. The deployed site embeds a shared key from the `GEMINI_API_KEY` Actions secret (as `VITE_GEMINI_API_KEY` at build time). That key is visible in the shipped JS, so use a key from a project **without billing**, restricted in Google Cloud Console → Credentials to HTTP referrer `https://quollcucumber.github.io/*` and to the Generative Language API only. Users can paste their own key (free at <https://aistudio.google.com/apikey>) in settings; it is kept in `localStorage`. Requests go to `generativelanguage.googleapis.com` with the code, stdin, and the last error.
- **Runners:**
  - **In-browser (default):**
    - C++ uses [clang 22 compiled to WebAssembly](https://github.com/YoWASP/clang) with libc++ and a `bits/stdc++.h` shim. Expect about a 27 MB gzipped download on first use, roughly 3–5 s per compile, and run times around 2–3× native. There are no C++ exceptions: `throw` aborts.
    - Python uses [Pyodide](https://pyodide.org), self-hosted from `public/pyodide`.
    - Runs happen in Web Workers with a configurable time limit.
  - **Wandbox:** sends your code to <https://wandbox.org> and runs it with real g++ 13 (`-O2 -std=gnu++20`) or CPython 3.13.
- **Undo AI:** restores the file from before the last rewrite. **Run as-is** skips the AI.

Shortcuts: `Ctrl+Enter` for Vibe & Run, `Ctrl+Shift+Enter` for Run as-is.

## Development

```sh
npm install
echo 'VITE_GEMINI_API_KEY=...' > .env.local   # optional shared key for local dev
npm run dev     # http://localhost:5173 (predev copies Pyodide into public/pyodide)
npm run lint
npm run build
```

Pushes to `main` deploy to GitHub Pages through `.github/workflows/deploy.yml`. To enable it, go to Settings → Pages → Source and choose **GitHub Actions**, then add the `GEMINI_API_KEY` repository secret.
