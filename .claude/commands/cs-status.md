---
description: Show current project status - tasks, git state, profile
argument-hint: (no arguments)
allowed-tools: Read, Bash, Glob, TaskList, AskUserQuestion, Skill
---

# /cs-status

<role>
You are a project status reporter that provides a comprehensive overview of the current development state, including tasks, git status, quality gates, and memory.
</role>

<task>
Display the current status of the project including active tasks, git state, detected profile, governance files, and memory entries. Offer to continue work if tasks are pending.
</task>

## Arguments

None.

<steps>
## Behavior

### 1. Detect Profile

Scan for project indicators:
- `pyproject.toml` → Python
- `package.json` / `tsconfig.json` → TypeScript
- `go.mod` → Go
- `*.sh` / `*.ps1` → Shell
- Fallback → General

### 2. Get Task Status

Use `TaskList` to show current work items:
- Pending tasks
- In-progress tasks
- Blocked tasks (and what blocks them)
- Recently completed

### 3. Get Git Status

Run `git status --short` and `git log --oneline -3` to show:
- Current branch
- Uncommitted changes
- Recent commits

### 4. Check Quality Gates

Quick check of gate status:
- Can lint run? (tool exists)
- Can tests run? (test files exist)
- Any obvious issues?

### 5. Check Governance Files

Check for required project files:
- `STATUS.md` — ✓ exists or ✗ missing
- `CHANGELOG.md` — ✓ exists or ✗ missing
- `DECISIONS.md` — ✓ exists or ✗ missing
- `.claude/rules/learnings.md` — ✓ exists or ✗ missing

If any are missing, suggest: `Run /cs-loop to create missing files`

### 6. Show Learnings Summary

Count entries in `.claude/rules/learnings.md`:
- Decisions
- Patterns
- Learnings

### 7. Offer to Continue (if tasks pending)

```
AskUserQuestion:
  question: "Continue working on pending tasks?"
  header: "Resume"
  options:
    - label: "Yes, continue (Recommended)"
      description: "Invoke /cs-loop to resume work"
    - label: "No, just show status"
      description: "Display status only"
```

If yes:
```
Skill(skill="cs-loop")
→ Loop resumes from pending tasks
```
</steps>

<output_format>
```
=== Claude Sentient Status ===

SESSION:
  Name: {session-name}
  Started: {timestamp}
  Phase: {current-phase}
  Iteration: {n}

COST:
  Session total: ${amount}
  By phase:
    - INIT: ${amount}
    - EXECUTE: ${amount}
    - VERIFY: ${amount}
  Budget: ${budget} ({percent}% used)

PROFILE: {language}
  Lint: {lint tool}
  Test: {test tool}
  Build: {build command}

TASKS:
  #{id} [{status}] {subject}
  #{id} [{status}] {subject} [blocked by #{id}]
  ...

  Completed today: {n}
  Remaining: {n}

GIT:
  Branch: {branch}
  Status: {summary}

  Recent commits:
  {hash} {message}
  {hash} {message}

QUALITY:
  Lint: {ready/not found}
  Test: {ready/not found} ({n} test files)
  Build: {ready/not found}

GOVERNANCE:
  STATUS.md: ✓/✗
  CHANGELOG.md: ✓/✗
  DECISIONS.md: ✓/✗
  learnings.md: ✓/✗

MEMORY:
  Decisions: {n}
  Patterns: {n}
  Learnings: {n}

FORKS: (if any)
  {fork-name} - {phase} - forked at {timestamp}

=== Ready for /cs-loop ===
```
</output_format>

<constraints>
- Primarily a read-only command - shows current state only
- Do not make any changes to files
- If governance files are missing, suggest /cs-loop to create them
- Offer to continue work only if tasks are actually pending
</constraints>

<avoid>
## Common Mistakes to Prevent

- **Making changes**: This is a READ-ONLY command. Don't edit files, don't create tasks, don't fix issues. Only display status.

- **Incomplete reporting**: Don't skip sections or report partial status. Check ALL areas: profile, tasks, git, gates, governance, memory.

- **Offering to continue when nothing pending**: Don't show the "Continue working?" prompt if TaskList returns empty. Only offer when actual tasks exist.

- **Stale information**: Don't cache or assume state. Always fetch fresh data from TaskList, git status, and file checks.

- **Excessive verbosity**: Don't dump raw command output. Summarize into the structured format shown in output_format.
</avoid>

<examples>
## Example

```
User: /cs-status

=== Claude Sentient Status ===

PROFILE: TypeScript
  Lint: eslint
  Test: vitest
  Build: tsc

TASKS:
  No active tasks.

  Run /cs-loop "task" to start work.

GIT:
  Branch: main
  Status: clean

  Recent commits:
  f4e5d6c feat: Add authentication
  d3c2b1a fix: Handle edge case

QUALITY:
  Lint: ready
  Test: ready (23 test files)
  Build: ready

MEMORY:
  Decisions: 5
  Patterns: 2
  Learnings: 3

=== Ready for /cs-loop ===
```
</examples>

## Notes

- Useful to run before starting work to understand current state
- Shows what tools are available based on detected profile
- Chains to /cs-loop if user wants to continue pending work
