'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { parseFile, parseWorkflow } = require('../src/parser');
const {
  runAllRules,
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
} = require('../src/rules');

const FIXTURES = path.join(__dirname, 'fixtures');
const fix = name => path.join(FIXTURES, name);

/** Helper: parse fixture and extract data */
function getData(name) {
  const result = parseFile(fix(name));
  assert.equal(result.success, true, `Failed to parse ${name}: ${result.error}`);
  return result.data;
}

/** Helper: parse inline YAML string and extract data */
function getDataInline(yaml) {
  const result = parseWorkflow(yaml);
  assert.equal(result.success, true, `Failed to parse inline YAML: ${result.error}`);
  return result.data;
}

// ─── rule-no-tabs ────────────────────────────────────────────────────────
describe('rule-no-tabs', () => {
  test('passes for valid-basic.yml', () => {
    const data = getData('valid-basic.yml');
    const { violations } = ruleNoTabs(data);
    assert.equal(violations.length, 0);
  });

  test('errors on err-tabs.yml', () => {
    const data = getData('err-tabs.yml');
    const { violations } = ruleNoTabs(data);
    assert.ok(violations.length > 0);
    assert.equal(violations[0].severity, 'error');
    assert.equal(violations[0].rule, 'rule-no-tabs');
  });

  test('violation includes correct line number', () => {
    const data = getData('err-tabs.yml');
    const { violations } = ruleNoTabs(data);
    assert.ok(violations.some(v => v.line === 10), `lines: ${violations.map(v => v.line)}`);
  });
});

// ─── rule-require-on ─────────────────────────────────────────────────────
describe('rule-require-on', () => {
  test('passes when on: is present', () => {
    const data = getData('valid-basic.yml');
    const { violations } = ruleRequireOn(data);
    assert.equal(violations.length, 0);
  });

  test('errors when on: is missing', () => {
    const data = getData('err-missing-on.yml');
    const { violations } = ruleRequireOn(data);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].severity, 'error');
    assert.equal(violations[0].rule, 'rule-require-on');
  });
});

// ─── rule-require-jobs ───────────────────────────────────────────────────
describe('rule-require-jobs', () => {
  test('passes when jobs: is present', () => {
    const data = getData('valid-basic.yml');
    const { violations } = ruleRequireJobs(data);
    assert.equal(violations.length, 0);
  });

  test('errors when jobs: is missing', () => {
    const data = getData('err-missing-jobs.yml');
    const { violations } = ruleRequireJobs(data);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].severity, 'error');
    assert.equal(violations[0].rule, 'rule-require-jobs');
  });
});

// ─── rule-jobs-require-runs-on ───────────────────────────────────────────
describe('rule-jobs-require-runs-on', () => {
  test('passes when all jobs have runs-on', () => {
    const data = getData('valid-basic.yml');
    const { violations } = ruleJobsRequireRunsOn(data);
    assert.equal(violations.length, 0);
  });

  test('errors when runs-on is missing', () => {
    const data = getData('err-missing-runs-on.yml');
    const { violations } = ruleJobsRequireRunsOn(data);
    assert.ok(violations.length > 0, 'should have at least one violation');
    assert.equal(violations[0].severity, 'error');
    assert.equal(violations[0].rule, 'rule-jobs-require-runs-on');
  });

  test('violation message contains job ID', () => {
    const data = getData('err-missing-runs-on.yml');
    const { violations } = ruleJobsRequireRunsOn(data);
    assert.ok(violations[0].message.includes('build'));
  });

  test('violation includes line number', () => {
    const data = getData('err-missing-runs-on.yml');
    const { violations } = ruleJobsRequireRunsOn(data);
    assert.ok(violations[0].line > 0);
  });
});

// ─── rule-steps-require-action ───────────────────────────────────────────
describe('rule-steps-require-action', () => {
  test('passes for valid steps', () => {
    const data = getData('valid-basic.yml');
    const { violations } = ruleStepsRequireAction(data);
    assert.equal(violations.length, 0);
  });

  test('errors when step has neither uses nor run', () => {
    const data = getData('err-step-no-action.yml');
    const { violations } = ruleStepsRequireAction(data);
    assert.ok(violations.length > 0, 'expected at least one violation');
    assert.equal(violations[0].severity, 'error');
    assert.equal(violations[0].rule, 'rule-steps-require-action');
  });

  test('violation includes job ID in message', () => {
    const data = getData('err-step-no-action.yml');
    const { violations } = ruleStepsRequireAction(data);
    assert.ok(violations[0].message.includes('build'));
  });
});

