#!/usr/bin/env node
/**
 * Shared utilities for Claude Sentient hooks
 *
 * Provides common functionality used across multiple hooks:
 * - State directory management
 * - Hook input parsing
 * - JSON file I/O
 * - Logging
 */

const fs = require('fs');
const path = require('path');

// Named constants for state management limits
const MAX_PROMPT_HISTORY = 50;
const MAX_FILE_CHANGES = 100;
const MAX_RESULT_LENGTH = 500;
const MAX_BACKUPS = 10;
const MAX_AGENT_HISTORY = 50;

// Patterns for redacting secrets from log output
const SECRET_PATTERNS = [
    /sk-[a-zA-Z0-9]{20,}/g,           // OpenAI/Anthropic API keys
    /ghp_[a-zA-Z0-9]{36,}/g,          // GitHub personal access tokens
    /gho_[a-zA-Z0-9]{36,}/g,          // GitHub OAuth tokens
    /ghu_[a-zA-Z0-9]{36,}/g,          // GitHub user tokens
    /ghs_[a-zA-Z0-9]{36,}/g,          // GitHub server tokens
    /github_pat_[a-zA-Z0-9_]{80,}/g,  // GitHub fine-grained PATs
    /Bearer\s+[a-zA-Z0-9._\-]{20,}/g, // Bearer tokens
    /AKIA[A-Z0-9]{16}/g,              // AWS access key IDs
    /[a-zA-Z0-9\/+]{40}(?=\s|$)/g,    // AWS secret keys (40-char base64)
    /xox[bpsa]-[a-zA-Z0-9\-]{10,}/g,  // Slack tokens
    /eyJ[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}/g, // JWTs
];

/**
 * Ensure the .claude/state directory exists
 * @returns {string} Path to the state directory
 */
function ensureStateDir() {
    const stateDir = path.join(process.cwd(), '.claude', 'state');
    if (!fs.existsSync(stateDir)) {
        fs.mkdirSync(stateDir, { recursive: true });
    }
    return stateDir;
}

/**
 * Parse hook input from environment variable or stdin
 * @returns {Object} Parsed input object or empty object if parsing fails
 */
function parseHookInput() {
    try {
        const input = process.env.HOOK_INPUT;
        if (input) {
            return JSON.parse(input);
        }
    } catch (e) {
        // Fall through to stdin
    }

    try {
        const stdin = fs.readFileSync(0, 'utf8');
        return JSON.parse(stdin);
    } catch (e) {
        return {};
    }
}

/**
 * Sanitize parsed JSON to prevent prototype pollution.
 * Removes __proto__, constructor, and prototype keys.
 * @param {*} obj - Parsed JSON value
 * @returns {*} Sanitized value
 */
function sanitizeJson(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(sanitizeJson);
    }
    const clean = Object.create(null);
    for (const [key, value] of Object.entries(obj)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            continue; // Skip dangerous keys
        }
        clean[key] = sanitizeJson(value);
    }
    return clean;
}

/**
 * Redact secrets from a string before logging.
 * @param {string} text - Text to redact
 * @returns {string} Text with secrets replaced by [REDACTED]
 */
function redactSecrets(text) {
    let redacted = text;
    for (const pattern of SECRET_PATTERNS) {
        redacted = redacted.replace(pattern, '[REDACTED]');
    }
    return redacted;
}

/**
 * Load JSON data from a file
 * @param {string} filePath - Path to the JSON file
 * @param {Object} defaultValue - Default value if file doesn't exist or is invalid
 * @returns {Object} Parsed JSON or default value (sanitized against prototype pollution)
 */
function loadJsonFile(filePath, defaultValue = {}) {
    if (!fs.existsSync(filePath)) {
        return defaultValue;
    }
    try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        return sanitizeJson(parsed);
    } catch (e) {
        return defaultValue;
    }
}

/**
 * Save JSON data to a file
 * @param {string} filePath - Path to the JSON file
 * @param {Object} data - Data to save
 * @returns {boolean} True if successful, false otherwise
 */
function saveJsonFile(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Log a message to the session log file
 * @param {string} message - Message to log
 * @param {string} level - Log level (INFO, WARNING, ERROR, BLOCKED)
 */
function logMessage(message, level = 'INFO') {
    const logFile = path.join(process.cwd(), '.claude', 'session.log');
    const timestamp = new Date().toISOString().slice(0, 19);
    // Redact secrets before logging
    const safeMessage = redactSecrets(message);
    const logEntry = `[cs] ${timestamp} ${level}: ${safeMessage}\n`;
    try {
        fs.appendFileSync(logFile, logEntry);
    } catch (e) {
        // Fallback to stderr so log failures are visible during debugging
        process.stderr.write(`[cs] log write failed: ${e.message}\n`);
    }
}

/**
 * Get the path to a state file
 * @param {string} filename - Name of the state file
 * @returns {string} Full path to the state file
 */
function getStateFilePath(filename) {
    return path.join(ensureStateDir(), filename);
}

/**
 * Load state from a named state file
 * @param {string} filename - Name of the state file (without path)
 * @param {Object} defaultValue - Default value if file doesn't exist
 * @returns {Object} State data or default value
 */
function loadState(filename, defaultValue = {}) {
    return loadJsonFile(getStateFilePath(filename), defaultValue);
}

/**
 * Save state to a named state file
 * @param {string} filename - Name of the state file (without path)
 * @param {Object} data - State data to save
 * @returns {boolean} True if successful
 */
function saveState(filename, data) {
    ensureStateDir();
    return saveJsonFile(getStateFilePath(filename), data);
}

module.exports = {
    ensureStateDir,
    parseHookInput,
    loadJsonFile,
    saveJsonFile,
    logMessage,
    getStateFilePath,
    loadState,
    saveState,
    sanitizeJson,
    redactSecrets,
    MAX_PROMPT_HISTORY,
    MAX_FILE_CHANGES,
    MAX_RESULT_LENGTH,
    MAX_BACKUPS,
    MAX_AGENT_HISTORY,
};
