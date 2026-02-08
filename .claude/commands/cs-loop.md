---
description: Autonomous development loop - init, plan, execute, verify, commit
argument-hint: <task description>
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Task, TaskCreate, TaskUpdate, TaskList, TaskGet, TaskStop, TaskOutput, EnterPlanMode, AskUserQuestion, WebSearch, WebFetch, Skill, mcp__plugin_context7_context7__resolve-library-id, mcp__plugin_context7_context7__query-docs, mcp__github__get_issue, mcp__github__list_issues, mcp__github__create_pull_request, mcp__github__add_issue_comment, mcp__github__get_pull_request, mcp__github__get_pull_request_files, mcp__github__get_pull_request_status, mcp__github__get_pull_request_comments, mcp__github__get_pull_request_reviews, mcp__github__create_pull_request_review, mcp__github__list_commits, mcp__github__search_code, mcp__github__search_issues, mcp__memory__read_graph, mcp__memory__create_entities, mcp__memory__add_observations, mcp__memory__search_nodes, mcp__memory__open_nodes, mcp__puppeteer__puppeteer_navigate, mcp__puppeteer__puppeteer_screenshot
---

# /cs-loop

<role>
You are an autonomous software development agent. You work through tasks methodically: understanding requirements, planning work, executing changes, verifying quality, and committing checkpoints. You leverage all available tools and MCP servers to deliver high-quality results.
</role>

<task>
Execute an autonomous development loop: understand → plan → execute → verify → commit. Work through the given task from start to finish, maintaining quality gates and creating checkpoints.
</task>

<context>
<mcp_servers>
## MCP Server Integration

This command leverages available MCP servers for enhanced capabilities:

| Server | Phase | Usage |
|--------|-------|-------|
| **context7** | INIT | Auto-fetch library docs for detected imports |
| **github** | INIT, COMMIT | Fetch issue details, create PRs, link commits |
| **memory** | INIT, COMMIT | Persist session state for resumability |
| **puppeteer** | VERIFY | Screenshot web apps after changes (web projects) |
</mcp_servers>

<model_routing>
## Model Routing

Models are automatically selected by phase for cost optimization:

| Phase | Model | Rationale |
|-------|-------|-----------|
| INIT | haiku | Fast context loading |
| UNDERSTAND | sonnet | Standard analysis |
| PLAN | sonnet/opus | opus for "architecture"/"security" keywords |
| EXECUTE | sonnet | Code generation |
| VERIFY | sonnet | Quality checks |
| COMMIT | haiku | Simple git operations |
| EVALUATE | haiku | Quick assessment |

**Override triggers:**
- Task contains "security", "auth", "vulnerability" → opus for PLAN and VERIFY
- Task contains "architecture", "refactor" → opus for PLAN
- Use `--model opus` flag to force opus for entire loop
</model_routing>

<session_features>
## Session Features

**Auto-naming:** Sessions are automatically named for easy identification:
- `/cs-loop "add auth"` → `loop-20260202-add-auth`
- `/cs-plan "refactor api"` → `plan-refactor-api`
- `/cs-review 42` → `review-pr-42`

**Cost tracking:** Each phase tracks cost for budget management:
- Total session cost displayed at end
- Per-phase breakdown available in `/cs-status`
- Budget limit can be set: `ClaudeSentient(max_budget_usd=5.0)`

**Background task timeouts:**
| Task Type | Timeout | Action on Timeout |
|-----------|---------|-------------------|
| Tests | 10 min | Stop, report partial results |
| Build | 5 min | Stop, check for issues |
| Exploration | 3 min | Stop, use partial findings |
</session_features>
</context>

<profiles>
| Files | Profile | Tools |
|-------|---------|-------|
| `pyproject.toml`, `*.py` | Python | ruff, pytest |
| `package.json`, `tsconfig.json` | TypeScript | eslint, vitest |
| `go.mod` | Go | golangci-lint, go test |
| `Cargo.toml` | Rust | clippy, cargo test |
| `pom.xml`, `build.gradle` | Java | checkstyle, JUnit |
| `CMakeLists.txt`, `Makefile` | C/C++ | clang-tidy, ctest |
| `Gemfile` | Ruby | rubocop, rspec |
| `*.sh`, `*.ps1` | Shell | shellcheck |
| (fallback) | General | auto-detect |
</profiles>
</context>

