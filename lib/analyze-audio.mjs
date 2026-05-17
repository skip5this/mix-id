/**
 * Importable analysis API for mix-id.
 *
 * This module is intentionally UI-agnostic so it can be reused by the CLI,
 * tests, and a future Electron main process.
 */

import { stat } from 'fs/promises';
import { basename } from 'path';
import { downloadURL, getDuration } from './audio.mjs';
import { dedupe } from './format.mjs';
import { scan, throwIfAborted } from './scanner.mjs';

/**
 * @typedef {'txt' | 'cue' | 'json'} ExportFormat
 */

/**
 * @typedef {object} AnalysisOptions
 * @property {number | null} [step] Seconds between scan points. Auto-detected when omitted or null.
 * @property {number} [segment=18] Seconds per recognition sample.
 * @property {number} [start=0] Start position in seconds.
 * @property {string} [outputDir=process.cwd()] Directory used for URL downloads.
 * @property {AbortSignal} [signal] Cancels before/after spawned processes, between segments, and during retry/rate-limit waits.
 * @property {string} [ffmpegCommand] Command or path to use for ffmpeg.
 * @property {string} [ffprobeCommand] Command or path to use for ffprobe.
 * @property {string} [ytDlpCommand] Command or path to use for yt-dlp.
 * @property {number} [rateLimitMs=3000] Delay between Shazam requests.
 * @property {boolean} [inheritDownloadProgress=false] Pipe yt-dlp output to the current process. Intended for CLI compatibility.
 * @property {(pcmBuffer: Buffer, options?: object) => Promise<object | null>} [recognize] Test hook for recognition.
 */

/**
 * @typedef {object} AnalysisRequest
 * @property {string} input Original input path or URL.
 * @property {boolean} isURL Whether the input points to an HTTP(S) URL.
 * @property {boolean} isLocalFile Whether the input points to a local file path.
 * @property {Required<Pick<AnalysisOptions, 'segment' | 'start'>> & AnalysisOptions} options Normalized analysis options.
 */

/**
 * @typedef {object} TrackResult
 * @property {string} timestamp Display timestamp for the detected track.
 * @property {number} position_sec Position in seconds for existing output compatibility.
 * @property {string} title Track title.
 * @property {string} artist Track artist.
 * @property {string} [album] Album, when available.
 * @property {string | number} [year] Year, when available.
 */

/**
 * @typedef {object} SegmentResult
 * @property {'matched' | 'duplicate' | 'none' | 'skipped' | 'error'} status Segment outcome.
 * @property {string} file Audio file path scanned.
 * @property {number} positionSec Segment start in seconds.
 * @property {string} timestamp Display timestamp.
 * @property {number} segmentIndex One-based segment index.
 * @property {number} totalSegments Estimated total segment count.
 * @property {object | null} match Recognition match, if any.
 * @property {TrackResult | null} track New track emitted by this segment, if any.
 * @property {boolean} duplicate Whether this segment repeated the previous match.
 * @property {Error} [error] Segment error, if any.
 */

/**
 * @typedef {object} AnalysisProgress
 * @property {'prepare' | 'download' | 'probe' | 'scan' | 'done'} phase Current analysis phase.
 * @property {string} input Original input path or URL.
 * @property {string} [file] Resolved local audio file path.
 * @property {number} [positionSec] Current scan position in seconds.
 * @property {string} [timestamp] Display timestamp for the current position.
 * @property {number} [segmentIndex] One-based segment index.
 * @property {number} [totalSegments] Estimated total segment count.
 * @property {number} [percent] Scan completion percentage.
 * @property {number} [duration] Audio duration in seconds.
 * @property {number} [step] Active scan step in seconds.
 * @property {number} [segment] Active sample length in seconds.
 * @property {number} [start] Active start position in seconds.
 */

/**
 * @typedef {object} AnalysisResult
 * @property {string} input Original input path or URL.
 * @property {string} file Local audio file path analyzed.
 * @property {string} source Basename of the local audio file.
 * @property {boolean} downloaded Whether the input URL was downloaded first.
 * @property {number} duration Audio duration in seconds.
 * @property {number} segmentsScanned Number of segments scanned.
 * @property {number} step Seconds between scan points.
 * @property {number} segment Seconds per recognition sample.
 * @property {number} start Start position in seconds.
 * @property {TrackResult[]} tracks Deduplicated tracks ready for export.
 * @property {TrackResult[]} rawTracks Tracks emitted by the scanner before final output dedupe.
 * @property {number} duplicatesRemoved Number of tracks removed by final output dedupe.
 */

/**
 * @typedef {object} AnalysisCallbacks
 * @property {(progress: AnalysisProgress) => void} [onProgress]
 * @property {(segment: Omit<SegmentResult, 'status' | 'match' | 'track' | 'duplicate'>) => void} [onSegmentStart]
 * @property {(segment: SegmentResult) => void} [onSegmentResult]
 * @property {(track: TrackResult) => void} [onTrackDetected]
 * @property {(warning: { message: string, error?: Error, segment?: SegmentResult, [key: string]: unknown }) => void} [onWarning]
 * @property {(error: Error) => void} [onError]
 * @property {(result: AnalysisResult) => void} [onDone]
 */

const URL_PATTERN = /^https?:\/\//i;

function validateNumber(name, value, predicate, message) {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value) || !predicate(value)) {
    throw new TypeError(`${name} ${message}`);
  }
}

