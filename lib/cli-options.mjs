/**
 * CLI argument parsing helpers.
 */

function parseNumericFlag(flags, name, fallback) {
  if (flags[name] === undefined) return fallback;
  if (typeof flags[name] === 'boolean') return Number.NaN;
  if (flags[name].trim() === '') return Number.NaN;
  const value = Number(flags[name]);
  return value;
}

/**
 * Parse mix-id CLI arguments without performing filesystem or network work.
 *
 * @param {string[]} argv
 * @returns {{ input: string | undefined, flags: Record<string, string | boolean>, options: { step: number | null, segment: number, start: number } }}
 */
export function parseCliArgs(argv) {
  const flags = {};
  const positional = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const rawKey = arg.slice(2);
      const equalsIndex = rawKey.indexOf('=');
      if (equalsIndex !== -1) {
        flags[rawKey.slice(0, equalsIndex)] = rawKey.slice(equalsIndex + 1);
        continue;
      }

      const key = rawKey;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return {
    input: positional[0],
    flags,
    options: {
      step: flags.step === undefined ? null : parseNumericFlag(flags, 'step', null),
      segment: parseNumericFlag(flags, 'segment', 18),
      start: parseNumericFlag(flags, 'start', 0),
    },
  };
}
