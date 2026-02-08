#!/usr/bin/env node
/**
 * PostToolUse Hook for Write/Edit - Track changes and suggest lint
 *
 * Triggered after Write or Edit tool execution.
 * Tracks file changes and suggests running lint for code files.
 */

const path = require('path');
const { parseHookInput, loadState, saveState, logMessage, MAX_FILE_CHANGES } = require('./utils.cjs');

// Parse input from hook
const parsed = parseHookInput();
const filePath = parsed.tool_input?.file_path || parsed.tool_input?.path || '';
const toolName = parsed.tool_name || 'unknown';
const success = parsed.tool_result?.success !== false;

// Only track successful operations
if (!success || !filePath) {
    console.log(JSON.stringify({ tracked: false }));
    process.exit(0);
}

// Track file change
let changes = loadState('file_changes.json', []);

// Add to changes if not already tracked
const changeEntry = {
    path: filePath,
    tool: toolName,
    timestamp: new Date().toISOString()
};

// Check if already in list (update timestamp)
const existingIndex = changes.findIndex(c => c.path === filePath);
if (existingIndex >= 0) {
    changes[existingIndex] = changeEntry;
} else {
    changes.push(changeEntry);
}

// Keep only last N changes
if (changes.length > MAX_FILE_CHANGES) {
    changes = changes.slice(-MAX_FILE_CHANGES);
}

saveState('file_changes.json', changes);

// Determine file type for lint suggestion
const ext = path.extname(filePath).toLowerCase();
const codeExtensions = {
    '.py': 'ruff check',
    '.ts': 'eslint',
    '.tsx': 'eslint',
    '.js': 'eslint',
    '.jsx': 'eslint',
    '.go': 'golangci-lint run',
    '.rs': 'cargo clippy',
    '.rb': 'rubocop',
    '.java': 'checkstyle',
    '.sh': 'shellcheck'
};

const suggestions = [];
if (codeExtensions[ext]) {
    suggestions.push(`Consider running lint: ${codeExtensions[ext]}`);
}

// Log the change
logMessage(`${toolName} completed: ${filePath}`);

// Output
const output = {
    tracked: true,
    path: filePath,
    totalChanges: changes.length,
    suggestions: suggestions.length > 0 ? suggestions : undefined
};

console.log(JSON.stringify(output));
