'use strict';

/**
 * rules.js — Validation rules for GitHub Actions workflow files.
 *
 * Each rule is a function: (parsedData, rawLines) => { violations: Violation[] }
 *
 * Violation:
 *   {
 *     severity: 'error' | 'warning',
 *     rule: string,
 *     message: string,
 *     line?: number,   // 1-based
 *     hint?: string,
 *   }
 */

// ─── Valid GitHub Events ───────────────────────────────────────────────────
const VALID_TRIGGERS = new Set([
  'push', 'pull_request', 'pull_request_target', 'schedule',
  'workflow_dispatch', 'workflow_call', 'workflow_run',
  'repository_dispatch', 'release', 'issues', 'issue_comment',
  'create', 'delete', 'deployment', 'deployment_status', 'fork',
  'gollum', 'label', 'milestone', 'page_build', 'project',
  'project_card', 'project_column', 'public', 'pull_request_review',
  'pull_request_review_comment', 'registry_package', 'status', 'watch',
  'check_run', 'check_suite', 'member', 'merge_group',
  'discussion', 'discussion_comment',
]);

// ─── Individual Rule Implementations ──────────────────────────────────────

/**
 * rule-no-tabs: YAML files must not use tab indentation.
 */
function ruleNoTabs(parsedData) {
  const violations = [];
  for (const lineNum of parsedData.tabLines) {
    violations.push({
      severity: 'error',
      rule: 'rule-no-tabs',
      message: 'Tab character found — YAML requires spaces for indentation',
      line: lineNum,
      hint: 'Replace tab with spaces (2 spaces per indent level is conventional)',
    });
  }
  return { violations };
}

/**
 * rule-require-on: Workflow must have an `on:` trigger block.
 */
function ruleRequireOn(parsedData) {
  if (parsedData.hasOn) return { violations: [] };
  return {
    violations: [{
      severity: 'error',
      rule: 'rule-require-on',
      message: 'Workflow is missing an `on:` trigger definition',
      hint: 'Add an `on:` block, e.g.: on: push',
    }],
  };
}

/**
 * rule-require-jobs: Workflow must have a `jobs:` section.
 */
function ruleRequireJobs(parsedData) {
  if (parsedData.hasJobs) return { violations: [] };
  return {
    violations: [{
      severity: 'error',
      rule: 'rule-require-jobs',
      message: 'Workflow is missing a `jobs:` section',
      hint: 'Add a `jobs:` block with at least one job definition',
    }],
  };
}

/**
 * rule-jobs-require-runs-on: Every job must specify `runs-on`.
 */
function ruleJobsRequireRunsOn(parsedData) {
  const violations = [];
  for (const [jobId, job] of Object.entries(parsedData.jobs)) {
    if (!job.keys.includes('runs-on')) {
      violations.push({
        severity: 'error',
        rule: 'rule-jobs-require-runs-on',
        message: `Job "${jobId}" is missing required field \`runs-on\``,
        line: job.line,
        hint: 'Add `runs-on: ubuntu-latest` (or another runner) to this job',
      });
    }
  }
  return { violations };
}

/**
 * rule-steps-require-action: Every step must have `uses:` or `run:`.
 */
function ruleStepsRequireAction(parsedData) {
  const violations = [];
  for (const [jobId, job] of Object.entries(parsedData.jobs)) {
    for (const step of job.steps) {
      const hasUses = step.keys.includes('uses');
      const hasRun = step.keys.includes('run');
      if (!hasUses && !hasRun) {
        violations.push({
          severity: 'error',
          rule: 'rule-steps-require-action',
          message: `A step in job "${jobId}" has neither \`uses\` nor \`run\``,
          line: step.line,
          hint: 'Every step must either reference an action with `uses` or run a command with `run`',
        });
      }
    }
  }
  return { violations };
}

/**
 * rule-no-uses-and-run: A step cannot have both `uses:` and `run:`.
 */
function ruleNoUsesAndRun(parsedData) {
  const violations = [];
  for (const [jobId, job] of Object.entries(parsedData.jobs)) {
    for (const step of job.steps) {
      const hasUses = step.keys.includes('uses');
      const hasRun = step.keys.includes('run');
      if (hasUses && hasRun) {
        violations.push({
          severity: 'error',
          rule: 'rule-no-uses-and-run',
          message: `A step in job "${jobId}" has both \`uses\` and \`run\` — only one is allowed`,
          line: step.line,
          hint: 'Remove either `uses` or `run` from this step',
        });
      }
    }
  }
  return { violations };
}

/**
 * rule-valid-triggers: Triggers must be recognized GitHub event names.
 */
function ruleValidTriggers(parsedData, rawLines) {
  const violations = [];
  for (const trigger of parsedData.triggers) {
    if (!VALID_TRIGGERS.has(trigger)) {
      const lineNum = findTriggerLine(trigger, rawLines);
      violations.push({
        severity: 'warning',
        rule: 'rule-valid-triggers',
        message: `Unrecognized trigger event: "${trigger}"`,
        line: lineNum,
        hint: 'Check https://docs.github.com/en/actions/writing-workflows/choosing-when-your-workflow-runs/events-that-trigger-workflows for valid event names',
      });
    }
  }
  return { violations };
}

/**
 * Find the 1-based line number where a trigger name appears.
 * @param {string} trigger
 * @param {string[]} rawLines
 * @returns {number|undefined}
 */
function findTriggerLine(trigger, rawLines) {
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.includes(trigger)) return i + 1;
  }
  return undefined;
}

/**
 * rule-no-duplicate-jobs: Job IDs must be unique.
 * Detects duplicates by scanning rawLines directly (the parser keeps only the first occurrence).
 */