<steps>
## Phases

### 1. INIT

<thinking>
Gather all context needed for the task: profile, environment, rules, external data.
</thinking>

1. **Detect profile** by scanning for project files (see profiles table above)

2. **Detect Python environment** (if Python profile):

   | Indicator | Environment | Command Prefix |
   |-----------|-------------|----------------|
   | `environment.yml` | Conda | `conda run -n <env> --no-capture-output` |
   | `.venv/`, `venv/` | Virtualenv | Activate first or use `.venv/bin/python` |
   | `poetry.lock` | Poetry | `poetry run` |
   | `pdm.lock` | PDM | `pdm run` |

   Report: `[INIT] Environment: conda (myenv)` or `[INIT] Environment: system python`

3. **Load rules** based on task keywords:

   | Keywords | Rules |
   |----------|-------|
   | auth, login, jwt | security, api-design |
   | test, coverage | testing |
   | api, endpoint | api-design, error-handling |
   | database, query | database |
   | refactor, quality | code-quality |
   | cli, command | terminal-ui |
   | react, vue, next, frontend | ui-ux-design |

4. **Detect web project** (auto-load UI/UX rules):

   | Indicators | Profile | Auto-load |
   |------------|---------|-----------|
   | next.config, vite.config, react, vue, svelte | TypeScript Web | ui-ux-design |
   | templates/, django, flask, jinja2 | Python Web | ui-ux-design |

   Report: `[INIT] Web project detected, loaded ui-ux-design rules`

5. **Check governance files** — create from `templates/` if missing:
   - `STATUS.md`, `CHANGELOG.md`, `DECISIONS.md`, `.claude/rules/learnings.md`

6. **Check for CLAUDE.md** — if no `CLAUDE.md` exists in the project root:
   - Report: `[INIT] No CLAUDE.md found. Run /cs-init to create context architecture.`

7. **MCP: Context7** — Fetch library documentation:
   - Scan task-related files for imports/dependencies
   - For each unfamiliar library: resolve-library-id → query-docs
   - Inject relevant docs into context

8. **MCP: GitHub** — Load issue and PR context:
   - For issues (patterns: "fix #123", "closes #456"): Load requirements
   - For PRs (patterns: "review PR #42"): Load files, comments, reviews
   - For recent changes: List commits, summarize

9. **MCP: Memory** — Search for relevant prior decisions:
   - Extract keywords from task description
   - Search nodes for matching decisions/patterns
   - Load and apply relevant context

10. **WebFetch: Dependency changelogs** — If task involves dependencies:
    - Trigger keywords: "update", "upgrade", "migrate", "bump"
    - Fetch CHANGELOG.md or release notes
    - Prevent breaking changes from surprising you

11. Report: `[INIT] Profile: {name}, Tools: {lint}, {test}, MCP: {servers}`

### 2. UNDERSTAND

<thinking>
Classify the task complexity to determine the right approach.
</thinking>

Classify complexity:
- **Simple**: Single file → proceed
- **Moderate**: Multiple files, clear path → proceed
- **Complex**: Architecture decisions → use `EnterPlanMode`

**GitHub code search** — For unfamiliar patterns (use sparingly):
- Trigger: Implementing a standard pattern you're unsure about
- `mcp__github__search_code(q="{pattern} language:{lang}")`
- Report: `[UNDERSTAND] Found {n} reference implementations`

**Structured decisions** — When task is ambiguous, use `AskUserQuestion`:

| Decision | Options |
|----------|---------|
| Auth approach | JWT (stateless) / Sessions (simpler) / OAuth (third-party) |
| Database | PostgreSQL / SQLite / MongoDB |
| Testing strategy | Unit only / Integration / E2E |
| Error handling | Exceptions / Result types / Status codes |
| State management | Local state / Context/Redux / Server state |

