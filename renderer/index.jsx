import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

const DEFAULT_VIDEO_URL = '';

const electronAPI = window.electronAPI || {
  getSettings: async () => ({ downloadFolder: null, downloadHistory: [] }),
  chooseDownloadFolder: async () => null,
  startDownload: async () => {},
  onDownloadProgress: () => () => {},
  onSettingsUpdated: () => () => {},
  openDownloadLocation: () => Promise.resolve(),
  checkForUpdates: async () => ({ ok: false })
};

const clampProgress = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  const normalized = numeric >= 99.5 ? 100 : numeric;
  return Math.max(0, Math.min(100, normalized));
};

const formatStatusLabel = item => {
  if (!item) {
    return 'Gati';
  }
  switch (item.status) {
    case 'queued':
      return 'Në pritje për të nisur';
    case 'downloading':
      return typeof item.progress === 'number'
        ? `Shkarkim • ${item.progress}%`
        : 'Po shkarkohet';
    case 'processing':
      return item.message || 'Po përpunohet...';
    case 'metadata':
      return 'Të dhënat u përditësuan';
    case 'completed':
      return 'Përfundoi';
    case 'error':
      return item.message || 'Dështoi';
    default:
      return item.message || 'Duke punuar...';
  }
};

function App() {
  const [url, setUrl] = useState(DEFAULT_VIDEO_URL);
  const [format, setFormat] = useState('mp4');
  const [status, setStatus] = useState({ message: 'Gati', variant: 'info' });
  const [isBusy, setIsBusy] = useState(false);
  const [settings, setSettings] = useState({ downloadFolder: null, downloadHistory: [] });
  const [downloads, setDownloads] = useState({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [playlistDownload, setPlaylistDownload] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const payload = await electronAPI.getSettings();
        if (mounted && payload) {
          setSettings(payload);
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

  const handleDownloadEvent = useCallback(event => {
    if (!event) {
      return;
    }

    if (!event.id) {
      setStatus({
        message: event.message || 'Po përpunoj shkarkimin...',
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
        message: 'Të dhënat e videos u përditësuan.',
        variant: 'info'
      });
      return;
    }

    if (event.status === 'completed') {
      const label = event.format ? event.format.toUpperCase() : 'skedar';
      setStatus({
        message: `U ruajt ${label} në ${event.filePath}`,
        variant: 'success'
      });
    } else if (event.status === 'processing') {
      setStatus({
        message: event.message || 'Po përpunoj shkarkimin...',
        variant: 'info'
      });
    } else if (event.status === 'downloading') {
      setStatus({
        message: `Po shkarkohet ${event.title || event.fileName || 'skedari'}...`,
        variant: 'info'
      });
    } else if (event.status === 'queued') {
      setStatus({
        message: 'Shkarkimi u shtua në radhë...',
        variant: 'info'
      });
    } else if (event.status === 'error') {
      setStatus({
        message: event.message || 'Shkarkimi dështoi.',
        variant: 'error'
      });
    }
  }, []);

  useEffect(() => {
    const detachProgress = electronAPI.onDownloadProgress(handleDownloadEvent);
    const detachSettings = electronAPI.onSettingsUpdated(payload => {
      if (payload) {
        setSettings(payload);
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
  const folderDisplay = settings?.downloadFolder || 'Nuk është zgjedhur dosje';

  const handleChooseFolder = async () => {
    const updated = await electronAPI.chooseDownloadFolder();
    if (updated) {
      setSettings(updated);
      setStatus({ message: 'Dosja e shkarkimeve u përditësua.', variant: 'success' });
    }
  };

  const handleDownload = async () => {
    console.log('[renderer] U kërku shkarkim', { url, format, playlistDownload });
    if (!url.trim()) {
      setStatus({ message: 'Shkruaj fillimisht një URL videoje.', variant: 'error' });
      return;
    }
    if (!settings?.downloadFolder) {
      setStatus({
        message: 'Vendos një dosje shkarkimi te Cilësimet para se të shkarkosh.',
        variant: 'error'
      });
      return;
    }

    try {
      setIsBusy(true);
      setStatus({ message: 'Po fillon shkarkimi...', variant: 'info' });
      await electronAPI.startDownload({
        url: url.trim(),
        directory: settings.downloadFolder,
        format,
        playlist: playlistDownload
      });
    } catch (error) {
      console.error('[renderer] Shkarkimi dështoi', error);
      setStatus({
        message: error?.message || 'Shkarkimi dështoi.',
        variant: 'error'
      });
    } finally {
      setIsBusy(false);
    }
  };

  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  const handleCheckUpdates = async () => {
    setStatus({ message: 'Po kontrolloj për përditësime...', variant: 'info' });
    try {
      const result = await electronAPI.checkForUpdates();
      if (!result?.ok) {
        setStatus({
          message: result?.reason || 'Kontrolli për përditësime dështoi.',
          variant: 'error'
        });
        return;
      }
      if (result.hasUpdate) {
        setUpdateInfo(result);
        setIsUpdateModalOpen(true);
        setStatus({
          message: `Version i ri ${result.latestVersion} është në dispozicion. Hap GitHub për ta shkarkuar.`,
          variant: 'success'
        });
      } else {
        setUpdateInfo(null);
        setStatus({
          message: `Je në versionin më të fundit (${result.currentVersion}).`,
          variant: 'info'
        });
      }
    } catch (error) {
      console.error('[renderer] checkForUpdates failed', error);
      setStatus({
        message: 'Kontrolli për përditësime dështoi.',
        variant: 'error'
      });
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
                Ngjit një URL videoje (mbështet edhe YouTube) dhe ky aplikacion do ta shkarkojë për ty.
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
            Cilësimet
          </button>
        </header>

        <div className='input-group'>
          <label htmlFor="video-url">URL e videos</label>
          <input
            id="video-url"
            type="url"
            value={url}
            onChange={event => setUrl(event.target.value)}
            placeholder="https://example.com/video.mp4"
            disabled={isBusy}
          />
        </div>

        <div className="format-section">
          <div className="label">Formati</div>
          <div className="format-options" role="radiogroup" aria-label="Formati i daljes">
            <label className="chip">
              <input
                type="radio"
                name="format"
                value="mp4"
                checked={format === 'mp4'}
                onChange={() => setFormat('mp4')}
                disabled={isBusy}
              />
              <span>MP4 (video)</span>
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
              <span>MP3 (audio)</span>
            </label>
          </div>
        </div>

        <div className="download-folder">
          <div className="label">Playlist</div>
          <label className="chip">
            <input
              type="checkbox"
              checked={playlistDownload}
              onChange={event => setPlaylistDownload(event.target.checked)}
              disabled={isBusy}
            />
            <span>Shkarko të gjithë playlistën (nëse URL është playlist)</span>
          </label>
        </div>

        <div className="download-folder">
          <div className="label">Dosja e shkarkimeve</div>
          <div className={`folder-label ${settings?.downloadFolder ? '' : 'muted'}`}>{folderDisplay}</div>
          <small>Ndryshoje nga Cilësimet.</small>
        </div>

        <button id="download-btn" type="button" onClick={handleDownload} disabled={isBusy}>
          {isBusy ? 'Duke punuar...' : 'Shkarko'}
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
              {previewItem?.title || previewItem?.fileName || 'Ende nuk ka shkarkime'}
            </div>
            <p id="preview-subtitle" className="preview-subtitle muted">
              {previewItem
                ? formatStatusLabel(previewItem)
                : 'Nis një shkarkim që të shohësh parapamjen dhe ecurinë.'}
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
            <h2>Shkarkimet</h2>
            <span id="download-count" className="badge">
              {downloadCount}
            </span>
          </div>
          <div id="downloads-list" className={`downloads-list ${downloadCount === 0 ? 'empty' : ''}`}>
            {downloadCount === 0 ? (
              <p className="muted">Ende nuk ka shkarkime.</p>
            ) : (
              downloadsArray.map(item => (
                <div key={item.id} className="download-item">
                  <div className="download-item-head">
                    <div className="download-item-title">{item.title || item.fileName || 'Shkarkim'}</div>
                    <div className="download-item-meta">
                      {item.format ? `${item.format.toUpperCase()} • ${formatStatusLabel(item)}` : formatStatusLabel(item)}
                    </div>
                  </div>
                  <progress
                    className="download-item-progress"
                    max="100"
                    value={item.status === 'completed' ? 100 : item.progress || 0}
                  />
                  {item.filePath && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button
                        type="button"
                        onClick={() => electronAPI.openDownloadLocation({ filePath: item.filePath, mode: 'file' })}
                      >
                        Hap skedarin
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => electronAPI.openDownloadLocation({ filePath: item.filePath, mode: 'folder' })}
                      >
                        Hap dosjen
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        <div id="status" className="status" data-variant={status.variant}>
          {status.message}
        </div>

        <footer className="app-footer">Krijuar nga Gorian © 2025</footer>
      </main>

      {isSettingsOpen && (
        <div id="settings-overlay" className="modal" onClick={closeSettings}>
          <div className="modal-card" onClick={event => event.stopPropagation()}>
            <header className="modal-head">
              <h2>Cilësimet</h2>
              <button className="ghost" type="button" onClick={closeSettings}>
                Mbyll
              </button>
            </header>
            <section className="setting">
              <div>
                <div className="label">Dosja e shkarkimeve</div>
                <p className={`muted ${settings?.downloadFolder ? '' : 'muted'}`} id="settings-folder-label">
                  {folderDisplay}
                </p>
              </div>
              <button id="settings-choose-folder" type="button" onClick={handleChooseFolder} disabled={isBusy}>
                Zgjidh dosjen
              </button>
            </section>
            <section className="setting">
              <div>
                <div className="label">Përditësime</div>
                <p className="muted">Kontrollo në GitHub nëse ka version më të ri.</p>
              </div>
              <button type="button" onClick={handleCheckUpdates} disabled={isBusy}>
                Kontrollo për përditësime
              </button>
            </section>
            <p className="muted small">
              Dosja e zgjedhur do të ruhet dhe do të përdoret automatikisht herën tjetër që hap aplikacionin.
            </p>
          </div>
        </div>
      )}

      {isUpdateModalOpen && updateInfo && (
        <div className="modal" onClick={() => setIsUpdateModalOpen(false)}>
          <div className="modal-card" onClick={event => event.stopPropagation()}>
            <header className="modal-head">
              <h2>Përditësim i ri</h2>
              <button className="ghost" type="button" onClick={() => setIsUpdateModalOpen(false)}>
                Mbyll
              </button>
            </header>
            <p>
              Version i ri <strong>{updateInfo.latestVersion}</strong> është në dispozicion (ti ke{' '}
              <strong>{updateInfo.currentVersion}</strong>).
            </p>
            <p className="muted small">Hap faqen e GitHub për ta shkarkuar instaluesin e ri.</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                onClick={() => {
                  if (updateInfo.url) {
                    electronAPI.openExternal(updateInfo.url);
                  }
                  setIsUpdateModalOpen(false);
                }}
              >
                Hap GitHub
              </button>
              <button className="ghost" type="button" onClick={() => setIsUpdateModalOpen(false)}>
                Mbyll
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