function ruleNoDuplicateJobs(parsedData, rawLines) {
  const violations = [];
  const seen = new Map(); // jobId → first line number
  const jobsIndent = 2;   // job IDs are at indent 2 (one level under `jobs:` at indent 0)

  let inJobs = false;
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const indent = countLeadingSpaces(line);
    const trimmed = line.trim();

    if (indent === 0) {
      inJobs = trimmed === 'jobs:' || trimmed.startsWith('jobs:');
    }

    if (inJobs && indent === jobsIndent && !trimmed.startsWith('- ') && trimmed.includes(':')) {
      const colonIdx = trimmed.indexOf(':');
      const key = trimmed.slice(0, colonIdx).trim();
      if (seen.has(key)) {
        violations.push({
          severity: 'error',
          rule: 'rule-no-duplicate-jobs',
          message: `Duplicate job ID: "${key}" (first defined at line ${seen.get(key)})`,
          line: i + 1,
          hint: 'Each job ID must be unique within the workflow',
        });
      } else {
        seen.set(key, i + 1);
      }
    }
  }
  return { violations };
}

/**
 * Count leading spaces (not tabs).
 * @param {string} line
 * @returns {number}
 */
function countLeadingSpaces(line) {
  let count = 0;
  for (const ch of line) {
    if (ch === ' ') count++;
    else break;
  }
  return count;
}

/**
 * rule-recommend-name: Workflow should have a top-level `name:` field.
 */
function ruleRecommendName(parsedData) {
  if (parsedData.hasName) return { violations: [] };
  return {
    violations: [{
      severity: 'warning',
      rule: 'rule-recommend-name',
      message: 'Workflow is missing a `name:` field',
      hint: 'Add a descriptive name at the top of your workflow, e.g.: name: CI',
    }],
  };
}

/**
 * rule-no-empty-steps: Jobs should not have an empty steps list.
 */
function ruleNoEmptySteps(parsedData) {
  const violations = [];
  for (const [jobId, job] of Object.entries(parsedData.jobs)) {
    // Only warn if the job has a "steps:" key but zero parsed steps
    if (job.keys.includes('steps') && job.steps.length === 0) {
      violations.push({
        severity: 'warning',
        rule: 'rule-no-empty-steps',
        message: `Job "${jobId}" has an empty \`steps\` list`,
        line: job.line,
        hint: 'Add at least one step to the job',
      });
    }
  }
  return { violations };
}

/**
 * rule-checkout-version: Warn if actions/checkout is used without a version tag.
 */
function ruleCheckoutVersion(parsedData, rawLines) {
  const violations = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    // Match lines like: uses: actions/checkout  (no @version suffix)
    if (/uses:\s+actions\/checkout\s*$/.test(line)) {
      violations.push({
        severity: 'warning',
        rule: 'rule-checkout-version',
        message: '`actions/checkout` used without a version tag',
        line: i + 1,
        hint: 'Pin to a specific version for reproducibility, e.g.: uses: actions/checkout@v4',
      });
    }
  }
  return { violations };
}

/**
 * rule-long-run-scripts: Warn if a `run:` value exceeds 200 characters on a single line.
 * Handles both "run: value" and "- run: value" (sequence item) forms.
 */
function ruleLongRunScripts(parsedData, rawLines) {
  const violations = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();
    // Match "run: value" or "- run: value" — exclude block scalar openers (| or >)
    const match = trimmed.match(/^(?:-\s+)?run:\s+(.+)$/);
    if (match) {
      const scriptValue = match[1];
      // Skip block scalars (value is just "|" or ">", content is on subsequent lines)
      if (scriptValue === '|' || scriptValue === '>' || scriptValue === '|-' || scriptValue === '>-') {
        continue;
      }
      if (scriptValue.length > 200) {
        violations.push({
          severity: 'warning',
          rule: 'rule-long-run-scripts',
          message: `Inline \`run:\` script is ${scriptValue.length} characters long (limit: 200)`,
          line: i + 1,
          hint: 'Consider extracting long scripts to a shell script file (e.g., scripts/build.sh)',
        });
      }
    }
  }
  return { violations };
}

// ─── Rule Runner ──────────────────────────────────────────────────────────

/**
 * All registered rules in execution order.
 */
const ALL_RULES = [
  ruleNoTabs,
  ruleRequireOn,
  ruleRequireJobs,
  ruleJobsRequireRunsOn,
  ruleStepsRequireAction,
  ruleNoUsesAndRun,
  ruleValidTriggers,
  ruleNoDuplicateJobs,
  ruleRecommendName,
  ruleNoEmptySteps,
  ruleCheckoutVersion,
  ruleLongRunScripts,
];

/**
 * Run all rules against parsed workflow data.
 * @param {{ success: boolean, data: object }} parseResult
 * @returns {Violation[]}
 */
function runAllRules(parseResult) {
  if (!parseResult || !parseResult.success || !parseResult.data) return [];
  const { data } = parseResult;
  const { rawLines } = data;
  const allViolations = [];
  for (const rule of ALL_RULES) {
    const { violations } = rule(data, rawLines);
    allViolations.push(...violations);
  }
  return allViolations;
}

module.exports = {
  runAllRules,
  // Export individual rules for testing
  ruleNoTabs,
  ruleRequireOn,
  ruleRequireJobs,
  ruleJobsRequireRunsOn,
  ruleStepsRequireAction,
  ruleNoUsesAndRun,
  ruleValidTriggers,
  ruleNoDuplicateJobs,
  ruleRecommendName,
  ruleNoEmptySteps,
  ruleCheckoutVersion,
  ruleLongRunScripts,
  VALID_TRIGGERS,
};