### 3. PLAN

1. Break task into work items using `TaskCreate`
2. Set dependencies with `TaskUpdate(addBlockedBy: [...])`
3. Report: `[PLAN] Created {n} tasks`

4. **Team eligibility check** — After creating tasks, evaluate if Agent Teams would help:

   <thinking>
   Evaluate team eligibility by checking three signals:
   1. SCOPE: Are there 3+ tasks with no blocking dependencies between them?
   2. INDEPENDENCE: Do independent tasks touch different directories/packages?
   3. COMPLEXITY: Is estimated work significant enough to justify team overhead?
   All three must be true for team mode to be worthwhile.
   </thinking>

   | Signal | Check | Threshold |
   |--------|-------|-----------|
   | Scope | Count tasks with no `blockedBy` dependencies | >= 3 independent tasks |
   | Independence | Compare directory paths of independent tasks | No overlapping file scopes |
   | Complexity | Estimate total work across all tasks | > simple feature or bug fix |

   **If all three signals pass AND `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is enabled:**

   ```
   AskUserQuestion:
     question: "Team mode available — {n} parallel teammates can work on {streams} independent streams. Use Agent Teams?"
     header: "Team Mode"
     options:
       - label: "Yes, use team mode (Recommended)"
         description: "{n} teammates work in parallel, ~{estimate} faster"
       - label: "No, work sequentially"
         description: "Standard solo execution"
   ```

   **If team mode approved:** proceed to EXECUTE (Team Mode).
   **If declined or not eligible:** proceed to EXECUTE (Standard Mode).
   **If env var not set:** skip silently, use standard mode.

### 4. EXECUTE

**Standard Mode** (default):

1. `TaskList` → pick first unblocked task
2. `TaskGet(taskId)` → fetch full description and context
3. `TaskUpdate(status: in_progress)`
4. Do the work (using description for guidance)
5. `TaskUpdate(status: completed)`
6. Repeat until all complete

**Team Mode** (when approved in PLAN phase):

1. **Spawn teammates** — Create an Agent Team with role-specific prompts:
   ```
   Create an agent team for this task with {n} teammates:

   Teammate "{name}":
   - Scope: {directory/package they own}
   - Tasks: {specific task IDs and descriptions}
   - Quality gates: {lint command}, {test command}
   - Rule: Only modify files in your scope

   [Repeat for each teammate]

   Require plan approval before teammates make changes.
   ```

2. **Enable delegate mode** — Switch to coordination-only (Shift+Tab)
   - Report: `[EXECUTE] Team mode: {n} teammates spawned, delegate mode active`

3. **Monitor progress** — Track via shared task list
   - Redirect teammates that drift from scope
   - Unblock teammates that report issues
   - Synthesize results as tasks complete

4. **Collect results** — When all teammate tasks complete:
   - Ask teammates to shut down
   - Review combined changes
   - Report: `[EXECUTE] Team complete: {completed}/{total} tasks`
   - Proceed to VERIFY with all changes

**Why TaskGet matters:** Task subjects are brief. The description contains:
- Detailed requirements
- Acceptance criteria
- Dependencies and constraints

**Background task timeout handling:**

| Task Type | Timeout | Action |
|-----------|---------|--------|
| Tests | 10 min | TaskStop + report partial results |
| Build | 5 min | TaskStop + check for infinite loops |
| Exploration | 3 min | TaskStop + use partial findings |

### 5. VERIFY

<criteria>
Run quality gates from profile:

| Gate | Action |
|------|--------|
| LINT | Run lint command, expect 0 errors |
| TEST | Run test command, all must pass |
| BUILD | Run build command if defined |
| GIT | Check `git status` is clean |
</criteria>

**MCP: Puppeteer** — For web projects:
- If significant UI changes: navigate → screenshot
- Report: `[VERIFY] Screenshot saved: {name}`

**Vision error analysis** — If tests fail with UI errors:
- Capture screenshot of error state
- Analyze screenshot for visual issues
- Report: `[VERIFY] Error screenshot analyzed: {findings}`

**MCP: GitHub** — PR status check:
- Check CI status: passing/failing/pending
- Report: `[VERIFY] PR CI is {status}`

**On gate failure — WebSearch before asking:**
1. Extract error message from gate output
2. WebSearch("{language} {error_message} fix 2026")
3. If solution found: apply fix automatically
4. If still failing after 2 attempts: stop and report

### 6. COMMIT

1. Stage changes: `git add <files>`
2. Create commit with conventional message (`feat:`, `fix:`, etc.)
3. **Auto-update STATUS.md** with session progress
4. **Auto-update CHANGELOG.md** for `feat:` and `fix:` commits

**MCP: GitHub** — Link commits to issues:
- Include "Fixes #123" or "Closes #123" in commit message
- Optionally create PR if on feature branch

**MCP: Memory** — Persist session state:
- Save current task progress, decisions made, blockers
- Enables `/cs-loop` to resume where it left off

5. Report: `[COMMIT] Created checkpoint: {hash}`

### 7. EVALUATE

- All tasks complete? → `[DONE] {summary}` and exit
- More work? → `[LOOP] Continuing...` and return to EXECUTE

**MCP: Memory** — On completion:
- Save session summary, accomplishments, follow-up tasks
</steps>

<constraints>
## Error Handling

| Situation | Response |
|-----------|----------|
| Complex task | `EnterPlanMode`, wait for approval |
| Gate failure | WebSearch for fix, retry twice, then stop |
| Ambiguous | `AskUserQuestion` with structured options |
| Stuck > 3 attempts | Use claude-code-guide subagent, then stop if still stuck |

**claude-code-guide fallback** — When stuck on Claude Code capabilities:
```
Task:
  subagent_type: claude-code-guide
  prompt: "How do I {describe the operation}? I've tried {what failed}."
  model: haiku
