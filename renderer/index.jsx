import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

const DEFAULT_VIDEO_URL = '';

const electronAPI = window.electronAPI || {
  getSettings: async () => ({ downloadFolder: null, downloadHistory: [], language: 'sq', theme: 'system' }),
  updateSettings: async () => ({}),
  chooseDownloadFolder: async () => null,
  startDownload: async () => {},
  cancelDownload: async () => ({ ok: false }),
  onDownloadProgress: () => () => {},
  onSettingsUpdated: () => () => {},
  openDownloadLocation: () => Promise.resolve(),
  checkForUpdates: async () => ({ ok: false }),
  downloadUpdate: async () => ({ ok: false }),
  openExternal: () => Promise.resolve(),
  readClipboardText: async () => '',
  writeClipboardText: async () => ({ ok: false })
};

const UI_STRINGS = {
  sq: {
    ready: 'Gati',
    appDescription:
      'Ngjit një URL videoje (mbështet edhe YouTube) dhe ky aplikacion do ta shkarkojë për ty.',
    urlLabel: 'URL e videos',
    urlPlaceholder: 'https://example.com/video.mp4',
    formatLabel: 'Formati',
    formatMp4: 'MP4 (video)',
    formatMp3: 'MP3 (audio)',
    qualityLabel: 'Cilësia (YouTube)',
    qualityAuto: 'Automatike',
    quality1080p: '1080p (nëse është në dispozicion)',
    quality720p: '720p',
    quality480p: '480p',
    playlistLabel: 'Playlist',
    playlistCaption: 'Shkarko të gjithë playlistën (nëse URL është playlist)',
    downloadFolderLabel: 'Dosja e shkarkimeve',
    downloadFolderEmpty: 'Nuk është zgjedhur dosje',
    downloadFolderHint: 'Ndryshoje nga Cilësimet.',
    downloadButtonIdle: 'Shkarko',
    downloadButtonBusy: 'Duke punuar...',
    settingsButton: 'Cilësimet',
    settingsTitle: 'Cilësimet',
    settingsDownloadFolder: 'Dosja e shkarkimeve',
    settingsChooseFolder: 'Zgjidh dosjen',
    settingsUpdatesLabel: 'Përditësime',
    settingsUpdatesDescription: 'Kontrollo në GitHub nëse ka version më të ri.',
    settingsThemeLabel: 'Tema',
    settingsLanguageLabel: 'Gjuha',
    settingsThemeSystem: 'Sistemi',
    settingsThemeDark: 'E errët',
    settingsThemeLight: 'E ndritshme',
    settingsLanguageSq: 'Shqip',
    settingsLanguageEn: 'English',
    settingsFooter:
      'Dosja e zgjedhur do të ruhet dhe do të përdoret automatikisht herën tjetër që hap aplikacionin.',
    statusFolderUpdated: 'Dosja e shkarkimeve u përditësua.',
    statusMissingUrl: 'Shkruaj fillimisht një URL videoje.',
    statusMissingFolder:
      'Vendos një dosje shkarkimi te Cilësimet para se të shkarkosh.',
    statusStartingDownload: 'Po fillon shkarkimi...',
    statusProcessing: 'Po përpunoj shkarkimin...',
    statusDownloadCompletedPrefix: 'U ruajt',
    statusDownloadCompletedSuffix: 'në',
    statusDownloadingPrefix: 'Po shkarkohet',
    statusQueued: 'Shkarkimi u shtua në radhë...',
    statusDownloadError: 'Shkarkimi dështoi.',
    statusMetadataUpdated: 'Të dhënat e videos u përditësuan.',
    downloadsTitle: 'Shkarkimet',
    downloadsEmpty: 'Ende nuk ka shkarkime.',
    downloadsOpenFile: 'Hap skedarin',
    downloadsOpenFolder: 'Hap dosjen',
    downloadsCopyUrl: 'Kopjo URL-në',
    downloadsCopyPath: 'Kopjo shtegun',
    downloadsDownloadAgain: 'Shkarko përsëri',
    downloadsCancel: 'Ndërpre',
    downloadsCancelled: 'U ndërpre',
    previewEmptyTitle: 'Ende nuk ka shkarkime',
    previewEmptySubtitle:
      'Nis një shkarkim që të shohësh parapamjen dhe ecurinë.',
    clipboardSuggestionPrefix: 'U gjet një URL në clipboard:',
    clipboardUseButton: 'Përdore',
    dropStatusMessage: 'URL-ja u vendos nga veprimi tërhiq-dhe-lësho.',
    dropIgnoredStatusMessage: 'Teksti i hedhur nuk është URL e vlefshme.',
    clipboardStatusMessage: 'URL-ja u vendos nga clipboard.',
    updatesCheckButton: 'Kontrollo për përditësime',
    updatesChecking: 'Po kontrolloj për përditësime...',
    updatesCheckFailed: 'Kontrolli për përditësime dështoi.',
    updatesAvailableAuto:
      'Version i ri {version} është në dispozicion. Mund ta shkarkosh direkt nga aplikacioni.',
    updatesAvailableManual:
      'Version i ri {version} është në dispozicion. Hap GitHub për ta shkarkuar.',
    updatesCurrent: 'Je në versionin më të fundit ({version}).',
    updateModalTitle: 'Përditësim i ri',
    updateModalBody:
      'Version i ri {latest} është në dispozicion (ti ke {current}).',
    updateModalDescriptionAuto:
      'Mund ta shkarkosh instaluesin e ri direkt nga aplikacioni ose ta hapësh faqen e GitHub.',
    updateModalDescriptionManual:
      'Hap faqen e GitHub për ta shkarkuar instaluesin e ri.',
    updateDownloadButton: 'Shkarko përditësimin',
    updateDownloadingButton: 'Duke shkarkuar...',
    updateGithubButton: 'Hap GitHub',
    updateCloseButton: 'Mbyll',
    updateDownloadingStatus: 'Po shkarkohet përditësimi i aplikacionit...',
    updateNoAssetStatus:
      'Ky përditësim nuk ka instalues të disponueshëm për shkarkim automatik.',
    updateDownloadFailedStatus: 'Shkarkimi i përditësimit dështoi.',
    updateDownloadedStatusPrefix: 'Përditësimi u shkarkua në',
    updateRunPrompt:
      'Përditësimi u shkarkua. Dëshiron ta nisësh instaluesin tani?',
    updateRunFailedStatus:
      'Instaluesi u shkarkua, por nuk mund të nis automatikisht. Hap dosjen e shkarkimeve dhe niseni manualisht.',
    footerText: 'Krijuar nga Gorian © 2025'
  },
  en: {
    ready: 'Ready',
    appDescription:
      'Paste a video URL (YouTube is supported) and this app will download it for you.',
    urlLabel: 'Video URL',
    urlPlaceholder: 'https://example.com/video.mp4',
    formatLabel: 'Format',
    formatMp4: 'MP4 (video)',
    formatMp3: 'MP3 (audio)',
    qualityLabel: 'Quality (YouTube)',
    qualityAuto: 'Automatic',
    quality1080p: '1080p (if available)',
    quality720p: '720p',
    quality480p: '480p',
    playlistLabel: 'Playlist',
    playlistCaption:
      'Download the whole playlist (if the URL is a playlist)',
    downloadFolderLabel: 'Download folder',
    downloadFolderEmpty: 'No folder selected',
    downloadFolderHint: 'Change it from Settings.',
    downloadButtonIdle: 'Download',
    downloadButtonBusy: 'Working...',
    settingsButton: 'Settings',
    settingsTitle: 'Settings',
    settingsDownloadFolder: 'Download folder',
    settingsChooseFolder: 'Choose folder',
    settingsUpdatesLabel: 'Updates',
    settingsUpdatesDescription: 'Check on GitHub for a newer version.',
    settingsThemeLabel: 'Theme',
    settingsLanguageLabel: 'Language',
    settingsThemeSystem: 'System',
    settingsThemeDark: 'Dark',
    settingsThemeLight: 'Light',
    settingsLanguageSq: 'Shqip',
    settingsLanguageEn: 'English',
    settingsFooter:
      'The selected folder will be saved and used automatically next time you open the app.',
    statusFolderUpdated: 'Download folder updated.',
    statusMissingUrl: 'Enter a video URL first.',
    statusMissingFolder:
      'Set a download folder in Settings before downloading.',
    statusStartingDownload: 'Starting download...',
    statusProcessing: 'Processing download...',
    statusDownloadCompletedPrefix: 'Saved',
    statusDownloadCompletedSuffix: 'to',
    statusDownloadingPrefix: 'Downloading',
    statusQueued: 'Download added to the queue...',
    statusDownloadError: 'Download failed.',
    statusMetadataUpdated: 'Video metadata updated.',
    downloadsTitle: 'Downloads',
    downloadsEmpty: 'No downloads yet.',
    downloadsOpenFile: 'Open file',
    downloadsOpenFolder: 'Open folder',
    downloadsCopyUrl: 'Copy URL',
    downloadsCopyPath: 'Copy path',
    downloadsDownloadAgain: 'Download again',
    downloadsCancel: 'Cancel',
    downloadsCancelled: 'Cancelled',
    previewEmptyTitle: 'No downloads yet',
    previewEmptySubtitle:
      'Start a download to see preview and progress here.',
    clipboardSuggestionPrefix: 'Found a URL in your clipboard:',
    clipboardUseButton: 'Use it',
    dropStatusMessage: 'URL was filled from drag-and-drop.',
    dropIgnoredStatusMessage: 'Dropped content is not a valid URL.',
    clipboardStatusMessage: 'URL was filled from clipboard.',
    updatesCheckButton: 'Check for updates',
    updatesChecking: 'Checking for updates...',
    updatesCheckFailed: 'Checking for updates failed.',
    updatesAvailableAuto:
      'A new version {version} is available. You can download it directly from the app.',
    updatesAvailableManual:
      'A new version {version} is available. Open GitHub to download it.',
    updatesCurrent: 'You are on the latest version ({version}).',
    updateModalTitle: 'New update',
    updateModalBody:
      'New version {latest} is available (you have {current}).',
    updateModalDescriptionAuto:
      'You can download the new installer directly from the app or open the GitHub page.',
    updateModalDescriptionManual:
      'Open the GitHub page to download the new installer.',
    updateDownloadButton: 'Download update',
    updateDownloadingButton: 'Downloading...',
    updateGithubButton: 'Open GitHub',
    updateCloseButton: 'Close',
    updateDownloadingStatus: 'Downloading app update...',
    updateNoAssetStatus:
      'This update does not have an installer available for automatic download.',
    updateDownloadFailedStatus: 'Downloading the update failed.',
    updateDownloadedStatusPrefix: 'Update downloaded to',
    updateRunPrompt:
      'The update was downloaded. Do you want to run the installer now?',
    updateRunFailedStatus:
      'Installer was downloaded but could not be launched automatically. Open the downloads folder and run it manually.',
    footerText: 'Built by Gorian © 2025'
  }
};

