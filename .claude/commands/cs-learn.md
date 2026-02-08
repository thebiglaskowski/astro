---
description: Save a learning, decision, or pattern to project memory
argument-hint: <type> <title> <content>
allowed-tools: Read, Edit, Write, mcp__memory__create_entities, mcp__memory__create_relations, mcp__memory__add_observations
---

# /cs-learn

<role>
You are a knowledge capture assistant that preserves important decisions, patterns, and learnings for future sessions. You store information in both file-based memory (for Claude Code rules loading) and MCP memory (for searchable retrieval).
</role>

<task>
Save important learnings to `.claude/rules/learnings.md` and MCP memory. This creates persistent, searchable knowledge that will be loaded in future sessions and can be retrieved by `/cs-loop`.
</task>

## Arguments

- `type`: One of `decision`, `pattern`, or `learning`
- `title`: Short title for the entry
- `content`: Detailed description

<steps>
## Behavior

### 1. Save to File (learnings.md)

1. Read the current `.claude/rules/learnings.md` file (create if missing)
2. Append a new entry under the appropriate section:
   - `decision` → ## Decisions
   - `pattern` → ## Patterns
   - `learning` → ## Learnings
3. Format the entry with today's date (see output_format)

### 2. Save to MCP Memory (searchable)

Also save to MCP memory for searchable retrieval:

```
mcp__memory__create_entities([{
  name: "{type}_{topic}_{date}",
  entityType: "{type}",
  observations: [
    "type: {type}",
    "topic: {title}",
    "content: {content}",
    "date: {YYYY-MM-DD}",
    "project: {current project name}"
  ]
}])
```

**Create relations** to connect related entities:
```
mcp__memory__create_relations([{
  from: "decision_auth_jwt_2026_02_02",
  to: "pattern_jwt_tokens",
  relationType: "implements"
}])
```

### 3. Confirm

Report what was saved to both locations.
</steps>

<context>
**Entity naming convention:**

| Type | Name Pattern | Example |
|------|--------------|---------|
| Decision | `decision_{topic}_{date}` | `decision_auth_jwt_2026_02_02` |
| Pattern | `pattern_{name}` | `pattern_error_shape` |
| Learning | `learning_{topic}_{date}` | `learning_orm_performance_2026_02_02` |
</context>

<output_format>
### Entry Format (for learnings.md)

```markdown
### YYYY-MM-DD: {title}
- **Context**: [infer from conversation if not provided]
- **{Type}**: {content}
```
</output_format>

<constraints>
- Keep entries concise — these are reminders, not documentation
- Always save to both file AND MCP memory
- Use consistent entity naming for searchability
- Connect related entities with relations when applicable
</constraints>

<avoid>
## Common Mistakes to Prevent

- **Duplicate entries**: Check if a similar learning already exists before adding. Don't create redundant entries with slightly different wording.

- **Missing dual storage**: Don't save to file only. Always attempt MCP memory storage too (gracefully handle if unavailable).

- **Verbose entries**: These are quick reminders, not documentation. Don't write multi-paragraph explanations. Keep it scannable.

- **Missing context**: Don't omit the Context field. Even if the user doesn't provide it, infer from the conversation.

- **Inconsistent naming**: Follow the entity naming convention exactly (`decision_{topic}_{date}`). Don't use freeform names.

- **Wrong section**: Don't put decisions under Patterns or vice versa. Match the type argument to the correct section.
</avoid>

<examples>
## Examples

```
/cs-learn decision "Use PostgreSQL" "Chose over MySQL for better JSON support"
/cs-learn pattern "API errors" "All errors return {error, message, code} shape"
/cs-learn learning "Avoid N+1" "Use eager loading for related entities"
```
</examples>

## Notes

- Learnings are loaded automatically at session start via Claude Code's rules system
- MCP memory makes learnings searchable by `/cs-loop` during INIT phase
- When running `/cs-loop`, significant learnings should be captured automatically
