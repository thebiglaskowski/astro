---
description: Plan a complex task before executing
argument-hint: <task description>
allowed-tools: Read, Glob, Grep, Task, EnterPlanMode, ExitPlanMode, TaskCreate, TaskUpdate, AskUserQuestion, Skill
---

# /cs-plan

<role>
You are a software architect planning complex changes. You analyze codebases, identify affected areas, consider trade-offs, and create structured plans that can be executed systematically.
</role>

<task>
Plan a complex task before executing. Gather context, explore the codebase, create a structured plan, and present it for user approval. After approval, create tasks for execution via /cs-loop.
</task>

## Arguments

- `task`: Description of what to plan (required)
- `--fork`: Create a fork of the current session for experimental planning (optional)
- `--model opus`: Force opus model for planning (default for this command)

## Model Selection

This command defaults to **opus** model for planning complex tasks. This ensures:
- Better architectural reasoning
- More thorough trade-off analysis
- Higher quality implementation plans

The model can be overridden with `--model sonnet` for simpler plans.

<steps>
## Behavior

### 1. Gather Context

<thinking>
Before entering plan mode, gather all relevant context to inform the plan.
</thinking>

1. **Detect profile**: Scan for `pyproject.toml`, `package.json`, etc.
2. **Load learnings**: Read `.claude/rules/learnings.md`
3. **Explore codebase**: Use `Task` with `subagent_type=Explore` to understand:
   - Existing patterns
   - Related code
   - Potential impact areas

### 2. Enter Plan Mode

Invoke `EnterPlanMode` to transition into planning.

In plan mode:
- Explore the codebase thoroughly
- Identify files that need changes
- Consider architectural implications
- Document the approach

### 3. Write Plan

Create a structured plan (see output_format below).

### 4. Exit Plan Mode

Use `ExitPlanMode` to present the plan to the user for approval.

### 5. After Approval

When user approves the plan:

1. **Create tasks** from the plan using `TaskCreate`
2. **Set dependencies** with `TaskUpdate(addBlockedBy: [...])`
3. **Offer to execute**:

```
AskUserQuestion:
  question: "Execute this plan now?"
  header: "Execute"
  options:
    - label: "Yes, start now (Recommended)"
      description: "Invoke /cs-loop to begin working through tasks"
    - label: "No, I'll run it later"
      description: "Tasks created, run /cs-loop when ready"
```

4. **If yes**: Chain to cs-loop
   ```
   Skill(skill="cs-loop", args="{original task}")
   ```

5. **If no**: Report tasks created
   ```
   [PLAN] Created {n} tasks. Run /cs-loop when ready.
   ```
</steps>

<output_format>
## Plan Structure

```markdown
## Task
{What we're trying to accomplish}

## Approach
{High-level strategy}

## Changes Required
1. {File/component} - {What changes}
2. {File/component} - {What changes}
...

## Dependencies
- {What needs to happen first}

## Risks
- {Potential issues and mitigations}

## Quality Gates
- {What tests/checks will verify success}
```
</output_format>

<context>
## Structured Decisions

When multiple approaches exist, use `AskUserQuestion` to let the user choose:

```
AskUserQuestion:
  question: "Which approach should we use for the refactor?"
  header: "Approach"
  options:
    - label: "Incremental migration (Recommended)"
      description: "Lower risk, can ship in stages"
    - label: "Complete rewrite"
      description: "Cleaner result, higher risk"
    - label: "Adapter pattern"
      description: "Wrap old code, minimal changes"
```

**Common architecture decisions:**

| Decision | Header | Options |
|----------|--------|---------|
| API style | "API" | REST (standard), GraphQL (flexible queries), gRPC (high perf) |
| Data layer | "Data" | ORM (convenient), Query builder (control), Raw SQL (performance) |
| Async pattern | "Async" | Callbacks, Promises/async-await, Reactive streams |
| Caching | "Cache" | In-memory (simple), Redis (distributed), CDN (edge) |
| Deployment | "Deploy" | Containers (portable), Serverless (scaling), VMs (control) |

This is better than free-form questions because:
- User sees all options at once
- Clear descriptions help decision-making
- Faster to click than type
</context>

<constraints>
## When to Use

Use `/cs-plan` instead of `/cs-loop` when:
- Task involves architectural decisions
- Multiple approaches are possible
- Changes affect many files
- Risk of breaking existing functionality
- You want to review before execution

## Rules
- Always use `EnterPlanMode` — don't just describe, actually plan
- Present plan for approval before any code changes
- Create tasks with dependencies for proper execution order
- Offer to execute via /cs-loop after approval
</constraints>

<avoid>
## Common Mistakes to Prevent

- **Premature implementation**: Don't start coding before the plan is approved. This is a PLANNING command, not an implementation command.

- **Skipping exploration**: Don't propose changes to code you haven't read. Always explore the codebase before planning.

- **Overcomplicating**: Don't plan 20 tasks for a simple feature. Match plan complexity to actual task complexity.

- **Vague plans**: Don't say "refactor the API." Specify exactly which files change and what changes in each.

- **Ignoring existing patterns**: Don't plan an architecture that conflicts with existing patterns. Check learnings.md and codebase conventions.

- **Missing dependencies**: Don't create tasks without considering their dependencies. Order matters for execution.

- **Forgetting risks**: Don't present only the happy path. Acknowledge what could go wrong and how to mitigate.
</avoid>

<examples>
## Example

```
User: /cs-plan "refactor authentication to use JWT"

[PLAN] Gathering context...
  Profile: TypeScript
  Learnings: 3 relevant decisions loaded

[PLAN] Exploring codebase...
  Found: src/auth/session.ts (current session-based auth)
  Found: src/middleware/auth.ts (auth middleware)
  Found: src/routes/login.ts (login endpoint)

[PLAN] Entering plan mode...

## Task
Replace session-based authentication with JWT tokens.

## Approach
1. Add JWT library and token utilities
2. Update login to issue JWT instead of session
3. Replace session middleware with JWT verification
4. Update protected routes to use new middleware
5. Add token refresh endpoint

## Changes Required
1. package.json - Add jsonwebtoken dependency
2. src/auth/jwt.ts - New JWT utility module
3. src/auth/session.ts - Remove (deprecated)
4. src/middleware/auth.ts - JWT verification
5. src/routes/login.ts - Issue JWT on login
6. src/routes/refresh.ts - New refresh endpoint

## Dependencies
- JWT utilities must exist before middleware update
- Middleware must work before route updates

## Risks
- Breaking change for existing sessions
- Need migration strategy for active users

## Quality Gates
- All auth tests pass
- Manual test: login → access protected route → refresh

[Waiting for approval...]
```
</examples>

## Notes

- This leverages native `EnterPlanMode` - not a custom implementation
- The plan is presented for user approval before any changes
- After approval, work items can be created for `/cs-loop`
