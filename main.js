const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const ytDlp = require('youtube-dl-exec');
const settingsStore = require('./settings-store');
const shouldAutoOpenDevTools = process.env.ELECTRON_AUTO_DEVTOOLS === 'true';

let mainWindow;
const completedDownloads = new Set();
const downloadQueue = [];
let activeDownload = null;
const downloadControllers = new Map();

function createDownloadController(downloadId) {
  if (!downloadId) return null;
  const controller = { id: downloadId, cancelled: false };
  downloadControllers.set(downloadId, controller);
  return controller;
}

function getDownloadController(downloadId) {
  if (!downloadId) return null;
  return downloadControllers.get(downloadId) || null;
}

function clearDownloadController(downloadId) {
  if (!downloadId) return;
  downloadControllers.delete(downloadId);
}

function createCancelledError(message) {
  const error = new Error(message || 'Download cancelled.');
  error.code = 'DOWNLOAD_CANCELLED';
  error.isCancelled = true;
  return error;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  if (shouldAutoOpenDevTools) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(() => {
  settingsStore.initialize(app);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('get-settings', async () => settingsStore.getAll());

ipcMain.handle('update-settings', async (_event, partial) => {
  const safePartial = partial && typeof partial === 'object' ? partial : {};
  const allowedKeys = ['language', 'theme', 'subtitleLanguages'];
  const filtered = {};
  allowedKeys.forEach(key => {
    if (Object.prototype.hasOwnProperty.call(safePartial, key)) {
      filtered[key] = safePartial[key];
    }
  });

  if (Object.keys(filtered).length === 0) {
    return settingsStore.getAll();
  }

  const updated = settingsStore.update(filtered);
  broadcastSettings(updated);
  return updated;
});

ipcMain.handle('choose-download-folder', async () => {
  const defaultPath = settingsStore.get('downloadFolder') || app.getPath('downloads');
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Choose download folder',
    defaultPath,
    properties: ['openDirectory', 'createDirectory']
  });

  if (canceled || !filePaths.length) {
    return null;
  }

  const updatedSettings = settingsStore.update({ downloadFolder: filePaths[0] });
  broadcastSettings(updatedSettings);
  return updatedSettings;
});

ipcMain.handle('open-download-location', async (_event, { filePath, mode }) => {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Nuk u gjet asnjë shteg skedari për ta hapur.');
  }

  try {
    if (mode === 'file') {
      await shell.openPath(filePath);
    } else {
      shell.showItemInFolder(filePath);
    }
    return { ok: true };
  } catch (error) {
    console.error('[open-download-location] dështoi', error);
    throw new Error('Nuk mund ta hap këtë skedar ose dosje.');
  }
});

ipcMain.handle('open-external', async (_event, url) => {
  if (!url || typeof url !== 'string') {
    throw new Error('Nuk u gjet URL për ta hapur.');
  }

  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (error) {
    console.error('[open-external] dështoi', error);
    throw new Error('Nuk mund të hap këtë lidhje.');
  }
});

ipcMain.handle('read-clipboard-text', async () => {
  try {
    return clipboard.readText() || '';
  } catch (error) {
    console.error('[clipboard] read failed', error);
    return '';
  }
});

ipcMain.handle('write-clipboard-text', async (_event, text) => {
  try {
    if (typeof text === 'string' && text.length) {
      clipboard.writeText(text);
    }
    return { ok: true };
  } catch (error) {
    console.error('[clipboard] write failed', error);
    return { ok: false };
  }
});

