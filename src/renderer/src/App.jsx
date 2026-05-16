import { useEffect, useRef, useState } from 'react';
import cuezyMarkMask from './assets/cuezy-mark-mask.png';

const emptySettings = {
  step: 60,
  segment: 18,
  start: 0,
};

const THEME_OPTIONS = [
  { value: 'cupcake', label: 'Cupcake' },
  { value: 'pastel', label: 'Pastel' },
  { value: 'garden', label: 'Garden' },
  { value: 'lemonade', label: 'Lemonade' },
  { value: 'winter', label: 'Winter' },
  { value: 'halloween', label: 'Halloween' },
  { value: 'caramellatte', label: 'Caramellatte' },
  { value: 'coffee', label: 'Coffee' },
];

const THEME_STORAGE_KEY = 'cuezy-theme';
const NOTICE_ALERT_CLASSES = {
  info: 'alert-info',
  success: 'alert-success',
  warning: 'alert-warning',
  error: 'alert-error',
};
const STATUS_TONE_CLASSES = {
  neutral: {
    panel: 'bg-base-200/60 text-base-content',
    label: 'text-base-content/60',
    detail: 'text-base-content/70',
    progress: 'progress-primary',
  },
  info: {
    panel: 'bg-info/15 text-info',
    label: 'text-info/70',
    detail: 'text-info/80',
    progress: 'progress-info',
  },
  success: {
    panel: 'bg-success/15 text-success',
    label: 'text-success/70',
    detail: 'text-success/80',
    progress: 'progress-success',
  },
  warning: {
    panel: 'bg-warning/20 text-warning',
    label: 'text-warning/70',
    detail: 'text-warning/80',
    progress: 'progress-warning',
  },
  error: {
    panel: 'bg-error/15 text-error',
    label: 'text-error/70',
    detail: 'text-error/80',
    progress: 'progress-error',
  },
};
const dragRegionStyle = { WebkitAppRegion: 'drag' };
const noDragRegionStyle = { WebkitAppRegion: 'no-drag' };

function trackToRow(track, index) {
  return {
    id: `${track.position_sec ?? index}-${index}-${Date.now()}`,
    timestamp: track.timestamp || '',
    artist: track.artist || '',
    title: track.title || '',
    album: track.album || '',
    year: track.year ? String(track.year) : '',
  };
}

function fileName(filePath) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function savedTheme() {
  const fallback = THEME_OPTIONS[0].value;
  try {
    const theme = window.localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_OPTIONS.some(option => option.value === theme) ? theme : fallback;
  } catch {
    return fallback;
  }
}

function Field({ label, children }) {
  return (
    <label className="flex flex-col gap-1.5" style={noDragRegionStyle}>
      <span className="text-xs font-bold text-base-content/70">{label}</span>
      {children}
    </label>
  );
}

