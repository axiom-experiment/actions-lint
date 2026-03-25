'use strict';

/**
 * index.js — Main public API for actions-lint.
 *
 * Exports:
 *   validateWorkflow(filePath)   → { file, violations, parseError? }
 *   validateDirectory(dir)       → array of file results
 */

const fs = require('fs');
const path = require('path');
const { parseFile } = require('./parser');
const { runAllRules } = require('./rules');

/**
 * Validate a single GitHub Actions workflow YAML file.
 *
 * @param {string} filePath — absolute or relative path to the .yml file
 * @returns {{ file: string, violations: object[], parseError?: string }}
 */
function validateWorkflow(filePath) {
  const absPath = path.resolve(filePath);
  const parseResult = parseFile(absPath);

  if (!parseResult.success) {
    return {
      file: absPath,
      violations: [],
      parseError: parseResult.error,
    };
  }

  const violations = runAllRules(parseResult);

  return {
    file: absPath,
    violations,
  };
}

/**
 * Scan a directory (recursively) for *.yml files and validate each one.
 * If the directory contains a `.github/workflows` subdirectory, only that
 * subdirectory is scanned (mimicking the default CLI behavior).
 *
 * @param {string} dir — directory to scan
 * @returns {Array<{ file: string, violations: object[], parseError?: string }>}
 */
function validateDirectory(dir) {
  const absDir = path.resolve(dir);

  // Prefer .github/workflows if it exists inside the given dir
  const workflowsDir = path.join(absDir, '.github', 'workflows');
  const scanDir = fs.existsSync(workflowsDir) ? workflowsDir : absDir;

  const ymlFiles = findYmlFiles(scanDir);

  if (ymlFiles.length === 0) return [];

  return ymlFiles.map(filePath => validateWorkflow(filePath));
}

/**
 * Recursively find all .yml and .yaml files in a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function findYmlFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findYmlFiles(fullPath));
    } else if (entry.isFile() && /\.(yml|yaml)$/i.test(entry.name)) {
      results.push(fullPath);
    }
  }

  return results.sort(); // consistent ordering
}

module.exports = { validateWorkflow, validateDirectory, findYmlFiles };
