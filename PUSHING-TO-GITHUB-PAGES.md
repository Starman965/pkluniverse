# Pushing To GitHub Pages

This repo is already configured to deploy GitHub Pages automatically from pushes to `main`.

## Normal flow

From PowerShell in the project root:

```powershell
git status --short --branch
npm run build
git add .
git commit -m "Describe the release"
git push origin main
```

That push triggers `.github/workflows/deploy-pages.yml`, which builds the app and publishes the `dist` output to GitHub Pages.

## If Windows locks the `dist` folder

Sometimes local build verification fails because Windows is still holding a lock on `dist`.

If that happens, verify the build with a fresh output folder instead:

```powershell
npx vite build --outDir dist-pages-check
```

That does not affect the GitHub Pages deployment. The GitHub Actions workflow still builds normally on GitHub.

## What I should usually exclude from commits

These should generally stay out of release commits:

- `vite.config.js.timestamp-*.mjs`
- `dist-pages-check/`
- local shortcut files like `*.url` unless you specifically want them in the repo

## Quick reminder for future chats

If you ask me to "push this version to GitHub Pages," the safe default flow is:

1. Check `git status`.
2. Confirm the intended files.
3. Run a local build check.
4. Commit the release changes.
5. Push `main`.
6. Optionally verify the Pages deployment finished.
