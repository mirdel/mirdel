# Third-Party Notices

This desktop application bundles and redistributes third-party software.

## Included Components

- **SearXNG**  
  License: **AGPL-3.0-or-later**  
  Source in this repository: `packages/desktop/searxng/source`  
  Included license file: `packages/desktop/searxng/source/LICENSE`

- **Bundled Python Runtime** (downloaded at build/release stage)  
  Source: `astral-sh/python-build-standalone` releases  
  The runtime is prepared by `packages/desktop/scripts/prepare-python-runtime.mjs`  
  and redistributed in packaged app resources.

- **Built-in skills packaged with the app** (`builtin-skills/*`)  
  License files are included in each skill directory, for example:  
  `packages/desktop/builtin-skills/*/LICENSE.txt`

## Node/Electron Dependencies

- This app also bundles third-party npm dependencies from `package.json` and `pnpm-lock.yaml`.
- Their original licenses apply to their respective packages.

## Attribution Scope

This file is a high-level notice for bundled third-party components with explicit in-repo license files.
For full transitive dependency attribution, use the lockfile-based dependency inventory in this repository.
