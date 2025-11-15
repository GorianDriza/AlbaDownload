# Video Downloader

Basic Electron application that downloads a video file from any direct URL and ships with packaging scripts that create a Windows installer (NSIS).

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later (Electron currently bundles its own Chromium).
- npm (bundled with Node).

## Getting started

```bash
cd video-downloader
npm install
npm start
```

`npm start` first bundles the React renderer with esbuild and then launches the Electron app. If you want to rebuild the UI bundle without launching Electron you can run `npm run build:renderer`.

### Configure the download folder

Use the **Settings** button in the top-right corner of the UI to select the folder where downloads will be saved. The folder is persisted under Electron's `userData` directory, so it will still be selected the next time you open the app.

### Choose the download format

Below the URL input you'll find MP4 (video) and MP3 (audio) options. MP3 downloads are created by piping the downloaded file through [ffmpeg-static](https://www.npmjs.com/package/ffmpeg-static), so you don't need to install FFmpeg yourself; just make sure `npm install` pulled dependencies successfully.

### Downloading from YouTube

Paste any `youtube.com` or `youtu.be` URL into the field and select MP4 or MP3. The app spawns [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) through [`yt-dlp-exec`](https://www.npmjs.com/package/yt-dlp-exec), then pipes the result through FFmpeg for MP3 conversions. This means you can grab the audio track from a video in one click without installing extra binaries.

## Building a Windows installer

```bash
npm run dist
```

The generated `video-downloader-<version>-setup.exe` file in `dist/` can be double-clicked to install the app on Windows. The NSIS configuration allows the user to pick the installation directory.

## App overview

- `main.js` boots the Electron process, handles IPC events, and streams downloads to disk with simple progress notifications. It now detects YouTube URLs and shells out to `yt-dlp` for robust fetching.
- `ffmpeg-static` is bundled so the main process can transcode any download to MP3 when requested (and handle YouTube audio extraction).
- `preload.js` exposes a tiny bridge API to the renderer to keep context isolation intact.
- `settings-store.js` keeps the chosen download folder on disk (JSON file under the Electron `userData` path).
- The renderer is written in modern React (`renderer/index.jsx`) and is compiled via esbuild into `renderer/dist/bundle.js`, providing the UI, progress updates, Settings modal, live preview card, and download history list with per-item progress bars.

Feel free to customize the styling, add tray/menu integration, or wire in a more specialized downloader library for sites that require auth or custom protocols.

## Releasing a new version

This project includes a small helper script to bump the version, commit, and tag a release.

1. Make sure your working tree is clean and your changes are already committed.
2. Decide the next semantic version (for example, `1.2.7` in `MAJOR.MINOR.PATCH` format).
3. Run:

   ```bash
   npm run release -- 1.2.7
   ```

What this does under the hood:

- Updates the `version` field in `package.json` (and `package-lock.json` if present).
- Runs `git add` for those files and creates a commit: `chore: release v1.2.7`.
- Pushes the commit to your default remote.
- Creates a Git tag `v1.2.7` and pushes the tag.

In the GitHub repo, pushing the tag is intended to trigger CI (GitHub Actions) which builds the Windows installer and publishes a GitHub Release for that version.

### Suggested release checklist

Before running `npm run release`, it helps to follow a quick checklist:

- Pull the latest changes from `main` / `master`.
- Run `npm install` if dependencies changed.
- Run and verify the app locally with `npm start`.
- Optionally build the installer locally with `npm run dist` to ensure it still compiles.
- Update any user-facing docs or changelog if you keep one.
- Only then run `npm run release -- <next-version>` to bump, commit, and tag the new version.