// ─── rule-no-uses-and-run ────────────────────────────────────────────────
describe('rule-no-uses-and-run', () => {
  test('passes when steps only have uses OR run', () => {
    const data = getData('valid-basic.yml');
    const { violations } = ruleNoUsesAndRun(data);
    assert.equal(violations.length, 0);
  });

  test('errors when step has both uses and run', () => {
    const data = getData('err-both-uses-and-run.yml');
    const { violations } = ruleNoUsesAndRun(data);
    assert.ok(violations.length > 0, 'expected at least one violation');
    assert.equal(violations[0].severity, 'error');
    assert.equal(violations[0].rule, 'rule-no-uses-and-run');
  });

  test('violation message contains job ID', () => {
    const data = getData('err-both-uses-and-run.yml');
    const { violations } = ruleNoUsesAndRun(data);
    assert.ok(violations[0].message.includes('build'));
  });
});

// ─── rule-valid-triggers ─────────────────────────────────────────────────
describe('rule-valid-triggers', () => {
  test('passes for all valid triggers in valid-complex.yml', () => {
    const result = parseFile(fix('valid-complex.yml'));
    const { violations } = ruleValidTriggers(result.data, result.data.rawLines);
    assert.equal(violations.length, 0, `unexpected violations: ${JSON.stringify(violations)}`);
  });

  test('warns for invalid trigger', () => {
    const result = parseFile(fix('err-invalid-trigger.yml'));
    const { violations } = ruleValidTriggers(result.data, result.data.rawLines);
    assert.ok(violations.length > 0, `triggers were: ${JSON.stringify(result.data.triggers)}`);
    assert.equal(violations[0].severity, 'warning');
    assert.equal(violations[0].rule, 'rule-valid-triggers');
  });

  test('violation message contains trigger name', () => {
    const result = parseFile(fix('err-invalid-trigger.yml'));
    const { violations } = ruleValidTriggers(result.data, result.data.rawLines);
    assert.ok(violations.some(v => v.message.includes('invalid_event_name')));
  });

  test('warns for second invalid trigger', () => {
    const result = parseFile(fix('err-invalid-trigger.yml'));
    const { violations } = ruleValidTriggers(result.data, result.data.rawLines);
    assert.ok(violations.some(v => v.message.includes('another_bad_trigger')));
  });
});

// ─── rule-no-duplicate-jobs ──────────────────────────────────────────────
describe('rule-no-duplicate-jobs', () => {
  test('passes for unique job IDs', () => {
    const result = parseFile(fix('valid-complex.yml'));
    const { violations } = ruleNoDuplicateJobs(result.data, result.data.rawLines);
    assert.equal(violations.length, 0);
  });

  test('errors on duplicate job ID', () => {
    const result = parseFile(fix('err-duplicate-jobs.yml'));
    const { violations } = ruleNoDuplicateJobs(result.data, result.data.rawLines);
    assert.ok(violations.length > 0, 'expected duplicate job violation');
    assert.equal(violations[0].severity, 'error');
    assert.equal(violations[0].rule, 'rule-no-duplicate-jobs');
  });

  test('violation message contains duplicate job ID', () => {
    const result = parseFile(fix('err-duplicate-jobs.yml'));
    const { violations } = ruleNoDuplicateJobs(result.data, result.data.rawLines);
    assert.ok(violations[0].message.includes('build'));
  });

  test('violation includes line number', () => {
    const result = parseFile(fix('err-duplicate-jobs.yml'));
    const { violations } = ruleNoDuplicateJobs(result.data, result.data.rawLines);
    assert.ok(violations[0].line > 0);
  });
});

// ─── rule-recommend-name ─────────────────────────────────────────────────
describe('rule-recommend-name', () => {
  test('passes when name: is present', () => {
    const data = getData('valid-basic.yml');
    const { violations } = ruleRecommendName(data);
    assert.equal(violations.length, 0);
  });

  test('warns when name: is missing', () => {
    const data = getData('warn-no-name.yml');
    const { violations } = ruleRecommendName(data);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].severity, 'warning');
    assert.equal(violations[0].rule, 'rule-recommend-name');
  });
});

// ─── rule-no-empty-steps ─────────────────────────────────────────────────
describe('rule-no-empty-steps', () => {
  test('passes when job has steps', () => {
    const data = getData('valid-basic.yml');
    const { violations } = ruleNoEmptySteps(data);
    assert.equal(violations.length, 0);
  });

  test('warns on job with empty steps array', () => {
    // Inline fixture: job with "steps:" but no items
    const yaml = `name: Test\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n`;
    const data = getDataInline(yaml);
    const { violations } = ruleNoEmptySteps(data);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].severity, 'warning');
    assert.equal(violations[0].rule, 'rule-no-empty-steps');
  });

  test('no violation when job has no steps key at all', () => {
    // A job without "steps:" is caught by other rules, not this one
    const data = getData('err-missing-runs-on.yml');
    const { violations } = ruleNoEmptySteps(data);
    assert.equal(violations.length, 0);
  });
});