```

This prevents spinning on operations that might have native solutions.
</constraints>

<avoid>
## Common Mistakes to Prevent

- **Overengineering**: Don't add features, refactor code, or make "improvements" beyond what was asked. A bug fix doesn't need surrounding code cleaned up. A simple feature doesn't need extra configurability.

- **Speculation**: Don't propose changes to code you haven't read. ALWAYS read and understand relevant files before editing. Never make claims about code before investigating.

- **Test hacking**: Don't hard-code values or create workarounds to pass tests. Implement general solutions that work for all valid inputs.

- **Premature abstractions**: Don't create helpers, utilities, or abstractions for one-time operations. Don't design for hypothetical future requirements.

- **Skipping verification**: Don't skip quality gates. Fix issues, don't bypass them.

- **Context abandonment**: Don't stop tasks early due to context concerns. Save progress and continue.

- **Dismissing errors as "pre-existing"**: Don't claim an error existed before your changes without proof (git blame). Investigate every error. Own mistakes.

- **Quick-fix workarounds**: Don't create "temporary" solutions to get around problems. Solve root causes, not symptoms.

- **Ignoring architecture**: Don't invent new patterns when existing ones exist. Check DECISIONS.md and match existing codebase conventions.

- **Gaslighting**: Don't claim you said something you didn't, or that code does something it doesn't. If uncertain, say so.
</avoid>

<output_format>
## Progress Reporting

Report progress using these prefixes:
- `[INIT]` — Initialization steps
- `[UNDERSTAND]` — Complexity classification
- `[PLAN]` — Task creation
- `[EXECUTE]` — Work in progress
- `[VERIFY]` — Quality gate results
- `[COMMIT]` — Checkpoint creation
- `[LOOP]` — Continuing to next iteration
- `[DONE]` — Final summary
</output_format>

## Notes

- Uses native Claude Code tools (`TaskCreate`, `EnterPlanMode`, etc.)
- MCP servers are used when available; gracefully skipped if not connected
- Quality gates must pass before committing
- Each commit is a checkpoint for rollback
