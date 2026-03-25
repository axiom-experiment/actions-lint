'use strict';

/**
 * reporter.js — Terminal output formatter for actions-lint violations.
 *
 * Supports:
 *   - ANSI color output (red for errors, yellow for warnings, green for pass)
 *   - --json flag: structured JSON output
 *   - --quiet flag: errors only, suppress warnings
 *   - --no-color flag: plain text
 */

// ─── ANSI Color Codes ─────────────────────────────────────────────────────
const ANSI = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  cyan:    '\x1b[36m',
  gray:    '\x1b[90m',
  white:   '\x1b[37m',
};

/**
 * Apply ANSI color codes around text, unless color is disabled.
 * @param {string} text
 * @param {...string} codes — ANSI code strings
 * @returns {string}
 */
function colorize(useColor, text, ...codes) {
  if (!useColor) return text;
  return codes.join('') + text + ANSI.reset;
}

/**
 * Format a single violation line for terminal output.
 * @param {object} v — Violation
 * @param {string} filePath
 * @param {boolean} useColor
 * @returns {string}
 */
function formatViolation(v, filePath, useColor) {
  const severityLabel = v.severity === 'error'
    ? colorize(useColor, 'error', ANSI.bold, ANSI.red)
    : colorize(useColor, 'warning', ANSI.bold, ANSI.yellow);

  const loc = v.line
    ? colorize(useColor, `${filePath}:${v.line}`, ANSI.cyan)
    : colorize(useColor, filePath, ANSI.cyan);

  const rule = colorize(useColor, `[${v.rule}]`, ANSI.gray);
  const msg = v.message;

  let out = `  ${severityLabel}  ${loc}  ${rule}\n    ${msg}`;
  if (v.hint) {
    out += `\n    ${colorize(useColor, `Hint: ${v.hint}`, ANSI.gray)}`;
  }
  return out;
}

/**
 * Format results for one file.
 * @param {object} result — { file, violations, parseError? }
 * @param {object} options — { useColor, quiet }
 * @returns {string}
 */
function formatFileResult(result, options) {
  const { useColor = true, quiet = false } = options;
  const lines = [];

  if (result.parseError) {
    const label = colorize(useColor, 'parse error', ANSI.bold, ANSI.red);
    lines.push(`  ${label}  ${colorize(useColor, result.file, ANSI.cyan)}`);
    lines.push(`    ${result.parseError}`);
    return lines.join('\n');
  }

  const visibleViolations = quiet
    ? result.violations.filter(v => v.severity === 'error')
    : result.violations;

  if (visibleViolations.length === 0) return '';

  for (const v of visibleViolations) {
    lines.push(formatViolation(v, result.file, useColor));
  }

  return lines.join('\n');
}

/**
 * Format a summary line.
 * @param {object[]} results — array of file results
 * @param {object} options — { useColor }
 * @returns {string}
 */
function formatSummary(results, options) {
  const { useColor = true } = options;
  const fileCount = results.length;
  let errorCount = 0;
  let warningCount = 0;
  let parseErrorCount = 0;

  for (const r of results) {
    if (r.parseError) {
      parseErrorCount++;
      errorCount++;
    } else {
      errorCount += r.violations.filter(v => v.severity === 'error').length;
      warningCount += r.violations.filter(v => v.severity === 'warning').length;
    }
  }

  const fileLabel = `${fileCount} file${fileCount !== 1 ? 's' : ''}`;

  if (errorCount === 0) {
    const check = colorize(useColor, '✓', ANSI.bold, ANSI.green);
    const msg = colorize(useColor, `${fileLabel}, 0 errors`, ANSI.green);
    if (warningCount > 0) {
      return `${check} ${msg} (${warningCount} warning${warningCount !== 1 ? 's' : ''})`;
    }
    return `${check} ${msg}`;
  }

  const cross = colorize(useColor, '✗', ANSI.bold, ANSI.red);
  const errPart = colorize(useColor, `${errorCount} error${errorCount !== 1 ? 's' : ''}`, ANSI.red);
  const warnPart = warningCount > 0
    ? `, ${colorize(useColor, `${warningCount} warning${warningCount !== 1 ? 's' : ''}`, ANSI.yellow)}`
    : '';
  const inPart = ` in ${fileLabel}`;

  return `${cross} ${errPart}${warnPart}${inPart}`;
}

/**
 * Render all results to a terminal-ready string.
 * @param {object[]} results
 * @param {object} options — { useColor, quiet, json }
 * @returns {string}
 */
function render(results, options = {}) {
  const { json = false, useColor = true, quiet = false } = options;

  if (json) {
    return JSON.stringify(results, null, 2);
  }

  const parts = [];

  for (const result of results) {
    const block = formatFileResult(result, { useColor, quiet });
    if (block) parts.push(block);
  }

  parts.push(''); // blank line before summary
  parts.push(formatSummary(results, { useColor }));

  return parts.join('\n');
}

/**
 * Determine exit code from results (0 = no errors, 1 = errors).
 * @param {object[]} results
 * @returns {number}
 */
function exitCode(results) {
  for (const r of results) {
    if (r.parseError) return 1;
    if (r.violations.some(v => v.severity === 'error')) return 1;
  }
  return 0;
}

module.exports = { render, formatViolation, formatSummary, formatFileResult, exitCode, colorize, ANSI };