ipcMain.handle('check-for-updates', async () => {
  const currentVersion = app.getVersion();
  const repoSlug = 'GorianDriza/AlbaDownload';
  const apiUrl = `https://api.github.com/repos/${repoSlug}/releases/latest`;

  return new Promise(resolve => {
    try {
      const request = https.get(
        apiUrl,
        {
          headers: {
            'User-Agent': 'AlbaDownload-Updater',
            Accept: 'application/vnd.github+json'
          }
        },
        response => {
          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => {
            try {
              if (response.statusCode !== 200) {
                resolve({
                  ok: false,
                  reason: `GitHub ktheu statusin ${response.statusCode}.`,
                  currentVersion
                });
                return;
              }
              const raw = Buffer.concat(chunks).toString('utf8');
              const json = JSON.parse(raw);
              const latestTag = (json.tag_name || json.name || '').replace(/^v/i, '').trim();
              const latestUrl = json.html_url || `https://github.com/${repoSlug}/releases`;

              const assets = Array.isArray(json.assets) ? json.assets : [];
              const windowsAsset =
                assets.find(asset => typeof asset?.name === 'string' && /albadownload-.*-setup\.exe$/i.test(asset.name)) ||
                assets.find(asset => typeof asset?.name === 'string' && asset.name.toLowerCase().endsWith('.exe'));

              const assetUrl = windowsAsset?.browser_download_url || null;
              const assetName = windowsAsset?.name || null;

              if (!latestTag) {
                resolve({
                  ok: false,
                  reason: 'Nuk u gjet versioni i fundit në GitHub.',
                  currentVersion
                });
                return;
              }

              const hasUpdate = isVersionNewer(latestTag, currentVersion);
              resolve({
                ok: true,
                hasUpdate,
                currentVersion,
                latestVersion: latestTag,
                url: latestUrl,
                assetUrl,
                assetName
              });
            } catch (error) {
              console.error('[updates] parsing failed', error);
              resolve({
                ok: false,
                reason: 'Nuk mund të lexoj përgjigjen nga GitHub.',
                currentVersion
              });
            }
          });
        }
      );

      request.on('error', error => {
        console.error('[updates] request failed', error);
        resolve({
          ok: false,
          reason: 'Kërkesa për përditësime dështoi.',
          currentVersion
        });
      });

      request.setTimeout(7000, () => {
        console.warn('[updates] request timed out');
        request.destroy();
        resolve({
          ok: false,
          reason: 'Kërkesa për përditësime skadoi.',
          currentVersion
        });
      });
    } catch (error) {
      console.error('[updates] unexpected error', error);
      resolve({
        ok: false,
        reason: 'Gabim i papritur gjatë kontrollit për përditësime.',
        currentVersion
      });
    }
  });
});

ipcMain.handle('download-update', async (_event, payload) => {
  const sourceUrl = payload?.assetUrl || payload?.url;

  if (!sourceUrl || typeof sourceUrl !== 'string') {
    throw new Error('Nuk u gjet lidhja e instaluesit për ta shkarkuar.');
  }

  const downloadsDir = app.getPath('downloads');
  await fs.promises.mkdir(downloadsDir, { recursive: true });

  let baseFileName = payload?.assetName;
  try {
    if (!baseFileName) {
      const parsed = new URL(sourceUrl);
      baseFileName = path.basename(parsed.pathname) || 'AlbaDownload-Setup.exe';
    }
  } catch {
    baseFileName = baseFileName || 'AlbaDownload-Setup.exe';
  }

  const safeFileName = findUniqueFileName(downloadsDir, baseFileName);
  const finalPath = path.join(downloadsDir, safeFileName);
  const tempPath = `${finalPath}.download`;

  return new Promise(resolve => {
    let settled = false;
    const cleanupAndResolve = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const fileStream = fs.createWriteStream(tempPath);

    const handleResponse = response => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = new URL(response.headers.location, sourceUrl);
        https
          .get(
            redirectUrl,
            {
              headers: {
                'User-Agent': 'AlbaDownload-Updater'
              }
            },
            handleResponse
          )
          .on('error', error => {
            console.error('[download-update] redirect request error', error);
            cleanupAndResolve({
              ok: false,
              reason: 'Shkarkimi i përditësimit dështoi.'
            });
          });
        return;
      }

      if (response.statusCode !== 200) {
        console.error('[download-update] GitHub responded with status', response.statusCode);
        response.resume();
        cleanupAndResolve({
          ok: false,
          reason: `GitHub ktheu statusin ${response.statusCode} gjatë shkarkimit.`
        });
        return;
      }

      response.pipe(fileStream);
    };

    const request = https.get(
      sourceUrl,
      {
        headers: {
          'User-Agent': 'AlbaDownload-Updater'
        }
      },
      handleResponse
    );

    request.on('error', error => {
      console.error('[download-update] request error', error);
      fs.promises.unlink(tempPath).catch(() => {});
      cleanupAndResolve({
        ok: false,
        reason: 'Shkarkimi i përditësimit dështoi.'
      });
    });

    request.setTimeout(15000, () => {
      console.warn('[download-update] request timed out');
      request.destroy();
      fs.promises.unlink(tempPath).catch(() => {});
      cleanupAndResolve({
        ok: false,
        reason: 'Kërkesa për shkarkimin e përditësimit skadoi.'
      });
    });

    fileStream.on('finish', async () => {
      try {
        await fs.promises.rename(tempPath, finalPath);
        cleanupAndResolve({
          ok: true,
          filePath: finalPath,
          fileName: safeFileName
        });
      } catch (error) {
        console.error('[download-update] failed to finalize file', error);
        fs.promises.unlink(tempPath).catch(() => {});
        fs.promises.unlink(finalPath).catch(() => {});
        cleanupAndResolve({
          ok: false,
          reason: 'Nuk mund të përfundoj shkarkimin e përditësimit.'
        });
      }
    });

    fileStream.on('error', error => {
      console.error('[download-update] file stream error', error);
      request.destroy();
      fs.promises.unlink(tempPath).catch(() => {});
      cleanupAndResolve({
        ok: false,
        reason: 'Shkarkimi i përditësimit dështoi.'
      });
    });
  });
});

