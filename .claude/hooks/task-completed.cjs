#!/usr/bin/env node
/**
 * TaskCompleted Hook — Quality gate enforcement for Agent Teams
 *
 * Runs when a task is being marked as complete. Validates that the
 * task deliverables meet quality standards before allowing completion.
 *
 * Exit codes:
 *   0 — Allow task completion (quality OK)
 *   2 — Reject completion, send feedback (quality issues found)
 *
 * Hook input (via HOOK_INPUT env var or stdin):
 * {
 *   "task_id": "...",
 *   "task_subject": "...",
 *   "teammate_name": "frontend",
 *   "files_changed": ["src/components/Button.tsx", ...],
 *   "session_id": "..."
 * }
 */

const { parseHookInput, loadState, saveState, logMessage } = require('./utils.cjs');

// Max files a single teammate should modify (prevents scope creep)
const MAX_FILES_PER_TASK = 20;

function main() {
    const input = parseHookInput();
    const taskId = input.task_id || 'unknown';
    const taskSubject = input.task_subject || '';
    const teammateName = input.teammate_name || 'unknown';
    const filesChanged = input.files_changed || [];

    // Load team state
    const teamState = loadState('team-state.json', {
        teammates: {},
        completed_tasks: [],
        file_ownership: {}
    });

    const issues = [];

    // Check 1: File count sanity check
    if (filesChanged.length > MAX_FILES_PER_TASK) {
        issues.push(
            `Task modified ${filesChanged.length} files (max ${MAX_FILES_PER_TASK}). ` +
            `This may indicate scope creep. Review changes and split if needed.`
        );
    }

    // Check 2: File ownership conflicts
    for (const file of filesChanged) {
        const owner = teamState.file_ownership[file];
        if (owner && owner !== teammateName) {
            issues.push(
                `File conflict: ${file} is owned by teammate "${owner}" ` +
                `but was modified by "${teammateName}". ` +
                `Coordinate with ${owner} to avoid overwrites.`
            );
        }
    }

    // Register file ownership for this teammate
    for (const file of filesChanged) {
        teamState.file_ownership[file] = teammateName;
    }

    // Record task completion
    if (!teamState.completed_tasks) {
        teamState.completed_tasks = [];
    }
    teamState.completed_tasks.push({
        task_id: taskId,
        subject: taskSubject,
        teammate: teammateName,
        files: filesChanged,
        timestamp: new Date().toISOString(),
        had_issues: issues.length > 0
    });

    saveState('team-state.json', teamState);

    if (issues.length > 0) {
        const feedback = `Quality issues found before completing task "${taskSubject}":\n` +
            issues.map((issue, i) => `${i + 1}. ${issue}`).join('\n') +
            `\n\nPlease address these issues before marking the task complete.`;

        logMessage(`TaskCompleted: ${taskId} rejected — ${issues.length} issues`, 'WARNING');
        console.error(JSON.stringify({ feedback }));
        process.exit(2);
    }

    logMessage(`TaskCompleted: ${taskId} by ${teammateName} (${filesChanged.length} files)`, 'INFO');
    process.exit(0);
}

main();
