# Project Learnings

> Decisions, patterns, and learnings captured during development.
> This file is automatically appended to by `/cs-learn` and by Claude when corrected.

**Self-Improvement Rule**: When the user corrects Claude, Claude should propose adding a rule here to prevent the same mistake. Format:

```markdown
### YYYY-MM-DD: [Short title]
- **Context**: What happened
- **Correction**: What the user said
- **Rule**: What to do differently
```

---

## Decisions

<!-- Architectural and technical decisions will be captured here -->

---

## Patterns

<!-- Established patterns will be added here -->

---

## Learnings

### 2026-02-07: Hook file paths and ESM compatibility
- **Context**: Hook files used `require()` but `package.json` has `"type": "module"`, causing `ReferenceError: require is not defined`
- **Fix 1**: Rename `.js` hook files to `.cjs` so Node treats them as CommonJS
- **Fix 2**: Hook commands run with cwd set to the **project root**, so commands must include the full relative path: `node .claude/hooks/filename.cjs`, not just `node filename.cjs`
- **Fix 3**: When renaming `.js` to `.cjs`, also update `require('./utils')` to `require('./utils.cjs')` — Node's CJS resolver does NOT auto-resolve `.cjs` extensions

---