ipcMain.handle('start-download', async (_event, { url, directory, format = 'mp4', playlist = false, quality = 'auto' }) => {
  if (!url || typeof url !== 'string') {
    throw new Error('Kërkohet një URL videoje e vlefshme');
  }

  const normalizedFormat = format === 'mp3' ? 'mp3' : 'mp4';
  const fallbackDirectory = settingsStore.get('downloadFolder');
  const targetDirectory = directory || fallbackDirectory;

  if (!targetDirectory || typeof targetDirectory !== 'string') {
    throw new Error('Vendos një dosje shkarkimi te Cilësimet para se të shkarkosh.');
  }

  const normalizedDirectory = path.normalize(targetDirectory);
  await fs.promises.mkdir(normalizedDirectory, { recursive: true });

  const downloadId = randomUUID();
  console.log(`[download:${downloadId}] Starting (${normalizedFormat}) -> ${url}`);

  enqueueDownload({
    id: downloadId,
    url: url.trim(),
    directory: normalizedDirectory,
    format: normalizedFormat,
    playlist: Boolean(playlist),
    quality: typeof quality === 'string' && quality ? quality : 'auto'
  });

  return { id: downloadId, status: 'queued', format: normalizedFormat };
});

async function downloadMedia(videoUrl, directory, format, downloadId, playlist, quality, controller) {
  if (isYouTubeUrl(videoUrl)) {
    return downloadYouTubeMedia(videoUrl, directory, format, downloadId, playlist, quality, controller);
  }
  console.log(`[download:${downloadId}] Using direct HTTP download pipeline.`);
  return downloadDirectMedia(videoUrl, directory, format, downloadId, controller);
}

function enqueueDownload(job) {
  completedDownloads.delete(job.id);
  downloadQueue.push(job);

  sendProgress({
    id: job.id,
    status: 'queued',
    fileName: null,
    format: job.format,
    title: null,
    thumbnail: null,
    source: isYouTubeUrl(job.url) ? 'youtube' : 'direct',
    url: job.url
  });

  processNextDownload();
}

async function processNextDownload() {
  if (activeDownload || downloadQueue.length === 0) {
    return;
  }

  const job = downloadQueue.shift();
  activeDownload = job;
  const controller = createDownloadController(job.id);

  try {
    await downloadMedia(job.url, job.directory, job.format, job.id, job.playlist, job.quality, controller);
  } catch (error) {
    console.error(`[download] Failed ${job.id}:`, error);
    const isCancelled = Boolean(error && error.isCancelled);
    sendProgress({
      id: job.id,
      status: isCancelled ? 'cancelled' : 'error',
      message: isCancelled ? 'Shkarkimi u ndërpre nga përdoruesi.' : error.message || 'Download failed.',
      fileName: null,
      format: job.format
    });
  } finally {
    clearDownloadController(job.id);
    activeDownload = null;
    processNextDownload();
  }
}