const getStrings = language => UI_STRINGS[language] || UI_STRINGS.sq;

const clampProgress = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const normalized = numeric >= 99.5 ? 100 : numeric;
  return Math.max(0, Math.min(100, normalized));
};

const formatStatusLabel = (item, strings) => {
  if (!item) {
    return strings.ready;
  }
  switch (item.status) {
    case 'queued':
      return 'Në pritje për të nisur';
    case 'downloading':
      return typeof item.progress === 'number'
        ? `Shkarkim • ${item.progress}%`
        : 'Po shkarkohet';
    case 'processing':
      return item.message || strings.statusProcessing;
    case 'metadata':
      return strings.statusMetadataUpdated;
    case 'completed':
      return 'Përfundoi';
    case 'cancelled':
      return strings.downloadsCancelled;
    case 'error':
      return item.message || strings.statusDownloadError;
    default:
      return item.message || strings.statusProcessing;
  }
};

const isValidUrl = value => {
  if (!value || typeof value !== 'string') {
    return false;
  }
  try {
    const parsed = new URL(value.trim());
    return Boolean(parsed.protocol === 'http:' || parsed.protocol === 'https:');
  } catch {
    return false;
  }
};

const applyTheme = theme => {
  try {
    const body = document.body;
    if (!body) return;
    const value = theme || 'system';
    body.dataset.theme = value;
  } catch {
    // ignore
  }
};

