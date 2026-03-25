'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { validateWorkflow, validateDirectory } = require('../src/index');

const FIXTURES = path.join(__dirname, 'fixtures');
const fix = name => path.join(FIXTURES, name);

// ─── validateWorkflow ────────────────────────────────────────────────────
describe('validateWorkflow', () => {
  test('returns { file, violations } for valid-basic.yml', () => {
    const result = validateWorkflow(fix('valid-basic.yml'));
    assert.ok('file' in result, 'missing file property');
    assert.ok('violations' in result, 'missing violations property');
    assert.ok(Array.isArray(result.violations));
  });

  test('returns 0 violations for valid-basic.yml', () => {
    const result = validateWorkflow(fix('valid-basic.yml'));
    assert.equal(result.violations.length, 0, JSON.stringify(result.violations));
  });

  test('returns 0 errors for valid-complex.yml', () => {
    const result = validateWorkflow(fix('valid-complex.yml'));
    const errors = result.violations.filter(v => v.severity === 'error');
    assert.equal(errors.length, 0, JSON.stringify(errors));
  });

  test('returns parseError for non-existent file', () => {
    const result = validateWorkflow('/no/such/workflow.yml');
    assert.ok(result.parseError, 'expected parseError');
    assert.equal(result.violations.length, 0);
  });

  test('returns error violation for err-missing-on.yml', () => {
    const result = validateWorkflow(fix('err-missing-on.yml'));
    assert.ok(result.violations.some(v => v.rule === 'rule-require-on'));
  });

  test('returns error violation for err-missing-jobs.yml', () => {
    const result = validateWorkflow(fix('err-missing-jobs.yml'));
    assert.ok(result.violations.some(v => v.rule === 'rule-require-jobs'));
  });

  test('returns error violation for err-missing-runs-on.yml', () => {
    const result = validateWorkflow(fix('err-missing-runs-on.yml'));
    assert.ok(result.violations.some(v => v.rule === 'rule-jobs-require-runs-on'));
  });

  test('returns error violation for err-step-no-action.yml', () => {
    const result = validateWorkflow(fix('err-step-no-action.yml'));
    assert.ok(result.violations.some(v => v.rule === 'rule-steps-require-action'));
  });

  test('returns error violation for err-both-uses-and-run.yml', () => {
    const result = validateWorkflow(fix('err-both-uses-and-run.yml'));
    assert.ok(result.violations.some(v => v.rule === 'rule-no-uses-and-run'));
  });

  test('returns error violation for err-duplicate-jobs.yml', () => {
    const result = validateWorkflow(fix('err-duplicate-jobs.yml'));
    assert.ok(result.violations.some(v => v.rule === 'rule-no-duplicate-jobs'));
  });

  test('returns warning for err-invalid-trigger.yml', () => {
    const result = validateWorkflow(fix('err-invalid-trigger.yml'));
    assert.ok(result.violations.some(v => v.rule === 'rule-valid-triggers' && v.severity === 'warning'));
  });

  test('returns warning for warn-no-name.yml', () => {
    const result = validateWorkflow(fix('warn-no-name.yml'));
    assert.ok(result.violations.some(v => v.rule === 'rule-recommend-name'));
  });

  test('file path in result is absolute', () => {
    const result = validateWorkflow(fix('valid-basic.yml'));
    assert.ok(path.isAbsolute(result.file), `file path not absolute: ${result.file}`);
  });

  test('violations have required fields (severity, rule, message)', () => {
    const result = validateWorkflow(fix('err-missing-on.yml'));
    for (const v of result.violations) {
      assert.ok(['error', 'warning'].includes(v.severity), `invalid severity: ${v.severity}`);
      assert.ok(typeof v.rule === 'string' && v.rule.length > 0);
      assert.ok(typeof v.message === 'string' && v.message.length > 0);
    }
  });

  test('err-tabs.yml returns tab error', () => {
    const result = validateWorkflow(fix('err-tabs.yml'));
    assert.ok(result.violations.some(v => v.rule === 'rule-no-tabs'));
  });
});

// ─── validateDirectory ───────────────────────────────────────────────────
describe('validateDirectory', () => {
  test('returns an array', () => {
    const results = validateDirectory(FIXTURES);
    assert.ok(Array.isArray(results));
  });

  test('finds all yml files in fixtures directory', () => {
    const results = validateDirectory(FIXTURES);
    // There are 11 fixture files
    assert.ok(results.length >= 11, `found only ${results.length} files`);
  });

  test('each result has file property', () => {
    const results = validateDirectory(FIXTURES);
    for (const r of results) {
      assert.ok('file' in r, `result missing file property: ${JSON.stringify(r)}`);
    }
  });

  test('each result has violations array', () => {
    const results = validateDirectory(FIXTURES);
    for (const r of results) {
      if (!r.parseError) {
        assert.ok(Array.isArray(r.violations), `violations not array for ${r.file}`);
      }
    }
  });

  test('returns empty array for directory with no yml files', () => {
    const results = validateDirectory(path.join(__dirname, '..', 'bin'));
    assert.deepEqual(results, []);
  });

  test('results are in consistent order (sorted by path)', () => {
    const results = validateDirectory(FIXTURES);
    const files = results.map(r => r.file);
    const sorted = [...files].sort();
    assert.deepEqual(files, sorted);
  });

  test('consolidates: valid and invalid files both appear', () => {
    const results = validateDirectory(FIXTURES);
    const hasValid = results.some(r => !r.parseError && r.violations.filter(v => v.severity === 'error').length === 0);
    const hasErrors = results.some(r => r.parseError || r.violations.some(v => v.severity === 'error'));
    assert.ok(hasValid, 'expected at least one valid file result');
    assert.ok(hasErrors, 'expected at least one error result');
  });
});

// ─── JSON output shape ───────────────────────────────────────────────────
describe('JSON output shape', () => {
  test('validateWorkflow result is JSON-serializable', () => {
    const result = validateWorkflow(fix('valid-basic.yml'));
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);
    assert.equal(parsed.file, result.file);
    assert.deepEqual(parsed.violations, result.violations);
  });

  test('validateDirectory result is JSON-serializable', () => {
    const results = validateDirectory(FIXTURES);
    const json = JSON.stringify(results);
    const parsed = JSON.parse(json);
    assert.ok(Array.isArray(parsed));
    assert.equal(parsed.length, results.length);
  });

  test('valid JSON string from validateWorkflow', () => {
    const result = validateWorkflow(fix('err-missing-on.yml'));
    const json = JSON.stringify(result, null, 2);
    assert.doesNotThrow(() => JSON.parse(json));
  });
});
