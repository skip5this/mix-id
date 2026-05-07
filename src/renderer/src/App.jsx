import { useEffect, useMemo, useState } from 'react';
import { markdownTracklist } from '../../shared/tracklist-export.js';

const emptySettings = {
  step: 60,
  segment: 18,
  start: 0,
};

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

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export default function App() {
  const [appInfo, setAppInfo] = useState(null);
  const [filePath, setFilePath] = useState('');
  const [settings, setSettings] = useState(emptySettings);
  const [rows, setRows] = useState([]);
  const [logs, setLogs] = useState([]);
  const [jobId, setJobId] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [status, setStatus] = useState('Ready');

  const markdown = useMemo(() => markdownTracklist(rows).trimEnd(), [rows]);

  useEffect(() => {
    window.cuezy.getAppInfo().then(setAppInfo).catch(error => {
      setLogs(current => [...current, `App info unavailable: ${error.message}`]);
    });

    const unsubs = [
      window.cuezy.onAnalysisProgress(({ progress }) => {
        if (progress.phase === 'scan' && !progress.segmentIndex) {
          setLogs(current => [
            ...current,
            `Scanning ${fileName(progress.file || '')}: ${progress.step}s step, ${progress.segment}s sample`,
          ]);
          setStatus('Analyzing');
          return;
        }

        if (progress.phase === 'scan' && progress.timestamp) {
          setLogs(current => [
            ...current,
            `[${progress.timestamp}] ${progress.percent ?? 0}%`,
          ]);
        }
      }),
      window.cuezy.onSegmentResult(({ segment }) => {
        if (segment.status === 'matched' && segment.track) {
          setRows(current => [...current, trackToRow(segment.track, current.length)]);
          setLogs(current => [
            ...current,
            `Matched ${segment.track.artist} - ${segment.track.title}`,
          ]);
        } else if (segment.status === 'duplicate' && segment.match) {
          setLogs(current => [
            ...current,
            `Duplicate ${segment.match.artist} - ${segment.match.title}`,
          ]);
        } else if (segment.status === 'none') {
          setLogs(current => [...current, 'No match']);
        } else if (segment.status === 'skipped') {
          setLogs(current => [...current, 'Skipped segment']);
        } else if (segment.status === 'error') {
          setLogs(current => [...current, segment.error?.message || 'Segment error']);
        }
      }),
      window.cuezy.onAnalysisWarning(({ warning }) => {
        setLogs(current => [...current, `Warning: ${warning.message}`]);
      }),
      window.cuezy.onAnalysisDone(({ result }) => {
        setIsRunning(false);
        setJobId(null);
        setStatus(`Done: ${result.tracks.length} track${result.tracks.length === 1 ? '' : 's'}`);
        setLogs(current => [
          ...current,
          `Done. Scanned ${result.segmentsScanned} segment${result.segmentsScanned === 1 ? '' : 's'}.`,
        ]);
      }),
      window.cuezy.onAnalysisError(({ error }) => {
        setIsRunning(false);
        setJobId(null);
        const cancelled = error.name === 'AbortError' || /cancel/i.test(error.message || '');
        setStatus(cancelled ? 'Cancelled' : 'Error');
        setLogs(current => [...current, `${cancelled ? 'Cancelled' : 'Error'}: ${error.message}`]);
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
      setStatus('Ready');
    }
  }

  async function handleDrop(event) {
    event.preventDefault();
    setDragActive(false);

    const file = event.dataTransfer.files?.[0];
    if (!file) return;

    const droppedPath = window.cuezy.getDroppedFilePath(file);
    if (droppedPath) {
      setFilePath(droppedPath);
      setStatus('Ready');
    } else {
      setLogs(current => [...current, 'Could not read dropped file path. Use Select file.']);
    }
  }

  async function startAnalysis() {
    setRows([]);
    setLogs([]);
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
      setStatus('Error');
      setLogs(current => [...current, `Error: ${error.message}`]);
    }
  }

  async function cancelAnalysis() {
    if (!jobId) return;
    await window.cuezy.cancelAnalysis(jobId);
    setStatus('Cancelling');
    setLogs(current => [...current, 'Cancellation requested. Current request may finish first.']);
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
    const result = await window.cuezy.copyMarkdownTracklist(rows);
    setStatus(result.copied ? 'Copied Markdown' : 'Copy failed');
  }

  async function save(format) {
    const result = await window.cuezy.saveExport(format, rows);
    if (!result.canceled) {
      setStatus(`Saved ${format.toUpperCase()}`);
      setLogs(current => [...current, `Saved ${result.filePath}`]);
    }
  }

  const canAnalyze = filePath && !isRunning;
  const ffmpegMissing = appInfo && !appInfo.ffmpegAvailable;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Cuezy</h1>
          <p>Find timestamped songs in local audio and VOD files.</p>
        </div>
        <div className="status-pill">{status}</div>
      </header>

      <section className="privacy-notice">
        Audio is processed locally, but short snippets are sent to Shazam&apos;s public recognition endpoint for identification.
      </section>

      <section className="workspace">
        <aside className="controls-panel">
          <div
            className={`drop-zone${dragActive ? ' is-active' : ''}`}
            onDragOver={event => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
          >
            <strong>{filePath ? fileName(filePath) : 'Drop an audio file'}</strong>
            <span>{filePath || 'or choose one from disk'}</span>
            <button type="button" onClick={pickFile} disabled={isRunning}>
              Select file
            </button>
          </div>

          {ffmpegMissing && (
            <div className="warning">
              ffmpeg and ffprobe are required. Install ffmpeg before analyzing.
            </div>
          )}

          <div className="settings-grid">
            <Field label="Scan step">
              <input
                type="number"
                min="1"
                value={settings.step}
                onChange={event => setNumericSetting('step', event.target.value)}
                disabled={isRunning}
              />
            </Field>
            <Field label="Segment length">
              <input
                type="number"
                min="1"
                value={settings.segment}
                onChange={event => setNumericSetting('segment', event.target.value)}
                disabled={isRunning}
              />
            </Field>
            <Field label="Start time">
              <input
                type="number"
                min="0"
                value={settings.start}
                onChange={event => setNumericSetting('start', event.target.value)}
                disabled={isRunning}
              />
            </Field>
          </div>

          <div className="action-row">
            <button type="button" className="primary" onClick={startAnalysis} disabled={!canAnalyze || ffmpegMissing}>
              Analyze
            </button>
            <button type="button" onClick={cancelAnalysis} disabled={!isRunning}>
              Cancel
            </button>
          </div>

          <div className="export-actions">
            <button type="button" onClick={copyMarkdown} disabled={rows.length === 0}>
              Copy Markdown
            </button>
            <button type="button" onClick={() => save('markdown')} disabled={rows.length === 0}>
              Save Markdown
            </button>
            <button type="button" onClick={() => save('json')} disabled={rows.length === 0}>
              Save JSON
            </button>
            <button type="button" onClick={() => save('txt')} disabled={rows.length === 0}>
              Save TXT
            </button>
          </div>
        </aside>

        <section className="results-panel">
          <div className="panel-header">
            <div>
              <h2>Tracklist</h2>
              <p>{rows.length} editable result{rows.length === 1 ? '' : 's'}</p>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Artist</th>
                  <th>Song</th>
                  <th>Album</th>
                  <th>Year</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="empty-cell">Results will appear here as Cuezy recognizes songs.</td>
                  </tr>
                ) : rows.map(row => (
                  <tr key={row.id}>
                    <td>
                      <input value={row.timestamp} onChange={event => updateRow(row.id, 'timestamp', event.target.value)} />
                    </td>
                    <td>
                      <input value={row.artist} onChange={event => updateRow(row.id, 'artist', event.target.value)} />
                    </td>
                    <td>
                      <input value={row.title} onChange={event => updateRow(row.id, 'title', event.target.value)} />
                    </td>
                    <td>
                      <input value={row.album} onChange={event => updateRow(row.id, 'album', event.target.value)} />
                    </td>
                    <td>
                      <input value={row.year} onChange={event => updateRow(row.id, 'year', event.target.value)} />
                    </td>
                    <td>
                      <button type="button" className="link-button" onClick={() => deleteRow(row.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="markdown-preview">
            <h3>Markdown preview</h3>
            <pre>{markdown || '# Tracklist'}</pre>
          </div>
        </section>
      </section>

      <section className="log-panel">
        <h2>Progress</h2>
        <div className="log-list" aria-live="polite">
          {logs.length === 0 ? (
            <p>No analysis activity yet.</p>
          ) : logs.slice(-80).map((line, index) => (
            <p key={`${line}-${index}`}>{line}</p>
          ))}
        </div>
      </section>
    </main>
  );
}
