#!/usr/bin/env node
/**
 * UserPromptSubmit Hook - Enhanced context injection
 *
 * Triggered when user submits a prompt.
 * Injects relevant context based on prompt content.
 */

const { parseHookInput, loadState, saveState, logMessage, MAX_PROMPT_HISTORY } = require('./utils.cjs');

// Log the prompt submission
logMessage('Prompt received');

// Read prompt from hook input
let promptText = '';
try {
    const parsed = parseHookInput();
    promptText = parsed.prompt || parsed.content || '';
} catch (e) {
    // No input available
}

// Detect keywords for rule loading
const keywords = {
    auth: ['auth', 'login', 'jwt', 'oauth', 'session', 'password', 'token', 'credential'],
    test: ['test', 'coverage', 'mock', 'spec', 'unittest', 'pytest', 'vitest', 'jest'],
    api: ['api', 'endpoint', 'rest', 'graphql', 'route', 'http', 'request', 'response'],
    database: ['database', 'query', 'sql', 'orm', 'migration', 'schema', 'table', 'model'],
    performance: ['performance', 'cache', 'optimize', 'speed', 'slow', 'fast', 'memory', 'latency'],
    ui: ['ui', 'component', 'css', 'style', 'layout', 'design', 'theme', 'color', 'responsive'],
    security: ['security', 'vulnerability', 'xss', 'injection', 'sanitize', 'encrypt', 'hash', 'secret'],
    codeQuality: ['lint', 'format', 'refactor', 'clean', 'organize', 'style', 'convention', 'typing'],
    errorHandling: ['error', 'bug', 'fix', 'exception', 'catch', 'throw', 'handle', 'crash'],
    documentation: ['doc', 'readme', 'comment', 'docstring', 'explain', 'document']
};

const promptLower = promptText.toLowerCase();
const detectedTopics = [];

for (const [topic, words] of Object.entries(keywords)) {
    if (words.some(word => promptLower.includes(word))) {
        detectedTopics.push(topic);
    }
}

// Track prompt metadata
const promptMeta = {
    timestamp: new Date().toISOString(),
    topics: detectedTopics,
    length: promptText.length
};

// Save to state for later analysis
let prompts = loadState('prompts.json', []);
prompts.push(promptMeta);
// Keep only last N prompts
if (prompts.length > MAX_PROMPT_HISTORY) {
    prompts = prompts.slice(-MAX_PROMPT_HISTORY);
}
saveState('prompts.json', prompts);

// Output (continue execution)
const output = {
    continue: true,
    detectedTopics
};

console.log(JSON.stringify(output));
