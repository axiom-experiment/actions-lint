'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { parseFile, parseWorkflow } = require('../src/parser');

const FIXTURES = path.join(__dirname, 'fixtures');
const fix = name => path.join(FIXTURES, name);

describe('parser — valid-basic.yml', () => {
  test('parses without error', () => {
    const result = parseFile(fix('valid-basic.yml'));
    assert.equal(result.success, true);
    assert.ok(result.data);
  });

  test('extracts top-level keys', () => {
    const { data } = parseFile(fix('valid-basic.yml'));
    assert.ok(data.topLevelKeys.includes('name'));
    assert.ok(data.topLevelKeys.includes('on'));
    assert.ok(data.topLevelKeys.includes('jobs'));
  });

  test('sets hasName = true', () => {
    const { data } = parseFile(fix('valid-basic.yml'));
    assert.equal(data.hasName, true);
  });

  test('sets hasOn = true', () => {
    const { data } = parseFile(fix('valid-basic.yml'));
    assert.equal(data.hasOn, true);
  });

  test('sets hasJobs = true', () => {
    const { data } = parseFile(fix('valid-basic.yml'));
    assert.equal(data.hasJobs, true);
  });

  test('extracts trigger "push"', () => {
    const { data } = parseFile(fix('valid-basic.yml'));
    assert.ok(data.triggers.includes('push'), `triggers were: ${JSON.stringify(data.triggers)}`);
  });

  test('extracts job ID "build"', () => {
    const { data } = parseFile(fix('valid-basic.yml'));
    assert.ok('build' in data.jobs, `jobs keys: ${Object.keys(data.jobs)}`);
  });

  test('build job has runs-on key', () => {
    const { data } = parseFile(fix('valid-basic.yml'));
    assert.ok(data.jobs.build.keys.includes('runs-on'));
  });

  test('build job has 2 steps', () => {
    const { data } = parseFile(fix('valid-basic.yml'));
    assert.equal(data.jobs.build.steps.length, 2);
  });

  test('first step has "uses" key', () => {
    const { data } = parseFile(fix('valid-basic.yml'));
    const step = data.jobs.build.steps[0];
    assert.ok(step.keys.includes('uses'), `step keys: ${JSON.stringify(step.keys)}`);
  });

  test('second step has "run" key', () => {
    const { data } = parseFile(fix('valid-basic.yml'));
    const step = data.jobs.build.steps[1];
    assert.ok(step.keys.includes('run'), `step keys: ${JSON.stringify(step.keys)}`);
  });

  test('no tab lines detected', () => {
    const { data } = parseFile(fix('valid-basic.yml'));
    assert.equal(data.tabLines.length, 0);
  });

  test('rawLines is a non-empty array', () => {
    const { data } = parseFile(fix('valid-basic.yml'));
    assert.ok(Array.isArray(data.rawLines));
    assert.ok(data.rawLines.length > 0);
  });

  test('job line number is a positive integer', () => {
    const { data } = parseFile(fix('valid-basic.yml'));
    assert.ok(typeof data.jobs.build.line === 'number');
    assert.ok(data.jobs.build.line > 0);
  });
});

describe('parser — valid-complex.yml', () => {
  test('parses without error', () => {
    const result = parseFile(fix('valid-complex.yml'));
    assert.equal(result.success, true);
  });

  test('extracts multiple triggers', () => {
    const { data } = parseFile(fix('valid-complex.yml'));
    assert.ok(data.triggers.includes('push'), `triggers: ${JSON.stringify(data.triggers)}`);
    assert.ok(data.triggers.includes('pull_request'), `triggers: ${JSON.stringify(data.triggers)}`);
    assert.ok(data.triggers.includes('workflow_dispatch'), `triggers: ${JSON.stringify(data.triggers)}`);
  });

  test('extracts three job IDs', () => {
    const { data } = parseFile(fix('valid-complex.yml'));
    const jobIds = Object.keys(data.jobs);
    assert.ok(jobIds.includes('lint'), `jobs: ${jobIds}`);
    assert.ok(jobIds.includes('test'), `jobs: ${jobIds}`);
    assert.ok(jobIds.includes('build'), `jobs: ${jobIds}`);
  });

  test('lint job has steps', () => {
    const { data } = parseFile(fix('valid-complex.yml'));
    assert.ok(data.jobs.lint.steps.length > 0);
  });
});

describe('parser — tab detection', () => {
  test('detects tab on line 10 of err-tabs.yml', () => {
    const { data } = parseFile(fix('err-tabs.yml'));
    assert.ok(data.tabLines.length > 0, 'should detect at least one tab line');
    assert.ok(data.tabLines.includes(10), `tabLines: ${JSON.stringify(data.tabLines)}`);
  });
});

describe('parser — missing sections', () => {
  test('handles missing on: gracefully', () => {
    const { data } = parseFile(fix('err-missing-on.yml'));
    assert.equal(data.hasOn, false);
    assert.deepEqual(data.triggers, []);
  });

  test('handles missing jobs: gracefully', () => {
    const { data } = parseFile(fix('err-missing-jobs.yml'));
    assert.equal(data.hasJobs, false);
    assert.deepEqual(data.jobs, {});
  });

  test('returns error for non-existent file', () => {
    const result = parseFile('/no/such/file/workflow.yml');
    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  test('returns error for empty file', () => {
    const result = parseWorkflow('');
    assert.equal(result.success, false);
  });
});

describe('parser — inline on: syntax', () => {
  test('parses "on: push" inline trigger', () => {
    const result = parseWorkflow(`name: Test\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n`);
    assert.equal(result.success, true);
    assert.ok(result.data.triggers.includes('push'));
  });

  test('parses "on: [push, pull_request]" array trigger', () => {
    const result = parseWorkflow(`name: Test\non: [push, pull_request]\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo hi\n`);
    assert.equal(result.success, true);
    assert.ok(result.data.triggers.includes('push'));
    assert.ok(result.data.triggers.includes('pull_request'));
  });
});
