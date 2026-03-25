# actions-lint

> Zero-dependency CLI validator for GitHub Actions workflow files. Catches syntax errors, missing fields, and common mistakes before you push.

[![npm version](https://img.shields.io/npm/v/actions-lint)](https://www.npmjs.com/package/actions-lint)
[![license](https://img.shields.io/npm/l/actions-lint)](./LICENSE)

## Features

- Pure JavaScript — no runtime dependencies
- `npx`-ready, runs in under 1 second
- 12 built-in rules covering the most common GitHub Actions mistakes
- ANSI color output with `--json` and `--quiet` modes
- Node.js 18+ built-in test runner

## Quick Start

```bash
npx actions-lint
```

Or install globally:

```bash
npm install -g actions-lint
actions-lint
```

## Usage

```
actions-lint [path] [options]

ARGUMENTS
  path    File or directory to validate (default: .github/workflows/)

OPTIONS
  --json      Output results as JSON
  --quiet     Show errors only (suppress warnings)
  --no-color  Disable ANSI color output
  --version   Print version number
  --help      Show help

EXIT CODES
  0  No errors
  1  One or more errors found
```

### Examples

```bash
# Validate all workflows in current project
actions-lint

# Validate a specific file
actions-lint .github/workflows/ci.yml

# Validate a directory
actions-lint .github/workflows/ --quiet

# JSON output for CI integration
actions-lint --json > lint-results.json
```

## Rules

| Rule | Severity | Description |
|------|----------|-------------|
| `rule-no-tabs` | error | YAML files must use spaces, not tabs |
| `rule-require-on` | error | Workflow must have an `on:` trigger |
| `rule-require-jobs` | error | Workflow must have a `jobs:` section |
| `rule-jobs-require-runs-on` | error | Every job must specify `runs-on` |
| `rule-steps-require-action` | error | Every step must have `uses:` or `run:` |
| `rule-no-uses-and-run` | error | A step cannot have both `uses:` and `run:` |
| `rule-no-duplicate-jobs` | error | Job IDs must be unique |
| `rule-valid-triggers` | warning | Triggers must be valid GitHub event names |
| `rule-recommend-name` | warning | Workflow should have a `name:` field |
| `rule-no-empty-steps` | warning | Jobs should not have an empty steps list |
| `rule-checkout-version` | warning | Pin `actions/checkout` to a specific version |
| `rule-long-run-scripts` | warning | Inline `run:` scripts over 200 characters |

## Programmatic API

```javascript
const { validateWorkflow, validateDirectory } = require('actions-lint');

// Validate a single file
const result = validateWorkflow('.github/workflows/ci.yml');
// { file: '/abs/path/ci.yml', violations: [...] }

// Validate all workflows in a directory
const results = validateDirectory('.');
// [{ file, violations }, ...]
```

## License

MIT — AXIOM (Yonder Zenith LLC)
