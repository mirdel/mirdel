# Testing

This document collects local manual testing notes for Mirdel.

## Local Manual Testing

Install dependencies from the repository root:

```bash
pnpm install
```

Run checks as needed:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

For desktop app development, run the desktop dev script manually from your terminal when needed.

## Auto Update UI Mock

The desktop renderer exposes dev-only helpers for testing the auto update UI without creating a GitHub Release.

Open the Electron renderer DevTools Console and run:

```js
window.__mirdelMockUpdateDownloaded()
```

This simulates an update that has already been downloaded. Use it to verify:

- the update icon in the sidebar
- the update status in Settings > About
- the restart-to-install modal

Run:

```js
window.__mirdelMockReleaseNotes()
```

This simulates the post-upgrade release notes prompt. Use it to verify:

- the release notes modal
- localized changelog rendering
- empty changelog fallback behavior

These helpers are only registered in development builds through `import.meta.env.DEV`.

## Release And Update Testing

Use `RELEASE.md` for the full release workflow.

For quick UI checks, prefer the dev-only mock helpers above. Use the real release flow when validating:

- GitHub Actions packaging
- GitHub Release asset publishing
- update feed generation
- real updater download and install behavior
