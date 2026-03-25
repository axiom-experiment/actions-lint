#!/usr/bin/env node
'use strict';

/**
 * bin/actions-lint.js — CLI entry point for actions-lint.
 *
 * Usage:
 *   actions-lint                     Validate .github/workflows/ in cwd
 *   actions-lint [path]              Validate specific file or directory
 *   actions-lint --json              Output as JSON
 *   actions-lint --quiet             Errors only (suppress warnings)
 *   actions-lint --no-color          Disable ANSI colors
 *   actions-lint --version           Print version
 *   actions-lint --help              Show usage
 *
 * Exit codes:
 *   0  No errors found
 *   1  One or more errors found
 */

const fs = require('fs');
const path = require('path');
const { validateWorkflow, validateDirectory } = require('../src/index');
const { render, exitCode } = require('../src/reporter');

// ─── Parse CLI Arguments ───────────────────────────────────────────────────
const args = process.argv.slice(2);

const flags = {
  json:    args.includes('--json'),
  quiet:   args.includes('--quiet'),
  noColor: args.includes('--no-color'),
  version: args.includes('--version'),
  help:    args.includes('--help') || args.includes('-h'),
};

// Positional arguments (non-flag args)
const positional = args.filter(a => !a.startsWith('--') && a !== '-h');

// ─── Version ──────────────────────────────────────────────────────────────
if (flags.version) {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}

// ─── Help ─────────────────────────────────────────────────────────────────
if (flags.help) {
  console.log(`
actions-lint — GitHub Actions workflow validator

USAGE
  actions-lint [path] [options]

ARGUMENTS
  path    File or directory to validate (default: .github/workflows/)

OPTIONS
  --json      Output results as JSON
  --quiet     Show errors only (suppress warnings)
  --no-color  Disable ANSI color output
  --version   Print version number
  --help, -h  Show this help message

EXAMPLES
  actions-lint
  actions-lint .github/workflows/ci.yml
  actions-lint .github/workflows/ --quiet
  actions-lint --json > results.json

EXIT CODES
  0  No errors
  1  One or more errors found
`.trim());
  process.exit(0);
}

// ─── Determine target path ────────────────────────────────────────────────
const targetArg = positional[0] || null;
const useColor = !flags.noColor && process.stdout.isTTY !== false && !flags.json;

let results;

if (targetArg) {
  const absTarget = path.resolve(targetArg);

  if (!fs.existsSync(absTarget)) {
    console.error(`actions-lint: path not found: ${absTarget}`);
    process.exit(1);
  }

  const stat = fs.statSync(absTarget);
  if (stat.isDirectory()) {
    results = validateDirectory(absTarget);
  } else {
    results = [validateWorkflow(absTarget)];
  }
} else {
  // Default: look for .github/workflows/ in cwd
  const defaultDir = path.join(process.cwd(), '.github', 'workflows');
  if (fs.existsSync(defaultDir)) {
    results = validateDirectory(process.cwd());
  } else {
    // Fall back to scanning cwd for any yml files
    results = validateDirectory(process.cwd());
  }
}

// ─── No files found ───────────────────────────────────────────────────────
if (results.length === 0) {
  if (flags.json) {
    console.log('[]');
  } else {
    console.log('No workflow files found.');
  }
  process.exit(0);
}

// ─── Render output ────────────────────────────────────────────────────────
const output = render(results, {
  json: flags.json,
  quiet: flags.quiet,
  useColor,
});

console.log(output);
process.exit(exitCode(results));
