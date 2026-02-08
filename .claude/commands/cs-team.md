---
description: Create and manage Agent Teams for parallel development work
argument-hint: <task description> | --status | --stop
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task, TaskCreate, TaskUpdate, TaskList, TaskGet, AskUserQuestion, mcp__memory__search_nodes
---

# /cs-team

<role>
You are an Agent Teams coordinator that creates, configures, and manages multi-agent development teams. You determine optimal team composition based on the task, configure teammates with appropriate context and quality gates, and orchestrate parallel work.
</role>

<task>
Create and manage an Agent Team for the given task. Analyze the work to determine optimal team composition, spawn teammates with role-specific prompts, and coordinate parallel execution with quality enforcement.
</task>

<context>
<agent_teams>
## Agent Teams (Experimental)

Agent Teams coordinate multiple Claude Code instances working in parallel. One session acts as the team lead, spawning teammates that each work independently in their own context window.

**Prerequisite:** Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` enabled in settings.json or environment.

### Teams vs Subagents

| Aspect | Subagents | Agent Teams |
|--------|-----------|-------------|
| Context | Shared with caller | Own independent window |
| Communication | Report back to caller only | Message each other directly |
| Coordination | Main agent manages all | Shared task list, self-coordination |
| Best for | Focused tasks, quick research | Complex parallel work, cross-layer changes |
| Token cost | Lower | Higher (separate instances) |

### When Teams Help

| Scenario | Why Teams |
|----------|----------|
| Monorepo tasks across 3+ packages | Each teammate owns a package |
| Large refactors by directory/module | Parallelize non-overlapping work |
| Cross-layer features (API + DB + UI) | Specialized teammates per layer |
| Research with competing hypotheses | Independent investigators challenge each other |
| Parallel code review dimensions | Security, performance, tests each get full attention |

### When Teams Are Wasteful

| Scenario | Use Instead |
|----------|-------------|
| Single-file bug fixes | Solo session |
| Sequential dependent tasks | `/cs-loop` standard mode |
| Same-file edits | Solo (avoids git conflicts) |
| Simple features | Subagents if needed |
</agent_teams>

<team_config>
## Team Configuration

Teams are stored in `~/.claude/teams/{team-name}/config.json` and tasks in `~/.claude/tasks/{team-name}/`.

### Teammate Roles

| Role | Specialization | Best For |
|------|---------------|----------|
| **implementer** | Code writing, feature building | New modules, refactors |
| **reviewer** | Code review, quality checks | Security, performance audits |
| **researcher** | Investigation, documentation | Bug hunting, architecture research |
| **tester** | Test writing, coverage | Test suites, edge cases |

### Quality Enforcement

Teammates are configured with the project's profile and quality gates:
- `TeammateIdle` hook: Checks work quality before teammate goes idle
- `TaskCompleted` hook: Validates deliverables before marking task done
- Each teammate's spawn prompt includes lint/test commands from the active profile
</team_config>
</context>

<steps>
## Modes

### Mode 1: Create Team (`/cs-team <task>`)

1. **CHECK PREREQUISITES**
   - Verify Agent Teams is enabled:
     ```
     Check .claude/settings.json for env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"
     OR check environment variable CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
     ```
   - If not enabled, report and offer to enable:
     ```
     [TEAM] Agent Teams not enabled.
     Add to .claude/settings.json: "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" }
     Then restart Claude Code.
     ```

2. **DETECT PROFILE**
   - Scan for project files to determine language profile
   - Load quality gate commands (lint, test, build)
   - Report: `[TEAM] Profile: {name}, Gates: {lint}, {test}`

3. **ANALYZE TASK**
   - Break the task into independent work units
   - Identify which directories/packages each unit touches
   - Determine if work units are parallelizable (no file overlap)

4. **DESIGN TEAM**

   <thinking>
   Evaluate optimal team composition:
   - How many independent work streams exist?
   - What specializations are needed?
   - Are there file overlap risks?
   - What's the right teammate-to-task ratio? (aim for 5-6 tasks per teammate)
   </thinking>

   Rules for team sizing:
   | Independent Streams | Teammates | Rationale |
   |---------------------|-----------|-----------|
   | 2-3 | 2 | Minimal viable team |
   | 4-6 | 3 | Good parallelism |
   | 7-10 | 4 | Max practical size |
   | 10+ | 4 + task queue | Teammates self-claim from queue |

5. **PRESENT PLAN**

   ```
   AskUserQuestion:
     question: "Create team with {n} teammates for this task?"
     header: "Team Mode"
     options:
       - label: "Yes, create team (Recommended)"
         description: "{n} teammates working in parallel on {streams} work streams"
       - label: "Adjust team size"
         description: "Specify different number of teammates"
       - label: "No, work solo"
         description: "Use standard /cs-loop instead"
   ```

6. **CREATE TEAM**

   Instruct Claude Code to create the team:
   ```
   Create an agent team named "{task-slug}" with {n} teammates:

   Teammate 1: "{role-name}"
   - Focus: {specific work area}
   - Files: {directory/package scope}
   - Tasks: {specific task list}

   Teammate 2: "{role-name}"
   - Focus: {specific work area}
   - Files: {directory/package scope}
   - Tasks: {specific task list}

   Quality gates for ALL teammates:
   - Lint: {lint command from profile}
   - Test: {test command from profile}
   - Build: {build command from profile}

   Rules:
   - Each teammate owns their file scope — no cross-editing
   - Run quality gates before marking tasks complete
   - Message the lead when blocked or when task is done
   - Read CLAUDE.md for project context
   ```

7. **ENABLE DELEGATE MODE**
   - Switch to delegate mode (Shift+Tab) to focus on coordination
   - Report: `[TEAM] Delegate mode active — coordinating {n} teammates`

8. **MONITOR**
   - Track task progress via shared task list
   - Redirect teammates that drift from their scope
   - Synthesize results as teammates complete work
   - Report: `[TEAM] Progress: {completed}/{total} tasks`

9. **CLEANUP**
   - When all tasks complete, ask teammates to shut down
   - Run quality gates on combined work
   - Clean up team resources
   - Report: `[TEAM] Complete — {n} tasks done by {m} teammates`

### Mode 2: Check Status (`/cs-team --status`)

1. Check for active teams in `~/.claude/teams/`
2. Report:
   ```
   [TEAM] Active team: {name}
   Teammates: {n} ({active} active, {idle} idle)
   Tasks: {completed}/{total} ({in_progress} in progress)
   ```

### Mode 3: Stop Team (`/cs-team --stop`)

1. Ask all teammates to shut down gracefully
2. Wait for confirmations
3. Run team cleanup
4. Report: `[TEAM] Team stopped and cleaned up`
</steps>

<constraints>
## Rules

- **Never create teams for simple tasks** — Teams add overhead. If work is sequential or touches few files, use solo mode.
- **No file overlap** — Each teammate must own a distinct set of files. Overlapping file scopes cause git conflicts.
- **Always include quality gates** — Every teammate prompt must include the project's lint/test/build commands.
- **Experimental feature** — Agent Teams requires the experimental flag. Gracefully handle when not available.
- **Always ask before creating** — Use AskUserQuestion to confirm team composition before spawning.
- **Max 4 teammates** — More teammates means more coordination overhead. 4 is the practical maximum.
- **Teammate prompts must be specific** — Include exact file paths, task descriptions, and quality gate commands. Generic prompts produce poor results.
</constraints>

<avoid>
## Common Mistakes to Prevent

- **Creating teams for serial work**: If tasks have linear dependencies (A → B → C), a team won't help. Each teammate would wait for the previous one.

- **Overlapping file scopes**: Two teammates editing the same file causes overwrites. Always partition work by file/directory ownership.

- **Missing quality context**: Spawning teammates without lint/test commands means they can't self-verify their work.

- **Over-sized teams**: 5+ teammates creates coordination chaos. The lead spends more time managing than the teammates save.

- **Forgetting cleanup**: Always clean up team resources when done. Orphaned team configs and task lists waste disk space.

- **Using teams without the experimental flag**: Check for `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` before attempting team creation.

- **Ignoring teammate messages**: When a teammate reports being blocked, address it quickly. A stalled teammate wastes tokens.
</avoid>

<output_format>
## Progress Reporting

```
[TEAM] Profile: TypeScript, Gates: eslint, vitest
[TEAM] Task analysis: 6 independent work streams across 3 packages
[TEAM] Creating team: 3 teammates (frontend, backend, shared)
[TEAM] Delegate mode active — coordinating 3 teammates
[TEAM] Progress: 4/6 tasks complete
[TEAM] All tasks complete — running final quality gates
[TEAM] Complete — 6 tasks done by 3 teammates
```
</output_format>

## Notes

- Agent Teams is an experimental Claude Code feature — behavior may change
- Teams work best with clear file ownership boundaries
- If team creation fails, fallback to standard `/cs-loop` execution
- Each teammate reads CLAUDE.md and project context automatically
- TeammateIdle and TaskCompleted hooks enforce quality gates automatically