function App() {
  const [url, setUrl] = useState(DEFAULT_VIDEO_URL);
  const [format, setFormat] = useState('mp4');
  const [status, setStatus] = useState({ message: UI_STRINGS.sq.ready, variant: 'info' });
  const [isBusy, setIsBusy] = useState(false);
  const [settings, setSettings] = useState({ downloadFolder: null, downloadHistory: [] });
  const [downloads, setDownloads] = useState({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [playlistDownload, setPlaylistDownload] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [isDownloadingUpdate, setIsDownloadingUpdate] = useState(false);
  const [qualityPreset, setQualityPreset] = useState('auto');
  const [uiLanguage, setUiLanguage] = useState('sq');
  const [clipboardSuggestion, setClipboardSuggestion] = useState(null);

  const strings = getStrings(uiLanguage);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const payload = await electronAPI.getSettings();
        if (mounted && payload) {
          setSettings(payload);
          if (payload.language) {
            setUiLanguage(payload.language);
          }
          if (payload.theme) {
            applyTheme(payload.theme);
          }
          if (Array.isArray(payload.downloadHistory)) {
            setDownloads(prev => {
              const next = { ...prev };
              payload.downloadHistory.forEach(entry => {
                if (!entry || !entry.id) return;
                if (next[entry.id]) return;
                next[entry.id] = {
                  id: entry.id,
                  status: 'completed',
                  progress: 100,
                  fileName: entry.fileName,
                  filePath: entry.filePath,
                  format: entry.format,
                  title: entry.title,
                  thumbnail: entry.thumbnail,
                  source: entry.source,
                  url: entry.url,
                  createdAt: entry.completedAt,
                  lastUpdate: entry.completedAt
                };
              });
              return next;
            });
          }
        }
      } catch (error) {
        console.error('[renderer] Nuk mund të lexoj cilësimet', error);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let lastSeen = '';

    const pollClipboard = async () => {
      try {
        const text = await electronAPI.readClipboardText();
        if (cancelled) return;
        const trimmed = (text || '').trim();
        if (!trimmed || trimmed === lastSeen) {
          return;
        }
        lastSeen = trimmed;

        if (!url.trim() && isValidUrl(trimmed)) {
          setClipboardSuggestion({ url: trimmed });
        }
      } catch {
        // ignore clipboard errors
      } finally {
        if (!cancelled) {
          setTimeout(pollClipboard, 5000);
        }
      }
    };

    pollClipboard();

    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    const handleDragOver = event => {
      event.preventDefault();
    };

    const handleDrop = event => {
      event.preventDefault();
      try {
        const dt = event.dataTransfer;
        if (!dt) return;
        const raw =
          dt.getData('text/uri-list') ||
          dt.getData('text/plain') ||
          '';
        const candidate = raw.trim().split(/\s+/)[0];
        if (!candidate) {
          return;
        }
        if (isValidUrl(candidate)) {
          setUrl(candidate);
          setStatus({
            message: strings.dropStatusMessage,
            variant: 'info'
          });
        } else {
          setStatus({
            message: strings.dropIgnoredStatusMessage,
            variant: 'error'
          });
        }
      } catch (error) {
        console.error('[renderer] drop handler failed', error);
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [strings]);

  const handleDownloadEvent = useCallback(
    event => {
      if (!event) {
        return;
      }

      if (!event.id) {
        setStatus({
          message: event.message || strings.statusProcessing,
          variant: 'info'
        });
        return;
      }

      setDownloads(prev => {
        const next = { ...prev };
        const existing = next[event.id] || {
          id: event.id,
          createdAt: Date.now(),
          progress: 0
        };
        const incoming =
          typeof event.progress === 'number' ? clampProgress(event.progress) : existing.progress ?? 0;
        const nextProgress = Math.max(existing.progress ?? 0, incoming);

        next[event.id] = {
          ...existing,
          ...event,
          progress: nextProgress,
          lastUpdate: Date.now()
        };
        return next;
      });

      if (event.status === 'metadata') {
        setStatus({
          message: strings.statusMetadataUpdated,
          variant: 'info'
        });
        return;
      }

      if (event.status === 'completed') {
        const label = event.format ? event.format.toUpperCase() : 'file';
        setStatus({
          message: `${strings.statusDownloadCompletedPrefix} ${label} ${strings.statusDownloadCompletedSuffix} ${event.filePath}`,
          variant: 'success'
        });
      } else if (event.status === 'processing') {
        setStatus({
          message: event.message || strings.statusProcessing,
          variant: 'info'
        });
      } else if (event.status === 'downloading') {
        setStatus({
          message: `${strings.statusDownloadingPrefix} ${event.title || event.fileName || ''}...`,
          variant: 'info'
        });
      } else if (event.status === 'queued') {
        setStatus({
          message: strings.statusQueued,
          variant: 'info'
        });
      } else if (event.status === 'cancelled') {
        setStatus({
          message: strings.downloadsCancelled,
          variant: 'info'
        });
      } else if (event.status === 'error') {
        setStatus({
          message: event.message || strings.statusDownloadError,
          variant: 'error'
        });
      }
    },
    [strings]
  );

  useEffect(() => {
    const detachProgress = electronAPI.onDownloadProgress(handleDownloadEvent);
    const detachSettings = electronAPI.onSettingsUpdated(payload => {
      if (payload) {
        setSettings(payload);
        if (payload.language) {
          setUiLanguage(payload.language);
        }
        if (payload.theme) {
          applyTheme(payload.theme);
        }
        if (Array.isArray(payload.downloadHistory)) {
          setDownloads(prev => {
            const next = { ...prev };
            payload.downloadHistory.forEach(entry => {
              if (!entry || !entry.id) return;
              if (next[entry.id]) return;
              next[entry.id] = {
                id: entry.id,
                status: 'completed',
                progress: 100,
                fileName: entry.fileName,
                filePath: entry.filePath,
                format: entry.format,
                title: entry.title,
                thumbnail: entry.thumbnail,
                source: entry.source,
                url: entry.url,
                createdAt: entry.completedAt,
                lastUpdate: entry.completedAt
              };
            });
            return next;
          });
        }
      }
    });
    return () => {
      detachProgress?.();
      detachSettings?.();
    };
  }, [handleDownloadEvent]);

  const downloadsArray = useMemo(
    () =>
      Object.values(downloads).sort(
        (a, b) => (b.lastUpdate || b.createdAt || 0) - (a.lastUpdate || a.createdAt || 0)
      ),
    [downloads]
  );

  const previewItem = downloadsArray[0] || null;
  const downloadCount = downloadsArray.length;
  const folderDisplay = settings?.downloadFolder || strings.downloadFolderEmpty;
  const currentTheme = settings?.theme || 'system';

  const handleChooseFolder = async () => {
    const updated = await electronAPI.chooseDownloadFolder();
    if (updated) {
      setSettings(updated);
      setStatus({ message: strings.statusFolderUpdated, variant: 'success' });
    }
  };

  const handleUseClipboardSuggestion = () => {
    if (!clipboardSuggestion?.url) {
      return;
    }
    setUrl(clipboardSuggestion.url);
    setClipboardSuggestion(null);
    setStatus({
      message: strings.clipboardStatusMessage,
      variant: 'info'
    });
  };

  const handleOpenFile = item => {
    if (!item?.filePath) return;
    electronAPI.openDownloadLocation({ filePath: item.filePath, mode: 'file' }).catch(error => {
      console.error('[renderer] openDownloadLocation file failed', error);
    });
  };

  const handleOpenFolder = item => {
    if (!item?.filePath) return;
    electronAPI.openDownloadLocation({ filePath: item.filePath, mode: 'folder' }).catch(error => {
      console.error('[renderer] openDownloadLocation folder failed', error);
    });
  };

  const handleCopyUrl = async item => {
    if (!item?.url) return;
    try {
      await electronAPI.writeClipboardText(item.url);
    } catch (error) {
      console.error('[renderer] writeClipboardText (url) failed', error);
    }
  };

  const handleCopyPath = async item => {
    if (!item?.filePath) return;
    try {
      await electronAPI.writeClipboardText(item.filePath);
    } catch (error) {
      console.error('[renderer] writeClipboardText (path) failed', error);
    }
  };

  const handleDownloadAgain = async item => {
    if (!item?.url || !settings?.downloadFolder) {
      return;
    }
    try {
      setStatus({ message: strings.statusStartingDownload, variant: 'info' });
      await electronAPI.startDownload({
        url: item.url,
        directory: settings.downloadFolder,
        format: item.format || 'mp4',
        playlist: false,
        quality: qualityPreset
      });
    } catch (error) {
      console.error('[renderer] redownload failed', error);
      setStatus({
        message: strings.statusDownloadError,
        variant: 'error'
      });
    }
  };

  const handleCancelDownload = async item => {
    if (!item?.id) return;
    try {
      await electronAPI.cancelDownload({ id: item.id });
    } catch (error) {
      console.error('[renderer] cancelDownload failed', error);
    }
  };

  const handleChangeTheme = async nextTheme => {
    applyTheme(nextTheme);
    setSettings(prev => ({ ...prev, theme: nextTheme }));
    try {
      await electronAPI.updateSettings({ theme: nextTheme });
    } catch (error) {
      console.error('[renderer] updateSettings (theme) failed', error);
    }
  };

  const handleChangeLanguage = async nextLanguage => {
    setUiLanguage(nextLanguage);
    setSettings(prev => ({ ...prev, language: nextLanguage }));
    try {
      await electronAPI.updateSettings({ language: nextLanguage });
    } catch (error) {
      console.error('[renderer] updateSettings (language) failed', error);
    }
  };

  const handleDownload = async () => {
    console.log('[renderer] U kërku shkarkim', { url, format, playlistDownload, qualityPreset });
    if (!url.trim()) {
      setStatus({ message: strings.statusMissingUrl, variant: 'error' });
      return;
    }
    if (!settings?.downloadFolder) {
      setStatus({
        message: strings.statusMissingFolder,
        variant: 'error'
      });
      return;
    }

    try {
      setIsBusy(true);
      setStatus({ message: strings.statusStartingDownload, variant: 'info' });
      await electronAPI.startDownload({
        url: url.trim(),
        directory: settings.downloadFolder,
        format,
        playlist: playlistDownload,
        quality: qualityPreset
      });
    } catch (error) {
      console.error('[renderer] Shkarkimi dështoi', error);
      setStatus({
        message: error?.message || strings.statusDownloadError,
        variant: 'error'
      });
    } finally {
      setIsBusy(false);
    }
  };

  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  const handleCheckUpdates = async () => {
    setStatus({ message: strings.updatesChecking, variant: 'info' });
    try {
      const result = await electronAPI.checkForUpdates();
      if (!result?.ok) {
        setStatus({
          message: result?.reason || strings.updatesCheckFailed,
          variant: 'error'
        });
        return;
      }
      if (result.hasUpdate) {
        setUpdateInfo(result);
        setIsUpdateModalOpen(true);
        const canAutoDownload = Boolean(result.assetUrl);
        const versionLabel = result.latestVersion || '';
        setStatus({
          message: canAutoDownload
            ? strings.updatesAvailableAuto.replace('{version}', versionLabel)
            : strings.updatesAvailableManual.replace('{version}', versionLabel),
          variant: 'success'
        });
      } else {
        setUpdateInfo(null);
        setStatus({
          message: strings.updatesCurrent.replace('{version}', result.currentVersion || ''),
          variant: 'info'
        });
      }
    } catch (error) {
      console.error('[renderer] checkForUpdates failed', error);
      setStatus({
        message: strings.updatesCheckFailed,
        variant: 'error'
      });
    }
  };

  const handleDownloadUpdate = async () => {
    if (!updateInfo?.assetUrl) {
      setStatus({
        message: strings.updateNoAssetStatus,
        variant: 'error'
      });
      return;
    }

    try {
      setIsDownloadingUpdate(true);
      setStatus({
        message: strings.updateDownloadingStatus,
        variant: 'info'
      });

      const result = await electronAPI.downloadUpdate({
        assetUrl: updateInfo.assetUrl,
        assetName: updateInfo.assetName
      });

      if (result?.ok && result.filePath) {
        setStatus({
          message: `${strings.updateDownloadedStatusPrefix} ${result.filePath}.`,
          variant: 'success'
        });

        let shouldRunInstaller = false;
        try {
          // eslint-disable-next-line no-alert
          shouldRunInstaller = window.confirm(
            strings.updateRunPrompt
          );
        } catch {
          shouldRunInstaller = false;
        }

        if (shouldRunInstaller) {
          try {
            await electronAPI.openDownloadLocation({ filePath: result.filePath, mode: 'file' });
          } catch (error) {
            console.error('[renderer] openDownloadLocation (file) for update failed', error);
            setStatus({
              message:
                strings.updateRunFailedStatus,
              variant: 'error'
            });
          }
        } else {
          try {
            await electronAPI.openDownloadLocation({ filePath: result.filePath, mode: 'folder' });
          } catch (error) {
            console.error('[renderer] openDownloadLocation (folder) for update failed', error);
          }
        }
      } else {
        setStatus({
          message: result?.reason || strings.updateDownloadFailedStatus,
          variant: 'error'
        });
      }
    } catch (error) {
      console.error('[renderer] downloadUpdate failed', error);
      setStatus({
        message: strings.updateDownloadFailedStatus,
        variant: 'error'
      });
    } finally {
      setIsDownloadingUpdate(false);
    }
  };

  return (
    <>
      <main className="card">
        <header className="card-header">
          <div className="brand">
            <div className="brand-mark">
              <img src="./assets/logo.svg" alt="AlbaDownload" />
            </div>
            <div>
              <div className="brand-title">AlbaDownload</div>
              <p>
                {strings.appDescription}
              </p>
            </div>
          </div>
          <button
            id="settings-btn"
            type="button"
            className="ghost"
            onClick={() => setIsSettingsOpen(true)}
            disabled={isBusy}
          >
            {strings.settingsButton}
          </button>
        </header>

        <div className='input-group'>
          <label htmlFor="video-url">{strings.urlLabel}</label>
          <input
            id="video-url"
            type="url"
            value={url}
            onChange={event => setUrl(event.target.value)}
            placeholder={strings.urlPlaceholder}
            disabled={isBusy}
          />
          {clipboardSuggestion?.url && (
            <div className="clipboard-hint">
              <span>
                {strings.clipboardSuggestionPrefix} <code>{clipboardSuggestion.url}</code>
              </span>
              <button type="button" className="ghost" onClick={handleUseClipboardSuggestion}>
                {strings.clipboardUseButton}
              </button>
            </div>
          )}
        </div>

        <div className="format-section">
          <div className="label">{strings.formatLabel}</div>
          <div className="format-options" role="radiogroup" aria-label={strings.formatLabel}>
            <label className="chip">
              <input
                type="radio"
                name="format"
                value="mp4"
                checked={format === 'mp4'}
                onChange={() => setFormat('mp4')}
                disabled={isBusy}
              />
              <span>{strings.formatMp4}</span>
            </label>
            <label className="chip">
              <input
                type="radio"
                name="format"
                value="mp3"
                checked={format === 'mp3'}
                onChange={() => setFormat('mp3')}
                disabled={isBusy}
              />
              <span>{strings.formatMp3}</span>
            </label>
          </div>
        </div>

        <div className="format-section">
          <div className="label">{strings.qualityLabel}</div>
          <div className="format-options" role="radiogroup" aria-label={strings.qualityLabel}>
            <label className="chip">
              <input
                type="radio"
                name="quality"
                value="auto"
                checked={qualityPreset === 'auto'}
                onChange={() => setQualityPreset('auto')}
                disabled={isBusy}
              />
              <span>{strings.qualityAuto}</span>
            </label>
            <label className="chip">
              <input
                type="radio"
                name="quality"
                value="1080p"
                checked={qualityPreset === '1080p'}
                onChange={() => setQualityPreset('1080p')}
                disabled={isBusy || format === 'mp3'}
              />
              <span>{strings.quality1080p}</span>
            </label>
            <label className="chip">
              <input
                type="radio"
                name="quality"
                value="720p"
                checked={qualityPreset === '720p'}
                onChange={() => setQualityPreset('720p')}
                disabled={isBusy || format === 'mp3'}
              />
              <span>{strings.quality720p}</span>
            </label>
            <label className="chip">
              <input
                type="radio"
                name="quality"
                value="480p"
                checked={qualityPreset === '480p'}
                onChange={() => setQualityPreset('480p')}
                disabled={isBusy || format === 'mp3'}
              />
              <span>{strings.quality480p}</span>
            </label>
          </div>
        </div>

        <div className="download-folder">
          <div className="label">{strings.playlistLabel}</div>
          <label className="chip">
            <input
              type="checkbox"
              checked={playlistDownload}
              onChange={event => setPlaylistDownload(event.target.checked)}
              disabled={isBusy}
            />
            <span>{strings.playlistCaption}</span>
          </label>
        </div>

        <div className="download-folder">
          <div className="label">{strings.downloadFolderLabel}</div>
          <div className={`folder-label ${settings?.downloadFolder ? '' : 'muted'}`}>{folderDisplay}</div>
          <small>{strings.downloadFolderHint}</small>
        </div>

        <button id="download-btn" type="button" onClick={handleDownload} disabled={isBusy}>
          {isBusy ? strings.downloadButtonBusy : strings.downloadButtonIdle}
        </button>

        <section className="preview-panel">
          <div className="preview-media">
            {previewItem?.thumbnail ? (
              <img src={previewItem.thumbnail} alt={previewItem.title || 'Parapamje shkarkimi'} />
            ) : (
              <img id="preview-image" className="hidden" alt="Parapamje bosh e shkarkimit" />
            )}
          </div>
          <div className="preview-details">
            <div id="preview-title" className="preview-title">
              {previewItem?.title || previewItem?.fileName || strings.previewEmptyTitle}
            </div>
            <p id="preview-subtitle" className="preview-subtitle muted">
              {previewItem
                ? formatStatusLabel(previewItem, strings)
                : strings.previewEmptySubtitle}
            </p>
            {previewItem ? (
              <progress
                id="preview-progress"
                value={previewItem.status === 'completed' ? 100 : previewItem.progress || 0}
                max="100"
              />
            ) : (
              <progress id="preview-progress" value="0" max="100" hidden />
            )}
          </div>
        </section>

        <section className="downloads-section">
          <div className="downloads-head">
            <h2>{strings.downloadsTitle}</h2>
            <span id="download-count" className="badge">
              {downloadCount}
            </span>
          </div>
          <div id="downloads-list" className={`downloads-list ${downloadCount === 0 ? 'empty' : ''}`}>
            {downloadCount === 0 ? (
              <p className="muted">{strings.downloadsEmpty}</p>
            ) : (
              downloadsArray.map(item => (
                <div key={item.id} className="download-item">
                  {item.thumbnail && (
                    <div className="download-item-thumb">
                      <img src={item.thumbnail} alt={item.title || item.fileName || 'Thumbnail'} />
                    </div>
                  )}
                  <div className="download-item-head">
                    <div className="download-item-title">{item.title || item.fileName || 'Shkarkim'}</div>
                    <div className="download-item-meta">
                      {item.format
                        ? `${item.format.toUpperCase()} • ${formatStatusLabel(item, strings)}`
                        : formatStatusLabel(item, strings)}
                    </div>
                  </div>
                  <progress
                    className="download-item-progress"
                    max="100"
                    value={item.status === 'completed' ? 100 : item.progress || 0}
                  />
                  <div className="download-item-actions">
                    {item.filePath && (
                      <>
                        <button type="button" onClick={() => handleOpenFile(item)}>
                          {strings.downloadsOpenFile}
                        </button>
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => handleOpenFolder(item)}
                        >
                          {strings.downloadsOpenFolder}
                        </button>
                      </>
                    )}
                    {item.url && (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => handleCopyUrl(item)}
                      >
                        {strings.downloadsCopyUrl}
                      </button>
                    )}
                    {item.filePath && (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => handleCopyPath(item)}
                      >
                        {strings.downloadsCopyPath}
                      </button>
                    )}
                    {item.status === 'completed' && item.url && (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => handleDownloadAgain(item)}
                      >
                        {strings.downloadsDownloadAgain}
                      </button>
                    )}
                    {(item.status === 'queued' ||
                      item.status === 'downloading' ||
                      item.status === 'processing') && (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => handleCancelDownload(item)}
                      >
                        {strings.downloadsCancel}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <div id="status" className="status" data-variant={status.variant}>
          {status.message}
        </div>

        <footer className="app-footer">{strings.footerText}</footer>
      </main>

      {isSettingsOpen && (
        <div id="settings-overlay" className="modal" onClick={closeSettings}>
          <div className="modal-card" onClick={event => event.stopPropagation()}>
            <header className="modal-head">
              <h2>{strings.settingsTitle}</h2>
              <button className="ghost" type="button" onClick={closeSettings}>
                {strings.updateCloseButton}
              </button>
            </header>
            <section className="setting">
              <div>
                <div className="label">{strings.settingsDownloadFolder}</div>
                <p className={`muted ${settings?.downloadFolder ? '' : 'muted'}`} id="settings-folder-label">
                  {folderDisplay}
                </p>
              </div>
              <button id="settings-choose-folder" type="button" onClick={handleChooseFolder} disabled={isBusy}>
                {strings.settingsChooseFolder}
              </button>
            </section>
            <section className="setting">
              <div>
                <div className="label">{strings.settingsUpdatesLabel}</div>
                <p className="muted">{strings.settingsUpdatesDescription}</p>
              </div>
              <button type="button" onClick={handleCheckUpdates} disabled={isBusy}>
                {strings.updatesCheckButton}
              </button>
            </section>
            <section className="setting">
              <div>
                <div className="label">{strings.settingsThemeLabel}</div>
                <p className="muted">
                  {uiLanguage === 'sq'
                    ? 'Zgjidh pamjen e aplikacionit.'
                    : 'Choose how the app looks.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={currentTheme === 'system' ? '' : 'ghost'}
                  onClick={() => handleChangeTheme('system')}
                  disabled={isBusy}
                >
                  {strings.settingsThemeSystem}
                </button>
                <button
                  type="button"
                  className={currentTheme === 'dark' ? '' : 'ghost'}
                  onClick={() => handleChangeTheme('dark')}
                  disabled={isBusy}
                >
                  {strings.settingsThemeDark}
                </button>
                <button
                  type="button"
                  className={currentTheme === 'light' ? '' : 'ghost'}
                  onClick={() => handleChangeTheme('light')}
                  disabled={isBusy}
                >
                  {strings.settingsThemeLight}
                </button>
              </div>
            </section>
            <section className="setting">
              <div>
                <div className="label">{strings.settingsLanguageLabel}</div>
                <p className="muted">
                  {uiLanguage === 'sq'
                    ? 'Ndrysho gjuhën e ndërfaqes.'
                    : 'Change the interface language.'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className={uiLanguage === 'sq' ? '' : 'ghost'}
                  onClick={() => handleChangeLanguage('sq')}
                  disabled={isBusy}
                >
                  {strings.settingsLanguageSq}
                </button>
                <button
                  type="button"
                  className={uiLanguage === 'en' ? '' : 'ghost'}
                  onClick={() => handleChangeLanguage('en')}
                  disabled={isBusy}
                >
                  {strings.settingsLanguageEn}
                </button>
              </div>
            </section>
            <p className="muted small">
              {strings.settingsFooter}
            </p>
          </div>
        </div>
      )}

      {isUpdateModalOpen && updateInfo && (
        <div className="modal" onClick={() => setIsUpdateModalOpen(false)}>
          <div className="modal-card" onClick={event => event.stopPropagation()}>
            <header className="modal-head">
              <h2>{strings.updateModalTitle}</h2>
              <button className="ghost" type="button" onClick={() => setIsUpdateModalOpen(false)}>
                {strings.updateCloseButton}
              </button>
            </header>
            <p>
              {strings.updateModalBody
                .replace('{latest}', updateInfo.latestVersion)
                .replace('{current}', updateInfo.currentVersion)}
            </p>
            <p className="muted small">
              {updateInfo.assetUrl
                ? strings.updateModalDescriptionAuto
                : strings.updateModalDescriptionManual}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              {updateInfo.assetUrl && (
                <button
                  type="button"
                  onClick={handleDownloadUpdate}
                  disabled={isDownloadingUpdate}
                >
                  {isDownloadingUpdate ? strings.updateDownloadingButton : strings.updateDownloadButton}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (updateInfo.url) {
                    electronAPI.openExternal(updateInfo.url);
                  }
                  setIsUpdateModalOpen(false);
                }}
              >
                {strings.updateGithubButton}
              </button>
              <button className="ghost" type="button" onClick={() => setIsUpdateModalOpen(false)}>
                {strings.updateCloseButton}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const container = document.getElementById('root');
const root = createRoot(container);
root.render(<App />);