/**
 * Validate and normalize analysis options.
 *
 * @param {AnalysisOptions} options
 * @returns {Required<Pick<AnalysisOptions, 'segment' | 'start'>> & AnalysisOptions}
 */
export function normalizeAnalysisOptions(options = {}) {
  const normalized = {
    ...options,
    step: options.step ?? null,
    segment: options.segment ?? 18,
    start: options.start ?? 0,
    outputDir: options.outputDir ?? process.cwd(),
  };

  if (normalized.step !== null) {
    validateNumber('step', normalized.step, value => value > 0, 'must be positive');
  }
  validateNumber('segment', normalized.segment, value => value > 0, 'must be positive');
  validateNumber('start', normalized.start, value => value >= 0, 'must be non-negative');

  return normalized;
}

/**
 * Validate an input and normalize its analysis options without starting work.
 *
 * @param {string} inputPathOrUrl
 * @param {AnalysisOptions} [options]
 * @param {{ allowUrls?: boolean, requireLocalFile?: boolean, localOnlyMessage?: string }} [requestOptions]
 * @returns {Promise<AnalysisRequest>}
 */
export async function normalizeAnalysisRequest(inputPathOrUrl, options = {}, requestOptions = {}) {
  const input = String(inputPathOrUrl || '');
  if (input.trim() === '') {
    throw new TypeError('input path or URL is required');
  }

  const isURL = URL_PATTERN.test(input);
  const allowUrls = requestOptions.allowUrls ?? true;
  if (isURL && !allowUrls) {
    throw new TypeError(requestOptions.localOnlyMessage || 'URL inputs are not supported.');
  }

  if (!isURL && requestOptions.requireLocalFile) {
    let fileStat;
    try {
      fileStat = await stat(input);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new Error(`File not found: ${input}`);
      }
      throw error;
    }

    if (!fileStat.isFile()) {
      throw new TypeError('Selected path is not a file.');
    }
  }

  return {
    input,
    isURL,
    isLocalFile: !isURL,
    options: normalizeAnalysisOptions(options),
  };
}

/**
 * Analyze a local audio file or URL and return a reusable result object.
 *
 * Cancellation is checked before and after ffmpeg/ffprobe/yt-dlp calls, between
 * segments, and during retry sleeps. A Shazam request already in flight may
 * continue until the shazam-api package returns because that dependency does
 * not expose AbortSignal support.
 *
 * @param {string} inputPathOrUrl
 * @param {AnalysisOptions} [options]
 * @param {AnalysisCallbacks} [callbacks]
 * @returns {Promise<AnalysisResult>}
 */
export async function analyzeAudio(inputPathOrUrl, options = {}, callbacks = {}) {
  try {
    const request = await normalizeAnalysisRequest(inputPathOrUrl, options, { requireLocalFile: true });
    const { input, isURL } = request;
    const opts = request.options;
    const signal = opts.signal;

    throwIfAborted(signal);

    callbacks.onProgress?.({ phase: 'prepare', input });

    let file = input;
    let downloaded = false;

    if (isURL) {
      callbacks.onProgress?.({ phase: 'download', input });
      file = await downloadURL(input, opts.outputDir, {
        signal,
        ytDlpCommand: opts.ytDlpCommand,
        stdio: opts.inheritDownloadProgress ? ['ignore', 'inherit', 'inherit'] : ['ignore', 'ignore', 'ignore'],
      });
      downloaded = true;
      throwIfAborted(signal);
      callbacks.onProgress?.({ phase: 'download', input, file });
    }

    callbacks.onProgress?.({ phase: 'probe', input, file });
    const duration = await getDuration(file, {
      signal,
      ffprobeCommand: opts.ffprobeCommand,
    });
    throwIfAborted(signal);

    const actualStep = opts.step ?? (duration > 3600 ? 60 : 30);
    callbacks.onProgress?.({
      phase: 'scan',
      input,
      file,
      duration,
      step: actualStep,
      segment: opts.segment,
      start: opts.start,
      percent: 0,
    });

    const scanResult = await scan(file, {
      step: actualStep,
      segment: opts.segment,
      start: opts.start,
      duration,
      quiet: true,
      signal,
      ffmpegCommand: opts.ffmpegCommand,
      ffprobeCommand: opts.ffprobeCommand,
      rateLimitMs: opts.rateLimitMs,
      recognize: opts.recognize,
      callbacks: {
        onProgress: progress => callbacks.onProgress?.({ ...progress, input }),
        onSegmentStart: callbacks.onSegmentStart,
        onSegmentResult: callbacks.onSegmentResult,
        onTrackDetected: callbacks.onTrackDetected,
        onWarning: callbacks.onWarning,
      },
    });

    const tracks = dedupe(scanResult.tracks);
    const result = {
      input,
      file,
      source: basename(file),
      downloaded,
      duration: scanResult.duration,
      segmentsScanned: scanResult.segmentsScanned,
      step: actualStep,
      segment: opts.segment,
      start: opts.start,
      tracks,
      rawTracks: scanResult.tracks,
      duplicatesRemoved: scanResult.tracks.length - tracks.length,
    };

    callbacks.onProgress?.({ phase: 'done', input, file, percent: 100 });
    callbacks.onDone?.(result);
    return result;
  } catch (err) {
    callbacks.onError?.(err);
    throw err;
  }
}
