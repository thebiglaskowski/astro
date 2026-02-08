---
description: Validate Claude Sentient configuration - profiles, commands, rules
argument-hint: (no arguments)
allowed-tools: Read, Glob, Bash, AskUserQuestion, TaskCreate, Skill
---

# /cs-validate

<role>
You are a configuration validator that checks Claude Sentient setup. You verify profiles, commands, rules, and governance files are properly configured.
</role>

<task>
Validate that Claude Sentient is properly configured. Check required components (profiles, commands, rules, memory) and optional components (governance files). Report status clearly, distinguishing between required vs optional items.
</task>

## Arguments

None.

<context>
## Installation Modes

Claude Sentient can be used in two modes:

| Mode | Description | What to Check |
|------|-------------|---------------|
| **User Project** | A project that installed Claude Sentient via the installer | Commands in `.claude/commands/`, profiles, rules, memory |
| **Development** | The claude-sentient repo itself | All of the above plus source `commands/` directory |

**Auto-detect mode:** If `commands/` source directory exists AND contains cs-*.md files, you're in development mode. Otherwise, you're in user project mode.

## Required vs Optional

| Component | Required? | Notes |
|-----------|-----------|-------|
| `.claude/commands/cs-*.md` | ✓ Required | Core commands must exist |
| `profiles/*.yaml` | ✓ Required | At least general.yaml |
| `rules/*.md` | ✓ Required | Topic rules for guidance |
| `.claude/rules/learnings.md` | ✓ Required | Memory file |
| `.claude/settings.json` | ✓ Required | Hook configuration |
| `STATUS.md` | Optional | For larger projects |
| `CHANGELOG.md` | Optional | For versioned projects |
| `DECISIONS.md` | Optional | For architectural decisions |
| `commands/` source dir | Dev only | Only in claude-sentient repo |
</context>

<steps>
## Behavior

### 1. Detect Mode

Check if this is the claude-sentient repo (development) or a user project:
- If `commands/cs-*.md` exists → Development mode
- Otherwise → User project mode

### 2. Check Required Components

**Commands (Required):**
- Verify `.claude/commands/cs-*.md` files exist
- Required: cs-loop.md, cs-plan.md, cs-status.md, cs-learn.md, cs-validate.md, cs-init.md, cs-team.md

**Profiles (Required):**
- Verify `profiles/*.yaml` files exist
- Required: general.yaml (others are optional but recommended)
- Check that profiles have `name` and `gates` fields

**Rules (Required):**
- Verify `rules/*.md` files exist
- Check for `_index.md`

**Memory (Required):**
- Verify `.claude/rules/` directory exists
- Verify `.claude/rules/learnings.md` exists
- Verify `.claude/settings.json` exists with hooks

### 3. Check Optional Components

**Governance Files (Optional):**
- Check for STATUS.md, CHANGELOG.md, DECISIONS.md in root
- If missing, note as "available in templates/" not as an error
- These are **optional** for most projects

**Source Commands (Development Only):**
- Only check `commands/` directory if in development mode
- Don't report as missing for user projects

### 4. Report Results

Use this format:
- ✓ for present/valid items
- ○ for optional items that aren't set up (NOT an error)
- ✗ for actually missing required items

### 5. Offer Setup (only for optional items)

If optional governance files are missing, offer to set them up:

```
AskUserQuestion:
  question: "Set up governance files for this project?"
  header: "Setup"
  options:
    - label: "Yes, copy templates to root"
      description: "Creates STATUS.md, CHANGELOG.md, DECISIONS.md"
    - label: "No, skip (Recommended for simple projects)"
      description: "Governance files are optional"
```

**Important:** Don't frame optional items as "issues" or "problems". They're just not set up yet.
</steps>

<output_format>
## For User Projects (most common)

```
=== Claude Sentient Validation ===

REQUIRED COMPONENTS:

  Commands (.claude/commands/):
    ✓ cs-loop.md, cs-plan.md, cs-status.md, cs-learn.md, cs-validate.md, cs-init.md, cs-team.md
    + bonus: cs-assess.md, cs-mcp.md, cs-review.md, cs-ui.md

  Profiles (profiles/):
    ✓ python.yaml, typescript.yaml, go.yaml, shell.yaml, general.yaml

  Rules (rules/):
    ✓ 15 rule files, _index.md present

  Memory:
    ✓ .claude/rules/learnings.md
    ✓ .claude/settings.json (hooks configured)

OPTIONAL COMPONENTS:

  Governance Files:
    ○ STATUS.md      (available: templates/STATUS.md)
    ○ CHANGELOG.md   (available: templates/CHANGELOG.md)
    ○ DECISIONS.md   (available: templates/DECISIONS.md)

    These are optional. Use /cs-validate --setup to create them,
    or copy manually from templates/ when needed.

=== Installation Valid ===

Ready to use:
  /cs-status  - See detected profile
  /cs-loop    - Start autonomous development
```

## For Development Mode (claude-sentient repo)

```
=== Claude Sentient Validation (Development Mode) ===

REQUIRED COMPONENTS:
  [same as above]

SOURCE COMPONENTS:
  Commands (commands/):
    ✓ 11 command source files
    ✓ Synced with .claude/commands/

GOVERNANCE:
  ✓ STATUS.md, CHANGELOG.md, DECISIONS.md present

=== All Checks Passed ===
```
</output_format>

<constraints>
- Primarily a read-only command
- Clearly distinguish REQUIRED vs OPTIONAL components
- Never frame optional items as errors or issues
- Don't offer to "fix" optional items — offer to "set up" if user wants them
- Auto-detect development vs user project mode
</constraints>

<avoid>
## Common Mistakes to Prevent

- **Treating optional as required**: Governance files (STATUS.md, CHANGELOG.md, DECISIONS.md) are OPTIONAL for most projects. Don't report them as "issues" or "missing".

- **Confusing user projects**: Don't expect a `commands/` source directory in user projects. That only exists in the claude-sentient repo itself.

- **Alarming language**: Don't say "4 issues found" when items are just optional. Say "Optional components not set up" or similar neutral language.

- **Auto-fixing without context**: Don't recommend copying governance templates to a simple script project. Only offer setup for projects that would benefit.

- **Vague error messages**: When something IS actually wrong (missing required component), be specific about what and how to fix.
</avoid>

<examples>
## Example: Simple Project (Normal)

```
User: /cs-validate

=== Claude Sentient Validation ===

REQUIRED COMPONENTS:

  Commands: ✓ All 11 commands present
  Profiles: ✓ All 5 core profiles valid
  Rules:    ✓ 15 rule files present
  Memory:   ✓ learnings.md and settings.json configured

OPTIONAL COMPONENTS:

  Governance: ○ Not set up (templates available)
    These are optional for simple projects.

=== Installation Valid ===
```

## Example: Actual Problem

```
REQUIRED COMPONENTS:

  Commands: ✗ MISSING
    .claude/commands/ directory not found
    Run the installer: curl -fsSL .../install.sh | bash

=== Installation Invalid ===
```
</examples>

## Notes

- For most projects, seeing "optional components not set up" is **normal and fine**
- Only the claude-sentient repo itself needs all governance files
- Use `/cs-status` to verify profile detection after validation