// ─── rule-checkout-version ───────────────────────────────────────────────
describe('rule-checkout-version', () => {
  test('passes when checkout has version tag', () => {
    const result = parseFile(fix('valid-basic.yml'));
    const { violations } = ruleCheckoutVersion(result.data, result.data.rawLines);
    assert.equal(violations.length, 0);
  });

  test('warns when checkout has no version', () => {
    const yaml = `name: Test\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout\n`;
    const result = parseWorkflow(yaml);
    const { violations } = ruleCheckoutVersion(result.data, result.data.rawLines);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].severity, 'warning');
    assert.equal(violations[0].rule, 'rule-checkout-version');
  });

  test('violation includes line number', () => {
    const yaml = `name: Test\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout\n`;
    const result = parseWorkflow(yaml);
    const { violations } = ruleCheckoutVersion(result.data, result.data.rawLines);
    assert.ok(violations[0].line > 0);
  });

  test('does not warn for actions/checkout@v4', () => {
    const result = parseFile(fix('valid-complex.yml'));
    const { violations } = ruleCheckoutVersion(result.data, result.data.rawLines);
    assert.equal(violations.length, 0);
  });
});

// ─── rule-long-run-scripts ───────────────────────────────────────────────
describe('rule-long-run-scripts', () => {
  test('passes for short run commands', () => {
    const result = parseFile(fix('valid-basic.yml'));
    const { violations } = ruleLongRunScripts(result.data, result.data.rawLines);
    assert.equal(violations.length, 0);
  });

  test('warns when run: line exceeds 200 chars', () => {
    const longScript = 'x'.repeat(201);
    const yaml = `name: Test\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ${longScript}\n`;
    const result = parseWorkflow(yaml);
    const { violations } = ruleLongRunScripts(result.data, result.data.rawLines);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].severity, 'warning');
    assert.equal(violations[0].rule, 'rule-long-run-scripts');
  });

  test('passes for exactly 200 char run command', () => {
    const script = 'x'.repeat(200);
    const yaml = `name: Test\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: ${script}\n`;
    const result = parseWorkflow(yaml);
    const { violations } = ruleLongRunScripts(result.data, result.data.rawLines);
    assert.equal(violations.length, 0);
  });
});

// ─── runAllRules integration ─────────────────────────────────────────────
describe('runAllRules — integration', () => {
  test('valid-basic.yml: 0 errors', () => {
    const result = parseFile(fix('valid-basic.yml'));
    const violations = runAllRules(result);
    const errors = violations.filter(v => v.severity === 'error');
    assert.equal(errors.length, 0, `unexpected errors: ${JSON.stringify(errors)}`);
  });

  test('valid-complex.yml: 0 errors', () => {
    const result = parseFile(fix('valid-complex.yml'));
    const violations = runAllRules(result);
    const errors = violations.filter(v => v.severity === 'error');
    assert.equal(errors.length, 0, `unexpected errors: ${JSON.stringify(errors)}`);
  });

  test('valid-complex.yml: 0 warnings', () => {
    const result = parseFile(fix('valid-complex.yml'));
    const violations = runAllRules(result);
    const warnings = violations.filter(v => v.severity === 'warning');
    assert.equal(warnings.length, 0, `unexpected warnings: ${JSON.stringify(warnings)}`);
  });

  test('err-missing-on.yml: has rule-require-on error', () => {
    const result = parseFile(fix('err-missing-on.yml'));
    const violations = runAllRules(result);
    assert.ok(violations.some(v => v.rule === 'rule-require-on'));
  });

  test('err-missing-jobs.yml: has rule-require-jobs error', () => {
    const result = parseFile(fix('err-missing-jobs.yml'));
    const violations = runAllRules(result);
    assert.ok(violations.some(v => v.rule === 'rule-require-jobs'));
  });

  test('warn-no-name.yml: has warning, no errors', () => {
    const result = parseFile(fix('warn-no-name.yml'));
    const violations = runAllRules(result);
    const errors = violations.filter(v => v.severity === 'error');
    const warnings = violations.filter(v => v.severity === 'warning');
    assert.equal(errors.length, 0);
    assert.ok(warnings.length > 0);
  });

  test('runAllRules returns [] for failed parse', () => {
    const violations = runAllRules(null);
    assert.deepEqual(violations, []);
  });

  test('runAllRules returns [] for parse result with success=false', () => {
    const violations = runAllRules({ success: false, data: null });
    assert.deepEqual(violations, []);
  });
});
