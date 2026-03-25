'use strict';

/**
 * parser.js — Custom YAML structure parser for GitHub Actions workflow files.
 *
 * Parses the 99% of workflow patterns without any external dependencies.
 * Does NOT handle anchors/aliases, complex multi-line strings, or full YAML spec.
 *
 * Returns:
 *   { success: boolean, error?: string, data: ParsedWorkflow }
 *
 * ParsedWorkflow:
 *   {
 *     topLevelKeys: string[],
 *     jobs: { [jobId]: { indent: number, line: number, keys: string[], steps: { line: number, keys: string[] }[] } },
 *     rawLines: string[],
 *     triggers: string[],
 *     tabLines: number[],        // 1-based line numbers that contain tab indentation
 *     hasName: boolean,
 *     hasOn: boolean,
 *     hasJobs: boolean,
 *   }
 */

/**
 * Count leading spaces in a string (stops at first non-space character).
 * @param {string} line
 * @returns {number}
 */
function indentOf(line) {
  let count = 0;
  for (const ch of line) {
    if (ch === ' ') count++;
    else break;
  }
  return count;
}

/**
 * Check if a line is blank or a comment.
 * @param {string} line
 * @returns {boolean}
 */
function isBlankOrComment(line) {
  const trimmed = line.trim();
  return trimmed === '' || trimmed.startsWith('#');
}

/**
 * Extract the YAML key from a line like "  key: value" → "key"
 * Handles sequence items: "- uses: actions/checkout" → "uses"
 * Returns null if no key found.
 * @param {string} line
 * @returns {string|null}
 */
function extractKey(line) {
  const trimmed = line.trim();
  // Handle sequence item: "- key: value"
  if (trimmed.startsWith('- ') || trimmed === '-') {
    const inner = trimmed.slice(1).trim();
    const colonIdx = inner.indexOf(':');
    if (colonIdx > 0) {
      return inner.slice(0, colonIdx).trim();
    }
    return null;
  }
  const colonIdx = trimmed.indexOf(':');
  if (colonIdx <= 0) return null;
  return trimmed.slice(0, colonIdx).trim();
}

/**
 * Extract the value portion after the first colon on a line.
 * Returns empty string if no value (e.g., "jobs:" alone).
 * @param {string} line
 * @returns {string}
 */
function extractValue(line) {
  const trimmed = line.trim();
  let source = trimmed;
  if (trimmed.startsWith('- ')) {
    source = trimmed.slice(2).trim();
  } else if (trimmed === '-') {
    return '';
  }
  const colonIdx = source.indexOf(':');
  if (colonIdx < 0) return source; // plain sequence value
  return source.slice(colonIdx + 1).trim();
}

/**
 * Parse trigger values from inline "on:" syntax.
 * Handles: "push", "[push, pull_request]", "push, pull_request"
 * @param {string} val
 * @param {string[]} triggers
 */
function parseTriggerValue(val, triggers) {
  const clean = val.replace(/[\[\]]/g, '');
  const parts = clean.split(',');
  for (const part of parts) {
    const t = part.trim();
    if (t) triggers.push(t);
  }
}

/**
 * Main parser entry point.
 * @param {string} content — raw file content
 * @returns {{ success: boolean, error?: string, data: object }}
 */
