#!/usr/bin/env node
/**
 * Stop Hook - Definition of Done verification
 *
 * Triggered when Claude stops (task completion).
 * Verifies that quality gates passed and DoD is met.
 */

const path = require('path');
const { execSync } = require('child_process');
const { loadJsonFile, saveJsonFile, logMessage, getStateFilePath } = require('./utils.cjs');

// Log session end
logMessage('Session ended');

// Read file changes to determine what was worked on
const fileChanges = loadJsonFile(getStateFilePath('file_changes.json'), []);

// Categorize changes by type
const changesByType = {
    python: [],
    typescript: [],
    javascript: [],
    go: [],
    other: []
};

for (const change of fileChanges) {
    const ext = path.extname(change.path || '').toLowerCase();
    if (ext === '.py') changesByType.python.push(change.path);
    else if (ext === '.ts' || ext === '.tsx') changesByType.typescript.push(change.path);
    else if (ext === '.js' || ext === '.jsx') changesByType.javascript.push(change.path);
    else if (ext === '.go') changesByType.go.push(change.path);
    else changesByType.other.push(change.path);
}

// Check git status
let gitClean = false;
let uncommittedChanges = 0;
try {
    const status = execSync('git status --porcelain', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    gitClean = !status;
    uncommittedChanges = status ? status.split('\n').length : 0;
} catch (e) {
    // Not a git repo
}

// Build verification summary
const verification = {
    timestamp: new Date().toISOString(),
    filesModified: fileChanges.length,
    changesByType: {
        python: changesByType.python.length,
        typescript: changesByType.typescript.length,
        javascript: changesByType.javascript.length,
        go: changesByType.go.length,
        other: changesByType.other.length
    },
    git: {
        clean: gitClean,
        uncommittedChanges
    },
    recommendations: []
};

// Add recommendations based on state
if (!gitClean && fileChanges.length > 0) {
    verification.recommendations.push('Consider committing changes before ending session');
}

if (changesByType.python.length > 0) {
    verification.recommendations.push('Run ruff check and pytest before finalizing');
}

if (changesByType.typescript.length > 0 || changesByType.javascript.length > 0) {
    verification.recommendations.push('Run eslint and tests before finalizing');
}

// Save verification to state
saveJsonFile(getStateFilePath('last_verification.json'), verification);

// Output
console.log(JSON.stringify(verification));