function ThemePicker({ className = '', theme, onThemeChange }) {
  const dropdownRef = useRef(null);

  function chooseTheme(value) {
    onThemeChange(value);
    dropdownRef.current?.removeAttribute('open');
  }

  return (
    <details ref={dropdownRef} className={`dropdown dropdown-end window-no-drag ${className}`} style={noDragRegionStyle}>
      <summary className="btn btn-square btn-ghost btn-sm" aria-label="Choose theme" title="Choose theme">
        <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
          <path className="fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:2]" d="M12 3a9 9 0 0 0 0 18h1.5a1.5 1.5 0 0 0 0-3H13a1.5 1.5 0 0 1 0-3h2a6 6 0 0 0 0-12h-3Z" />
          <path className="fill-current" d="M7.7 10.7a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm3-3.2a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm4 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm3 3.2a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" />
        </svg>
      </summary>
      <ul className="menu dropdown-content z-10 mt-2 w-48 rounded-box border border-base-300 bg-base-100 p-2 shadow-xl">
        {THEME_OPTIONS.map(option => (
          <li key={option.value}>
            <button
              type="button"
              className={`flex items-center justify-between gap-3 ${option.value === theme ? 'active' : ''}`}
              onClick={() => chooseTheme(option.value)}
            >
              <span>{option.label}</span>
              {option.value === theme && (
                <svg className="size-4 shrink-0" viewBox="0 0 20 20" aria-hidden="true">
                  <path className="fill-current" d="M7.7 13.3 4.4 10l-1.2 1.2 4.5 4.5 9-9L15.5 5.5l-7.8 7.8Z" />
                </svg>
              )}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function WindowDragStrip() {
  const markMaskStyle = {
    WebkitMask: `url(${cuezyMarkMask}) center / contain no-repeat`,
    mask: `url(${cuezyMarkMask}) center / contain no-repeat`,
  };

  return (
    <div className="window-drag fixed inset-x-0 top-0 z-20 h-12" style={dragRegionStyle}>
      <div className="pointer-events-none flex h-full items-center justify-center gap-2">
        <span className="size-5 select-none bg-primary" style={markMaskStyle} aria-hidden="true" />
        <span className="select-none text-sm font-semibold text-base-content/70">Cuezy</span>
      </div>
    </div>
  );
}

function UploadMark({ className = 'h-20 w-20' }) {
  return (
    <svg className={`${className} text-primary`} viewBox="0 0 96 96" aria-hidden="true">
      <path className="fill-current opacity-95" d="M18 30.5C18 23.6 23.6 18 30.5 18h18.2c3.5 0 6.8 1.5 9.2 4.1l4.8 5.4h2.8C72.4 27.5 78 33.1 78 40v25.5C78 72.4 72.4 78 65.5 78h-35C23.6 78 18 72.4 18 65.5v-35Z" />
      <path className="fill-none stroke-primary-content [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:5.6]" d="M30 41h36M48 35v25M38 51l10-10 10 10" />
    </svg>
  );
}

export default function App() {
  const [appInfo, setAppInfo] = useState(null);
  const [filePath, setFilePath] = useState('');
  const [settings, setSettings] = useState(emptySettings);
  const [rows, setRows] = useState([]);
  const [notice, setNotice] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [scanProgress, setScanProgress] = useState({ percent: 0, detail: '' });
  const [status, setStatus] = useState('Ready');
  const [theme, setTheme] = useState(savedTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme persistence is nice-to-have; the selected theme still applies.
    }
  }, [theme]);

  useEffect(() => {
    window.cuezy.getAppInfo().then(setAppInfo).catch(error => {
      setNotice({ tone: 'warning', message: `App info unavailable: ${error.message}` });
    });

    const unsubs = [
      window.cuezy.onAnalysisProgress(({ progress }) => {
        if (progress.phase === 'scan' && !progress.segmentIndex && !progress.timestamp) {
          setScanProgress({
            percent: progress.percent ?? 0,
            detail: `${progress.step}s scan step, ${progress.segment}s samples`,
          });
          setStatus('Analyzing');
          return;
        }

        if (progress.phase === 'scan' && progress.timestamp) {
          setScanProgress({
            percent: progress.percent ?? 0,
            detail: `Scanning around ${progress.timestamp}`,
          });
        }
      }),
      window.cuezy.onSegmentResult(({ segment }) => {
        if (segment.status === 'matched' && segment.track) {
          setRows(current => [...current, trackToRow(segment.track, current.length)]);
        } else if (segment.status === 'skipped') {
          setNotice({ tone: 'warning', message: `Skipped the segment at ${segment.timestamp}.` });
        } else if (segment.status === 'error') {
          setNotice({ tone: 'warning', message: segment.error?.message || 'Segment error' });
        }
      }),
      window.cuezy.onAnalysisWarning(({ warning }) => {
        setNotice({ tone: 'warning', message: warning.message });
      }),
      window.cuezy.onAnalysisDone(({ result }) => {
        setIsRunning(false);
        setJobId(null);
        setScanProgress({ percent: 100, detail: `Scanned ${result.segmentsScanned} segment${result.segmentsScanned === 1 ? '' : 's'}` });
        setStatus('Done');
        setNotice(current => {
          if (current?.tone === 'warning' || current?.tone === 'error') return current;
          if (result.tracks.length > 0) return null;
          return { tone: 'info', message: 'No tracks were found in this pass.' };
        });
      }),
      window.cuezy.onAnalysisError(({ error }) => {
        setIsRunning(false);
        setJobId(null);
        const cancelled = error.name === 'AbortError';
        setScanProgress(current => ({
          ...current,
          detail: cancelled ? 'Analysis cancelled' : error.message,
        }));
        setStatus(cancelled ? 'Cancelled' : 'Error');
        setNotice({
          tone: cancelled ? 'info' : 'error',
          message: cancelled ? 'Analysis cancelled.' : error.message,
        });
      }),
    ];

    return () => unsubs.forEach(unsub => unsub());
  }, []);

  function setNumericSetting(name, value) {
    setSettings(current => ({ ...current, [name]: value }));
  }

  async function pickFile() {
    const result = await window.cuezy.selectAudioFile();
    if (!result.canceled && result.filePath) {
      setFilePath(result.filePath);
      setRows([]);
      setNotice(null);
      setScanProgress({ percent: 0, detail: '' });
      setStatus('Ready');
    }
  }

  async function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);
    if (isRunning) return;

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    const droppedPath = window.cuezy.getDroppedFilePath(file);
    if (droppedPath) {
      setFilePath(droppedPath);
      setRows([]);
      setNotice(null);
      setScanProgress({ percent: 0, detail: '' });
      setStatus('Ready');
    } else {
      setNotice({ tone: 'warning', message: 'Could not read dropped file path. Use Choose File.' });
    }
  }

  async function startAnalysis() {
    setRows([]);
    setNotice(null);
    setScanProgress({ percent: 0, detail: 'Preparing analysis' });
    setStatus('Starting');
    setIsRunning(true);

    try {
      const result = await window.cuezy.startAnalysis({
        filePath,
        step: settings.step,
        segment: settings.segment,
        start: settings.start,
      });
      setJobId(result.jobId);
    } catch (error) {
      setIsRunning(false);
      setJobId(null);
      setScanProgress({ percent: 0, detail: error.message });
      setStatus('Error');
      setNotice({ tone: 'error', message: error.message });
    }
  }

  async function cancelAnalysis() {
    if (!jobId) return;
    try {
      const result = await window.cuezy.cancelAnalysis(jobId);
      if (result.canceled) {
        setStatus('Cancelling');
        setNotice({ tone: 'info', message: 'Cancellation requested. Current request may finish first.' });
      } else {
        setNotice({ tone: 'warning', message: 'No active analysis job was found to cancel.' });
      }
    } catch (error) {
      setNotice({ tone: 'error', message: error.message || 'Could not cancel analysis.' });
    }
  }

  function updateRow(id, field, value) {
    setRows(current => current.map(row => (
      row.id === id ? { ...row, [field]: value } : row
    )));
  }

  function deleteRow(id) {
    setRows(current => current.filter(row => row.id !== id));
  }

  async function copyMarkdown() {
    try {
      const result = await window.cuezy.copyMarkdownTracklist(rows);
      setNotice({
        tone: result.copied ? 'success' : 'error',
        message: result.copied ? 'Markdown copied to clipboard.' : 'Could not copy Markdown.',
      });
    } catch (error) {
      setNotice({ tone: 'error', message: error.message || 'Could not copy Markdown.' });
    }
  }

  async function save(format) {
    try {
      const result = await window.cuezy.saveExport(format, rows);
      if (!result.canceled) {
        setNotice({ tone: 'success', message: `Saved ${result.filePath}` });
      }
    } catch (error) {
      setNotice({ tone: 'error', message: error.message || `Could not save ${format.toUpperCase()}.` });
    }
  }

  const canAnalyze = filePath && !isRunning;
  const ffmpegMissing = appInfo && !appInfo.ffmpegAvailable;
  const showSplash = !filePath && !isRunning;
  const showResults = rows.length > 0 || (!isRunning && status.startsWith('Done'));
  const showMeter = isRunning || rows.length > 0 || status !== 'Ready';
  const emptyTracklistMessage = status.startsWith('Done')
    ? 'No editable tracks remain.'
    : 'Start analysis to build an editable tracklist.';
  const progressValue = !isRunning && (rows.length > 0 || status.startsWith('Done'))
    ? 100
    : Math.max(0, Math.min(100, Number(scanProgress.percent) || 0));
  const statusTitle = isRunning
    ? 'Analyzing'
    : rows.length > 0
      ? `${rows.length} track${rows.length === 1 ? '' : 's'} found`
      : status === 'Done'
        ? 'No tracks found'
      : status;
  const statusDetail = scanProgress.detail || (isRunning
    ? fileName(filePath)
    : rows.length > 0
      ? 'Review and export your editable tracklist.'
      : '');
  const statusTone = status === 'Error'
    ? 'error'
    : status === 'Cancelled' || status === 'Cancelling'
      ? 'warning'
      : status.startsWith('Done')
        ? rows.length > 0 ? 'success' : 'info'
        : isRunning || status === 'Starting'
          ? 'info'
          : 'neutral';
  const statusToneClasses = STATUS_TONE_CLASSES[statusTone];

  const dropHandlers = {
    onDragOver: event => {
      event.preventDefault();
      setDragActive(true);
    },
    onDragLeave: () => setDragActive(false),
    onDrop: handleDrop,
  };

  if (showSplash) {
    return (
      <main className="relative grid min-h-screen place-items-center bg-base-200 p-10" {...dropHandlers}>
        <WindowDragStrip />
        <section className="relative w-[min(640px,calc(100vw-84px))] rounded-box bg-base-100 p-10 pt-16 shadow-2xl">
          <div className="window-drag absolute inset-x-0 top-0 h-11" style={dragRegionStyle} aria-hidden="true" />
          <ThemePicker className="absolute right-5 top-5" theme={theme} onThemeChange={setTheme} />

          <div className={`flex min-h-[27rem] flex-col items-center justify-center rounded-box border border-dashed border-primary/40 bg-base-100 p-10 text-center ${dragActive ? 'border-primary bg-primary/10' : ''}`}>
            <UploadMark className="mb-5 size-20" />
            <strong className="text-2xl font-bold leading-tight text-base-content">Drop an audio or video file</strong>
            <span className="mt-2 text-sm text-base-content/60">or choose one from disk</span>
            <button type="button" className="btn btn-primary btn-lg mt-6 min-w-40" onClick={pickFile}>
              Choose File
            </button>
          </div>

          {ffmpegMissing ? (
            <p className="alert alert-warning alert-soft mx-auto mt-5 max-w-md text-sm leading-relaxed">ffmpeg and ffprobe are required before analysis can run.</p>
          ) : notice ? (
            <p className={`alert alert-soft mx-auto mt-5 max-w-md text-sm leading-relaxed ${NOTICE_ALERT_CLASSES[notice.tone] ?? 'alert-info'}`}>{notice.message}</p>
          ) : (
            <p className="mx-auto mt-5 max-w-md text-center text-xs leading-relaxed text-base-content/60">Local files are analyzed with short snippets sent to Shazam for recognition.</p>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="relative h-screen min-w-[760px] bg-base-200">
      <WindowDragStrip />
      <div className="mx-auto h-full w-[min(1240px,calc(100vw-40px))] pb-4 pt-12">
        <section className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] gap-4">
        <aside className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-box border border-base-300 bg-base-100/95 p-4 shadow-xl">
          <div {...dropHandlers}>
            <button
              type="button"
              className={`grid min-h-24 w-full grid-cols-[48px_minmax(0,1fr)] gap-3 rounded-box border border-dashed border-primary/30 bg-base-100 p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${isRunning ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:border-primary/60 hover:bg-primary/5'} ${dragActive ? 'border-primary bg-primary/10' : ''}`}
              onClick={pickFile}
              disabled={isRunning}
            >
              <UploadMark className="size-12" />
              <div className="min-w-0 self-center">
                <strong className="block truncate text-base font-bold text-base-content">{fileName(filePath)}</strong>
                <span className="mt-1 block truncate text-xs leading-snug text-base-content/60">{filePath}</span>
                <span className="mt-2 block text-xs font-semibold leading-snug text-primary/80">
                  {isRunning ? 'File locked during analysis' : 'Click or drop to change file'}
                </span>
              </div>
            </button>
          </div>

          {ffmpegMissing && (
            <div className="alert alert-warning alert-soft">
              ffmpeg and ffprobe are required. Install ffmpeg before analyzing.
            </div>
          )}

          <div className="grid gap-2">
            {isRunning ? (
              <button type="button" className="btn btn-error btn-outline w-full" onClick={cancelAnalysis} disabled={!jobId}>
                Cancel
              </button>
            ) : (
              <button type="button" className="btn btn-primary w-full" onClick={startAnalysis} disabled={!canAnalyze || ffmpegMissing}>
                {rows.length > 0 ? 'Analyze Again' : 'Analyze'}
              </button>
            )}
          </div>

          <div className={`collapse collapse-arrow bg-base-200/60 ${isRunning ? 'opacity-60' : ''}`}>
            <input
              type="checkbox"
              checked={showAdvanced && !isRunning}
              onChange={event => setShowAdvanced(event.target.checked)}
              disabled={isRunning}
              aria-label="Toggle advanced settings"
              style={noDragRegionStyle}
            />
            <div className="collapse-title min-h-0 py-3 text-sm font-bold text-base-content">
              Advanced
            </div>
            <div className="collapse-content">
              <div className="grid gap-3 pt-1">
                <Field label="Scan step">
                  <input
                    className="input input-sm w-full"
                    type="number"
                    min="1"
                    value={settings.step}
                    onChange={event => setNumericSetting('step', event.target.value)}
                    disabled={isRunning}
                  />
                </Field>
                <Field label="Segment length">
                  <input
                    className="input input-sm w-full"
                    type="number"
                    min="1"
                    value={settings.segment}
                    onChange={event => setNumericSetting('segment', event.target.value)}
                    disabled={isRunning}
                  />
                </Field>
                <Field label="Start time">
                  <input
                    className="input input-sm w-full"
                    type="number"
                    min="0"
                    value={settings.start}
                    onChange={event => setNumericSetting('start', event.target.value)}
                    disabled={isRunning}
                  />
                </Field>
              </div>
            </div>
          </div>

          <div className={`grid gap-2 rounded-box px-4 py-3 ${statusToneClasses.panel}`}>
            <div className="flex items-baseline justify-between gap-3">
              <span className={`text-xs font-bold uppercase ${statusToneClasses.label}`}>Status</span>
              <strong className="truncate text-sm font-bold">{statusTitle}</strong>
            </div>
            {statusDetail && (
              <p className={`truncate text-sm leading-relaxed ${statusToneClasses.detail}`}>{statusDetail}</p>
            )}
            {showMeter && (
              <progress className={`progress h-2 ${statusToneClasses.progress}`} value={progressValue} max="100" aria-label={`Analysis progress ${progressValue}%`} />
            )}
          </div>

          {notice && (
            <p className={`alert alert-soft ${NOTICE_ALERT_CLASSES[notice.tone] ?? 'alert-info'}`} aria-live="polite">
              {notice.message}
            </p>
          )}
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden rounded-box border border-base-300 bg-base-100/95 shadow-xl">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-base-300 p-4">
            <div className="min-w-56 flex-1">
              <h2 className="m-0 text-lg font-bold leading-tight text-base-content">Tracklist</h2>
              <p className="mt-1 text-sm text-base-content/60">
                {showResults
                  ? `${rows.length} editable result${rows.length === 1 ? '' : 's'}`
                  : 'Results will appear here as Cuezy recognizes songs.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {rows.length > 0 && (
                <>
                <button type="button" className="btn btn-sm" onClick={copyMarkdown} disabled={isRunning}>
                  Copy Markdown
                </button>
                <button type="button" className="btn btn-sm" onClick={() => save('markdown')} disabled={isRunning}>
                  Save Markdown
                </button>
                <button type="button" className="btn btn-sm" onClick={() => save('json')} disabled={isRunning}>
                  JSON
                </button>
                <button type="button" className="btn btn-sm" onClick={() => save('txt')} disabled={isRunning}>
                  TXT
                </button>
                <button type="button" className="btn btn-sm" onClick={() => save('cue')} disabled={isRunning}>
                  CUE
                </button>
                </>
              )}
              <ThemePicker theme={theme} onThemeChange={setTheme} />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto">
            <table className="table table-pin-rows table-sm w-full table-fixed">
              <thead>
                <tr>
                  <th className="w-28">Timestamp</th>
                  <th>Artist</th>
                  <th>Song</th>
                  <th>Album</th>
                  <th className="w-20">Year</th>
                  <th className="w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="h-64 text-center text-base-content/60">
                      {emptyTracklistMessage}
                    </td>
                  </tr>
                ) : rows.map(row => (
                  <tr key={row.id}>
                    <td>
                      <input className="input input-sm w-full min-w-0" value={row.timestamp} onChange={event => updateRow(row.id, 'timestamp', event.target.value)} />
                    </td>
                    <td>
                      <input className="input input-sm w-full min-w-0" value={row.artist} onChange={event => updateRow(row.id, 'artist', event.target.value)} />
                    </td>
                    <td>
                      <input className="input input-sm w-full min-w-0" value={row.title} onChange={event => updateRow(row.id, 'title', event.target.value)} />
                    </td>
                    <td>
                      <input className="input input-sm w-full min-w-0" value={row.album} onChange={event => updateRow(row.id, 'album', event.target.value)} />
                    </td>
                    <td>
                      <input className="input input-sm w-full min-w-0" value={row.year} onChange={event => updateRow(row.id, 'year', event.target.value)} />
                    </td>
                    <td>
                      <button type="button" className="btn btn-error btn-ghost btn-sm w-full" onClick={() => deleteRow(row.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        </section>
      </div>
    </main>
  );
}
