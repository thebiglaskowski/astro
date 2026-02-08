#!/usr/bin/env node
/**
 * SessionStart Hook - Initialize session context
 *
 * Triggered when a Claude Code session begins.
 * Creates session state file and injects initial context.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { ensureStateDir, saveState, logMessage } = require('./utils.cjs');

// Ensure state directory exists
ensureStateDir();

// Get git branch if available
let gitBranch = 'unknown';
try {
    // First check if we're in a git repo
    execSync('git rev-parse --git-dir', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

    // Check if HEAD exists (repo has at least one commit)
    try {
        execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
        gitBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch (e) {
        // Git repo exists but no commits yet
        gitBranch = 'no-commits';
    }
} catch (e) {
    // Not a git repo or git not available
    gitBranch = 'not-a-repo';
}

// Get git status summary
let gitStatus = 'unknown';
try {
    const status = execSync('git status --porcelain', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    gitStatus = status ? 'dirty' : 'clean';
} catch (e) {
    // Not a git repo
}

// Root-level profile detection by marker files
function detectRootProfile(cwd) {
    if (fs.existsSync(path.join(cwd, 'pyproject.toml')) || fs.existsSync(path.join(cwd, 'setup.py'))) {
        return 'python';
    }
    if (fs.existsSync(path.join(cwd, 'tsconfig.json'))) return 'typescript';
    if (fs.existsSync(path.join(cwd, 'go.mod'))) return 'go';
    if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) return 'rust';
    return null;
}

// Check a single monorepo subdirectory for profile markers
function detectSubdirProfile(subdirPath) {
    if (!fs.statSync(subdirPath).isDirectory()) return null;
    if (fs.existsSync(path.join(subdirPath, 'tsconfig.json'))) return 'typescript';
    if (fs.existsSync(path.join(subdirPath, 'pyproject.toml'))) return 'python';
    return null;
}

// Search monorepo directories for nested profiles
function detectMonorepoProfile(cwd) {
    const monorepoLocations = ['packages', 'apps', 'src'];
    for (const dir of monorepoLocations) {
        const dirPath = path.join(cwd, dir);
        if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) continue;

        try {
            for (const subdir of fs.readdirSync(dirPath)) {
                const result = detectSubdirProfile(path.join(dirPath, subdir));
                if (result) return result;
            }
        } catch (e) {
            // Ignore read errors on individual directories
        }
    }
    return null;
}

// Fallback: check package.json for TypeScript dependency
function detectFromPackageJson(cwd) {
    const pkgPath = path.join(cwd, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;

    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
            return 'typescript';
        }
    } catch (e) {
        // Ignore parse errors
    }
    return 'javascript';
}

// Detect profile from files (supports monorepos)
function detectProfile() {
    const cwd = process.cwd();
    return detectRootProfile(cwd)
        || detectMonorepoProfile(cwd)
        || detectFromPackageJson(cwd)
        || 'general';
}

// Generate session ID
const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Write session start info
const sessionInfo = {
    id: sessionId,
    timestamp: new Date().toISOString(),
    cwd: process.cwd(),
    gitBranch,
    gitStatus,
    profile: detectProfile(),
    platform: process.platform,
    nodeVersion: process.version
};

saveState('session_start.json', sessionInfo);

// Log session start
logMessage(`SessionStart id=${sessionId} branch=${gitBranch} profile=${sessionInfo.profile}`);

// Output for hook system (optional context injection)
const output = {
    continue: true,
    context: {
        sessionId,
        profile: sessionInfo.profile,
        gitBranch,
        gitStatus
    }
};

console.log(JSON.stringify(output));
