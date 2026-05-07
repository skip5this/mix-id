export function normalizeTrackRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    timestamp: String(row.timestamp || ''),
    artist: String(row.artist || ''),
    title: String(row.title || row.song || ''),
    album: String(row.album || ''),
    year: String(row.year || ''),
  };
}

export function normalizeTrackRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 2000).map(normalizeTrackRow).filter(Boolean);
}

export function markdownTracklist(rows) {
  const lines = normalizeTrackRows(rows)
    .filter(row => row.timestamp || row.artist || row.title)
    .map(row => `${row.timestamp} - ${row.artist} - ${row.title}`.trim());

  return ['# Tracklist', '', ...lines].join('\n').trimEnd() + '\n';
}

export function txtTracklist(rows) {
  return normalizeTrackRows(rows)
    .filter(row => row.timestamp || row.artist || row.title)
    .map(row => `${row.artist} - ${row.title} ${row.timestamp}`.trim())
    .join('\n') + '\n';
}

export function jsonTracklist(rows) {
  return JSON.stringify({ tracks: normalizeTrackRows(rows) }, null, 2) + '\n';
}

export function buildExport(format, rows) {
  if (format === 'markdown' || format === 'md') return markdownTracklist(rows);
  if (format === 'txt') return txtTracklist(rows);
  if (format === 'json') return jsonTracklist(rows);
  throw new TypeError('Unsupported export format.');
}
