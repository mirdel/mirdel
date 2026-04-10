# Bundled SearXNG Runtime Layout

`SearxngServerManager` expects this layout at runtime:

```
resources/
  searxng/
    settings.yml
    source/
      searx/
        webapp.py
      ...
  .runtime/
    python/
      darwin-arm64/bin/python3
      darwin-x64/bin/python3
      win32-x64/python.exe
      win32-arm64/python.exe
```

Notes:

- `source/` is a pinned SearXNG source snapshot committed in this repository.
- `settings.yml` keeps local defaults and enables `json` format for API usage.
- `.runtime/python/*` is shared base Python runtime for script execution and venv creation.
  It is prepared during packaging via `pnpm run prepare:python-runtime`.
- SearXNG Python dependencies are installed directly into `.runtime/python/<target>`
  during packaging via `pnpm run prepare:searxng-python-deps`.
- In development/build workspace, generated runtime assets are staged under
  `packages/desktop/.runtime/*` before electron-builder copies them into
  `resources/.runtime/*`.