function downloadDirectMedia(videoUrl, directory, format, downloadId, controller) {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(videoUrl);
    } catch (error) {
      reject(new Error('URL-ja e dhënë nuk është e vlefshme'));
      return;
    }

    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const rawFileName = createSafeFilename(parsedUrl, format);
    const fileName = findUniqueFileName(directory, rawFileName);
    const preview = buildDirectPreview(fileName, videoUrl, format);
    const finalFilePath = path.join(directory, fileName);
    const tempFilePath = `${finalFilePath}.download`;
    const fileStream = fs.createWriteStream(tempFilePath);

    if (controller) {
      controller.tempFilePath = tempFilePath;
      controller.fileStream = fileStream;
    }

    sendProgress({
      id: downloadId,
      status: 'queued',
      fileName,
      format,
      title: preview.title,
      thumbnail: preview.thumbnail,
      source: preview.source,
      url: preview.url
    });

    const handleResponse = response => {
      console.log(`[download:${downloadId}] HTTP response status=${response.statusCode}`);
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        const redirectUrl = new URL(response.headers.location, parsedUrl);
        const nextProtocol = redirectUrl.protocol === 'https:' ? https : http;
        nextProtocol.get(redirectUrl, handleResponse).on('error', reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed with status ${response.statusCode}`));
        return;
      }

      const totalBytes = Number(response.headers['content-length']) || 0;
      let receivedBytes = 0;

      response.on('data', chunk => {
        receivedBytes += chunk.length;
        sendProgress({
          id: downloadId,
          status: 'downloading',
          receivedBytes,
          totalBytes,
          progress: totalBytes ? Math.round((receivedBytes / totalBytes) * 100) : null,
          fileName,
          format,
          title: preview.title,
          thumbnail: preview.thumbnail,
          source: preview.source,
          url: preview.url
        });
      });

      response.pipe(fileStream);
    };

    const request = protocol.get(videoUrl, handleResponse);

    if (controller) {
      controller.request = request;
      if (controller.cancelled) {
        request.destroy();
      }
    }

    request.on('error', error => {
      console.error(`[download:${downloadId}] HTTP request error`, error);
      fs.promises.unlink(tempFilePath).catch(() => {});
      if (controller && controller.cancelled) {
        reject(createCancelledError('Shkarkimi u ndërpre nga përdoruesi.'));
      } else {
        reject(error);
      }
    });

    fileStream.on('finish', async () => {
      console.log(`[download:${downloadId}] HTTP stream finished, finalizing file ${fileName}`);
      try {
        const finalPath = await finalizeDownload(
          tempFilePath,
          finalFilePath,
          format,
          fileName,
          downloadId,
          preview
        );
        resolve({ filePath: finalPath });
      } catch (error) {
        if (controller && controller.cancelled) {
          reject(createCancelledError('Shkarkimi u ndërpre nga përdoruesi.'));
        } else {
          reject(error);
        }
      }
    });

    fileStream.on('error', error => {
      console.error(`[download:${downloadId}] File stream error`, error);
      request.destroy();
      fs.promises.unlink(tempFilePath).catch(() => {});
      if (controller && controller.cancelled) {
        reject(createCancelledError('Shkarkimi u ndërpre nga përdoruesi.'));
      } else {
        reject(error);
      }
    });
  });
}

function createSafeFilename(parsedUrl, format) {
  const extension = format === 'mp3' ? '.mp3' : '.mp4';
  let baseName = path.basename(parsedUrl.pathname);

  if (baseName.includes('?')) {
    baseName = baseName.split('?')[0];
  }

  if (!baseName || baseName === '/' || baseName.length < 3) {
    baseName = 'video-download';
  } else {
    baseName = baseName.replace(/\.[^/.]+$/, '');
  }

  const sanitized = sanitizeFileStem(baseName);
  return `${sanitized}${extension}`;
}

function buildDirectPreview(fileName, url, format) {
  const displayTitle = humanizeFileName(fileName);
  return {
    title: displayTitle,
    thumbnail: null,
    source: 'direct',
    url,
    format
  };
}

function buildYouTubePreview(metadata, baseName, url, format) {
  const title = metadata?.title || baseName;
  const thumbnail = selectBestThumbnail(metadata);
  return {
    title,
    thumbnail,
    source: 'youtube',
    url,
    format
  };
}

function selectBestThumbnail(metadata) {
  if (!metadata) {
    return null;
  }
  if (metadata.thumbnail) {
    return metadata.thumbnail;
  }
  if (Array.isArray(metadata.thumbnails) && metadata.thumbnails.length) {
    const sorted = [...metadata.thumbnails].sort((a, b) => (b?.width || 0) - (a?.width || 0));
    const first = sorted.find(item => Boolean(item?.url));
    return first?.url || null;
  }
  return null;
}

function findUniqueFileName(directory, fileName) {
  const parsed = path.parse(fileName);
  let candidate = fileName;
  let counter = 1;

  while (fs.existsSync(path.join(directory, candidate))) {
    candidate = `${parsed.name} (${counter})${parsed.ext}`;
    counter += 1;
  }

  return candidate;
}

function humanizeFileName(fileName) {
  const withoutExtension = fileName.replace(/\.[^/.]+$/, '');
  try {
    return decodeURIComponent(withoutExtension).replace(/[_\-]+/g, ' ');
  } catch {
    return withoutExtension.replace(/[_\-]+/g, ' ');
  }
}

function sendProgress(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const id = payload && payload.id;
  if (id && completedDownloads.has(id)) {
    if (payload.status !== 'completed' && payload.status !== 'error') {
      return;
    }
  }

  mainWindow.webContents.send('download-progress', payload);
}

function broadcastSettings(settingsPayload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings-updated', settingsPayload || settingsStore.getAll());
  }
}

function convertToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn(ffmpegPath, [
      '-y',
      '-i',
      inputPath,
      '-vn',
      '-codec:a',
      'libmp3lame',
      '-qscale:a',
      '2',
      outputPath
    ]);

    ffmpeg.on('error', reject);

    ffmpeg.stderr.on('data', data => {
      const message = data.toString();
      if (message.toLowerCase().includes('error')) {
        console.error(message.trim());
      }
    });

    ffmpeg.on('close', code => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`MP3 conversion failed (exit code ${code}).`));
      }
    });
  });
}

async function finalizeDownload(tempPath, finalFilePath, format, fileName, downloadId, preview = {}) {
  try {
    let finalPath = finalFilePath;
    if (format === 'mp3') {
      if (!ffmpegPath) {
        throw new Error('MP3 conversion requires ffmpeg-static. Please run npm install.');
      }

      sendProgress({
        id: downloadId,
        status: 'processing',
        stage: 'converting',
        message: 'Po konvertohet në MP3...',
        fileName,
        format,
        title: preview.title || fileName,
        thumbnail: preview.thumbnail || null,
        source: preview.source || 'direct',
        url: preview.url
      });

      finalPath = await convertToMp3(tempPath, finalFilePath);
      await fs.promises.unlink(tempPath).catch(() => {});
    } else {
      await fs.promises.rename(tempPath, finalFilePath);
    }

    const stats = await fs.promises.stat(finalPath);
    sendProgress({
      id: downloadId,
      status: 'completed',
      receivedBytes: stats.size,
      totalBytes: stats.size,
      progress: 100,
      fileName,
      filePath: finalPath,
      format,
      title: preview.title || fileName,
      thumbnail: preview.thumbnail || null,
      source: preview.source || 'direct',
      url: preview.url
    });
    if (downloadId) {
      completedDownloads.add(downloadId);
    }
    recordDownloadHistory({
      id: downloadId,
      filePath: finalPath,
      fileName,
      format,
      title: preview.title || fileName,
      thumbnail: preview.thumbnail || null,
      source: preview.source || 'direct',
      url: preview.url
    });

    return finalPath;
  } catch (error) {
    fs.promises.unlink(tempPath).catch(() => {});
    fs.promises.unlink(finalFilePath).catch(() => {});
    throw error;
  }
}

const METADATA_EAGER_TIMEOUT = 1500;

async function downloadYouTubeMedia(videoUrl, directory, format, downloadId, playlist, quality, controller) {
  console.log(`[download:${downloadId}] Detected YouTube URL, requesting metadata...`);

  const metadataPromise = fetchYouTubeMetadata(videoUrl, downloadId).catch(error => {
    console.warn(`[download:${downloadId}] Metadata fetch failed`, error);
    return null;
  });

  const quickMetadata = await Promise.race([
    metadataPromise,
    new Promise(resolve => setTimeout(() => resolve(null), METADATA_EAGER_TIMEOUT))
  ]);

  if (quickMetadata) {
    console.log(`[download:${downloadId}] Metadata loaded quickly (title="${quickMetadata.title || 'unknown'}")`);
  } else {
    console.warn(`[download:${downloadId}] Metadata unavailable within ${METADATA_EAGER_TIMEOUT}ms, using fallback.`);
  }

  const fallbackStem = sanitizeFileStem(extractYouTubeId(videoUrl) || 'youtube-download');
  const baseName = sanitizeFileStem(quickMetadata?.title || quickMetadata?.id || fallbackStem);
  const extension = format === 'mp3' ? 'mp3' : 'mp4';
  const uniqueBase = findUniqueBaseName(directory, baseName, extension);
  const outputTemplate = path.join(directory, `${uniqueBase}.%(ext)s`);
  const finalFilePath = path.join(directory, `${uniqueBase}.${extension}`);
  const ytOptions = buildYtDlpOptions(format, outputTemplate, {
    playlist: Boolean(playlist),
    quality: typeof quality === 'string' && quality ? quality : 'auto'
  });
  let preview = buildYouTubePreview(quickMetadata, uniqueBase, videoUrl, format);

  metadataPromise.then(fullMetadata => {
    if (fullMetadata && !quickMetadata) {
      console.log(`[download:${downloadId}] Metadata arrived late (title="${fullMetadata.title || 'unknown'}")`);
      preview = buildYouTubePreview(fullMetadata, baseName, videoUrl, format);
      sendProgress({
        id: downloadId,
        status: 'metadata',
        fileName: `${uniqueBase}.${extension}`,
        format,
        title: preview.title,
        thumbnail: preview.thumbnail,
        source: preview.source,
        url: preview.url
      });
    }
  });
  console.log(`[download:${downloadId}] Launching yt-dlp with format=${format}`);
  sendProgress({
    id: downloadId,
    status: 'processing',
    stage: 'initializing',
    message: 'Po përgatitet shkarkimi nga YouTube...',
    fileName: `${uniqueBase}.${extension}`,
    format,
    title: preview.title,
    thumbnail: preview.thumbnail,
    source: preview.source,
    url: preview.url
  });

  return new Promise((resolve, reject) => {
    const runner = ytDlp.exec(videoUrl, ytOptions);

    if (controller) {
      controller.runner = runner;
      controller.finalFilePath = finalFilePath;
    }

    const onError = error => {
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    let lastErrorLine = null;

    if (runner.stderr) {
      runner.stderr.setEncoding('utf8');
      runner.stderr.on('data', data => {
        const text = data.toString();
        lastErrorLine = text.trim() || lastErrorLine;
        parseYtDlpProgress(text, `${baseName}.${extension}`, format, downloadId, preview);
      });
    }

    if (runner.stdout) {
      runner.stdout.setEncoding('utf8');
      runner.stdout.on('data', data => {
        const text = data.toString();
        parseYtDlpProgress(text, `${baseName}.${extension}`, format, downloadId, preview);
      });
    }

    runner.on('error', error => {
      console.error(`[download:${downloadId}] youtube-dl process error`, error);
      onError(error);
    });

    runner.on('close', async code => {
      console.log(`[download:${downloadId}] youtube-dl closed with code ${code}`);
      if (code === 0) {
        try {
          const stats = await fs.promises.stat(finalFilePath);
          sendProgress({
            id: downloadId,
            status: 'completed',
            receivedBytes: stats.size,
            totalBytes: stats.size,
            progress: 100,
            fileName: `${path.basename(finalFilePath)}`,
            filePath: finalFilePath,
            format,
            title: preview.title,
            thumbnail: preview.thumbnail,
            source: preview.source,
            url: preview.url
          });
          if (downloadId) {
            completedDownloads.add(downloadId);
          }
          recordDownloadHistory({
            id: downloadId,
            filePath: finalFilePath,
            fileName: path.basename(finalFilePath),
            format,
            title: preview.title,
            thumbnail: preview.thumbnail,
            source: preview.source,
            url: preview.url
          });
          resolve({ filePath: finalFilePath });
        } catch (error) {
          if (controller && controller.cancelled) {
            reject(createCancelledError('Shkarkimi u ndërpre nga përdoruesi.'));
          } else {
            reject(error);
          }
        }
      } else {
        if (controller && controller.cancelled) {
          reject(createCancelledError('Shkarkimi u ndërpre nga përdoruesi.'));
        } else {
          const message = lastErrorLine || `youtube-dl exited with code ${code}`;
          console.error(`[download:${downloadId}] ${message}`);
          reject(new Error(message));
        }
      }
    });
  });
}

function sanitizeFileStem(value, fallback = 'video-download') {
  const trimmed = (value || '').trim();
  const sanitized = trimmed.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, ' ').replace(/\.$/, '');
  const safe = sanitized || fallback;
  return safe.slice(0, 120);
}

function isYouTubeUrl(candidate) {
  try {
    const { hostname } = new URL(candidate);
    const normalizedHost = hostname.replace(/^www\./, '').toLowerCase();
    return normalizedHost.includes('youtube.com') || normalizedHost.includes('youtu.be');
  } catch {
    return false;
  }
}

function extractYouTubeId(videoUrl) {
  try {
    const parsed = new URL(videoUrl);
    if (parsed.hostname.includes('youtu.be')) {
      return parsed.pathname.replace('/', '');
    }
    if (parsed.hostname.includes('youtube.com')) {
      const videoId = parsed.searchParams.get('v');
      if (videoId) {
        return videoId;
      }
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts[0] === 'shorts' && parts[1]) {
        return parts[1];
      }
      if (parts[0] === 'live' && parts[1]) {
        return parts[1];
      }
    }
  } catch (error) {
    console.warn('Failed to extract YouTube ID from URL', videoUrl, error);
  }
  return null;
}

function findUniqueBaseName(directory, baseName, extensionWithoutDot) {
  const ext = extensionWithoutDot.startsWith('.') ? extensionWithoutDot.slice(1) : extensionWithoutDot;
  let candidate = baseName;
  let counter = 1;

  while (fs.existsSync(path.join(directory, `${candidate}.${ext}`))) {
    candidate = `${baseName} (${counter})`;
    counter += 1;
  }

  return candidate;
}

function recordDownloadHistory(entry) {
  try {
    const existing = settingsStore.get('downloadHistory') || [];
    const normalized = {
      id: entry.id || randomUUID(),
      filePath: entry.filePath,
      fileName: entry.fileName,
      format: entry.format,
      title: entry.title,
      thumbnail: entry.thumbnail || null,
      source: entry.source || 'direct',
      url: entry.url || null,
      completedAt: Date.now()
    };

    const MAX_HISTORY = 100;
    const next = [...existing, normalized].slice(-MAX_HISTORY);
    const updatedSettings = settingsStore.update({ downloadHistory: next });
    broadcastSettings(updatedSettings);
  } catch (error) {
    console.error('Nuk mund ta ruaj historikun e shkarkimeve:', error);
  }
}

function cancelDownload(downloadId) {
  if (!downloadId) {
    return { ok: false, reason: 'Mungon ID e shkarkimit.' };
  }

  // Cancel queued download
  const queuedIndex = downloadQueue.findIndex(job => job.id === downloadId);
  if (queuedIndex !== -1) {
    const [job] = downloadQueue.splice(queuedIndex, 1);
    sendProgress({
      id: job.id,
      status: 'cancelled',
      message: 'Shkarkimi u hoq nga radha.',
      fileName: null,
      format: job.format,
      title: null,
      thumbnail: null,
      source: isYouTubeUrl(job.url) ? 'youtube' : 'direct',
      url: job.url
    });
    clearDownloadController(downloadId);
    return { ok: true, queuedOnly: true };
  }

  // Cancel active download
  const controller = getDownloadController(downloadId);
  if (controller) {
    controller.cancelled = true;
    if (controller.request && typeof controller.request.destroy === 'function') {
      controller.request.destroy();
    }
    if (controller.fileStream && typeof controller.fileStream.destroy === 'function') {
      controller.fileStream.destroy();
    }
    if (controller.runner && typeof controller.runner.kill === 'function') {
      controller.runner.kill('SIGTERM');
    }
    return { ok: true, active: true };
  }

  return { ok: false, reason: 'Nuk u gjet asnjë shkarkim me këtë ID.' };
}

function isVersionNewer(latest, current) {
  const toParts = v =>
    String(v || '')
      .replace(/^v/i, '')
      .split('.')
      .map(x => parseInt(x, 10) || 0);

  const a = toParts(latest);
  const b = toParts(current);

  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}

function buildYtDlpOptions(format, outputTemplate, { playlist = false, quality = 'auto' } = {}) {
  const subtitleLanguages = settingsStore.get('subtitleLanguages') || ['sq', 'en'];

  const baseOptions = {
    output: outputTemplate,
    noPart: true,
    restrictFilenames: false,
    ffmpegLocation: ffmpegPath,
    noPlaylist: !playlist,
    yesPlaylist: Boolean(playlist),
    addHeader: ['referer: https://www.youtube.com', 'user-agent: Mozilla/5.0']
  };

  if (Array.isArray(subtitleLanguages) && subtitleLanguages.length > 0) {
    baseOptions.writeSub = true;
    baseOptions.subLang = subtitleLanguages.join(',');
    baseOptions.subFormat = 'best';
  }

  if (format === 'mp3') {
    return {
      ...baseOptions,
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: '0',
      format: 'bestaudio/best'
    };
  }

  let formatSelector = 'bv*+ba/b';
  const sanitizedQuality = String(quality || 'auto').toLowerCase();

  if (sanitizedQuality === '1080p') {
    formatSelector = 'bestvideo[height<=1080]+bestaudio/best/best[height<=1080]';
  } else if (sanitizedQuality === '720p') {
    formatSelector = 'bestvideo[height<=720]+bestaudio/best/best[height<=720]';
  } else if (sanitizedQuality === '480p') {
    formatSelector = 'bestvideo[height<=480]+bestaudio/best/best[height<=480]';
  }

  return {
    ...baseOptions,
    format: formatSelector,
    mergeOutputFormat: 'mp4'
  };
}

async function fetchYouTubeMetadata(videoUrl, downloadId, timeoutMs = 5000) {
  return new Promise(resolve => {
    try {
      const oEmbedUrl = new URL('https://www.youtube.com/oembed');
      oEmbedUrl.searchParams.set('url', videoUrl);
      oEmbedUrl.searchParams.set('format', 'json');

      const request = https.get(
        oEmbedUrl,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari',
            Accept: 'application/json'
          }
        },
        response => {
          if (response.statusCode !== 200) {
            console.warn(
              `[download:${downloadId || 'meta'}] oEmbed responded with status ${response.statusCode}, skipping metadata.`
            );
            response.resume();
            resolve(null);
            return;
          }

          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => {
            try {
              const raw = Buffer.concat(chunks).toString('utf8');
              const json = JSON.parse(raw);
              resolve({
                title: json.title,
                thumbnail: json.thumbnail_url,
                author: json.author_name
              });
            } catch (error) {
              console.warn(
                `[download:${downloadId || 'meta'}] Failed to parse oEmbed response, skipping metadata.`,
                error
              );
              resolve(null);
            }
          });
        }
      );

      request.on('error', error => {
        console.warn(`[download:${downloadId || 'meta'}] oEmbed request failed, skipping metadata.`, error);
        resolve(null);
      });

      request.setTimeout(timeoutMs, () => {
        console.warn(`[download:${downloadId || 'meta'}] oEmbed request timed out after ${timeoutMs}ms.`);
        request.destroy();
        resolve(null);
      });
    } catch (error) {
      console.warn(`[download:${downloadId || 'meta'}] Failed to build oEmbed URL, skipping metadata.`, error);
      resolve(null);
    }
  });
}

function parseYtDlpProgress(chunk, fileName, format, downloadId, preview) {
  const match = chunk.match(/\[download\]\s+([\d.]+)%/);
  if (match) {
    let progressNumber = Number(match[1]);
    if (!Number.isFinite(progressNumber)) {
      return;
    }
    if (progressNumber >= 99.5) {
      progressNumber = 100;
    }
    progressNumber = Math.min(100, Math.max(0, progressNumber));
    console.log(`[download:${downloadId}] yt-dlp progress ${progressNumber}%`);
    sendProgress({
      id: downloadId,
      status: 'downloading',
      receivedBytes: null,
      totalBytes: null,
      progress: Math.round(progressNumber),
      fileName,
      format,
      title: preview?.title || fileName,
      thumbnail: preview?.thumbnail || null,
      source: preview?.source || 'youtube',
      url: preview?.url
    });
  }

  if (format === 'mp3' && /\[ExtractAudio]/i.test(chunk)) {
    sendProgress({
      id: downloadId,
      status: 'processing',
      stage: 'converting',
      message: 'Po konvertohet në MP3...',
      fileName,
      format,
      title: preview?.title || fileName,
      thumbnail: preview?.thumbnail || null,
      source: preview?.source || 'youtube',
      url: preview?.url
    });
  }
}

ipcMain.handle('cancel-download', async (_event, payload) => {
  const downloadId = payload && payload.id;
  const result = cancelDownload(downloadId);
  return result;
});