function parseWorkflow(content) {
  // Guard against empty input
  if (!content || !content.trim()) {
    return { success: false, error: 'File is empty', data: null };
  }

  const rawLines = content.split('\n');
  const tabLines = [];
  const topLevelKeys = [];
  const jobs = {};
  const triggers = [];
  let hasName = false;
  let hasOn = false;
  let hasJobs = false;

  // Pass 1: detect tab characters (tab indentation is a YAML error)
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.match(/^\t/) || line.match(/ \t/)) {
      tabLines.push(i + 1); // 1-based
    }
  }

  // Pass 2: structural parsing via a simple state machine.
  //
  // States:
  //   "root"  — reading top-level keys (indent 0)
  //   "on"    — reading the on: block (trigger names are at onIndent+2)
  //   "jobs"  — reading job IDs (indent = jobsIndent+2)
  //   "job"   — reading keys inside a specific job
  //   "steps" — reading steps array inside a job

  let state = 'root';
  let currentJobId = null;
  let inStepsBlock = false;
  let stepsIndent = -1;
  let currentStepKeys = null;
  let currentStepLine = -1;
  let jobsIndent = -1;
  let onIndent = -1;          // indent of the "on:" line itself
  let triggerIndent = -1;     // expected indent for trigger-level keys (onIndent+2)
  let jobBodyIndent = -1;

  // Helper: flush the current step into its job's steps array
  function flushStep() {
    if (currentStepKeys !== null && currentJobId && jobs[currentJobId]) {
      jobs[currentJobId].steps.push({ line: currentStepLine, keys: currentStepKeys });
    }
    currentStepKeys = null;
    currentStepLine = -1;
  }

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const lineNum = i + 1; // 1-based

    if (isBlankOrComment(line)) continue;

    const indent = indentOf(line);
    const trimmed = line.trim();
    const isSeqItem = trimmed.startsWith('- ') || trimmed === '-';

    // ── ROOT level (indent === 0, non-sequence) ──────────────────────────
    if (indent === 0 && !isSeqItem) {
      const key = extractKey(line);
      if (key) {
        topLevelKeys.push(key);
        if (key === 'name') hasName = true;

        if (key === 'on') {
          hasOn = true;
          onIndent = 0;
          triggerIndent = 2; // trigger keys live at indent 2 under "on:" at indent 0
          const val = extractValue(line);
          if (val && val !== '') {
            // Inline: "on: push" or "on: [push, pull_request]"
            parseTriggerValue(val, triggers);
            state = 'root';
          } else {
            state = 'on';
          }
        } else if (key === 'jobs') {
          hasJobs = true;
          jobsIndent = 0;
          state = 'jobs';
          currentJobId = null;
          inStepsBlock = false;
        } else {
          state = 'root';
        }
      }
      continue;
    }

    // ── ON block ─────────────────────────────────────────────────────────
    // Trigger names are keys at exactly triggerIndent (typically 2).
    // Sub-keys of triggers (e.g., "branches:", branch names) are DEEPER
    // and must be skipped — they are not trigger event names.
    if (state === 'on') {
      if (indent === 0 && !isSeqItem) {
        // Back to root level
        i--;
        state = 'root';
        continue;
      }

      if (indent === triggerIndent) {
        // This is a trigger event name (e.g., "push:", "pull_request:")
        if (isSeqItem) {
          // Sequence-form: "- push"
          const val = trimmed.slice(1).trim().replace(/:.*$/, '').trim();
          if (val) triggers.push(val);
        } else {
          const key = extractKey(line);
          if (key) triggers.push(key);
        }
      }
      // Lines deeper than triggerIndent are sub-config of a trigger — skip them.
      continue;
    }

    // ── JOBS block ───────────────────────────────────────────────────────
    if (state === 'jobs' || state === 'job' || state === 'steps') {
      const jobIdIndent = jobsIndent + 2; // typically 2

      // Back to root
      if (indent === 0 && !isSeqItem) {
        flushStep();
        state = 'root';
        i--;
        continue;
      }

      // New job ID — at exactly jobIdIndent, not a sequence item, not in steps
      if (indent === jobIdIndent && !isSeqItem && state !== 'steps') {
        flushStep();
        const key = extractKey(line);
        // Exclude known job-level property names that could appear here
        const JOB_PROPS = new Set([
          'needs', 'runs-on', 'steps', 'env', 'if', 'strategy', 'outputs',
          'permissions', 'timeout-minutes', 'continue-on-error', 'container',
          'services', 'defaults', 'concurrency', 'name', 'with',
        ]);
        if (key && !JOB_PROPS.has(key)) {
          currentJobId = key;
          jobBodyIndent = indent + 2; // typically 4
          inStepsBlock = false;
          stepsIndent = -1;
          if (!jobs[key]) {
            jobs[key] = { indent, line: lineNum, keys: [], steps: [] };
          }
          state = 'job';
        }
        continue;
      }

      // Inside a job body (keys at jobBodyIndent)
      if (state === 'job' && currentJobId) {
        if (indent === jobBodyIndent && !isSeqItem) {
          const key = extractKey(line);
          if (key) {
            jobs[currentJobId].keys.push(key);
            if (key === 'steps') {
              inStepsBlock = true;
              stepsIndent = indent;
              state = 'steps';
            }
          }
        }
        continue;
      }

      // Inside steps block
      if (state === 'steps' && currentJobId) {
        const stepItemIndent = stepsIndent + 2; // step "- " lines

        // Dedented out of steps entirely
        if (indent < stepsIndent) {
          flushStep();
          inStepsBlock = false;
          state = 'job';
          i--;
          continue;
        }

        // Back at job-body level with a non-sequence key (e.g., "env:" after "steps:")
        if (indent === stepsIndent && !isSeqItem) {
          flushStep();
          inStepsBlock = false;
          state = 'job';
          i--;
          continue;
        }

        // New step: "- ..." at stepItemIndent
        if (isSeqItem && indent === stepItemIndent) {
          flushStep();
          currentStepLine = lineNum;
          currentStepKeys = [];
          // Inline key on step opener: "- uses: actions/checkout"
          const inner = trimmed.slice(1).trim();
          const innerColonIdx = inner.indexOf(':');
          if (innerColonIdx > 0) {
            currentStepKeys.push(inner.slice(0, innerColonIdx).trim());
          }
          continue;
        }

        // Continuation key lines within the current step
        if (!isSeqItem && indent >= stepItemIndent + 2 && currentStepKeys !== null) {
          const key = extractKey(line);
          if (key) currentStepKeys.push(key);
          continue;
        }
      }
    }
  }

  // Flush any in-progress step
  flushStep();

  return {
    success: true,
    data: {
      topLevelKeys,
      jobs,
      rawLines,
      triggers,
      tabLines,
      hasName,
      hasOn,
      hasJobs,
    },
  };
}

/**
 * Parse a workflow file from disk.
 * @param {string} filePath
 * @returns {{ success: boolean, error?: string, data?: object }}
 */
function parseFile(filePath) {
  const fs = require('fs');
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { success: false, error: `Cannot read file: ${err.message}`, data: null };
  }
  return parseWorkflow(content);
}

module.exports = { parseWorkflow, parseFile };
