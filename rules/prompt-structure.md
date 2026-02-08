# Prompt Structure Standards

> XML-based prompt engineering patterns for Claude Sentient commands and workflows.
> Based on best practices from @MillieMarconnni's XML prompting research (Feb 2026).

---

## Core Principle

**XML tags separate WHAT you want from HOW you want it.**

Tags are "boxes" for organizing instructions. They help Claude:
- Parse complex instructions clearly
- Maintain context across long prompts
- Follow structured output requirements
- Apply constraints consistently

---

## Essential Structure Tags

Every command/prompt should use these core tags:

| Tag | Purpose | Required? |
|-----|---------|-----------|
| `<role>` | Define Claude's persona/expertise | Recommended |
| `<task>` | Clear statement of what to do | **Required** |
| `<context>` | Background info, codebase state | Recommended |
| `<output_format>` | How to structure the response | Recommended |
| `<constraints>` | Rules, limitations, boundaries | As needed |

### Example: Basic Structure

```xml
<role>
You are a senior software architect specializing in TypeScript applications.
</role>

<task>
Review the authentication module and identify security vulnerabilities.
</task>

<context>
- Framework: Next.js 14 with App Router
- Auth: Currently using session-based auth
- Requirement: Migrate to JWT tokens
</context>

<output_format>
1. List each vulnerability with severity (Critical/High/Medium/Low)
2. Provide file:line references
3. Include remediation steps
</output_format>

<constraints>
- Focus only on authentication-related code
- Do not suggest breaking changes to the API
- Preserve existing test patterns
</constraints>
```

---

## Additional Tags

Use these for more complex prompts:

| Tag | Purpose | When to Use |
|-----|---------|-------------|
| `<audience>` | Who will read the output | Documentation, reports |
| `<tone>` | Communication style | User-facing content |
| `<thinking>` | Request reasoning steps | Complex analysis |
| `<criteria>` | Success metrics | Evaluation tasks |
| `<examples>` | Sample inputs/outputs | Pattern matching |
| `<steps>` | Ordered procedure | Multi-phase tasks |

### Example: Extended Structure

```xml
<role>
You are a code review expert with deep knowledge of security best practices.
</role>

<task>
Perform a comprehensive security audit of the API layer.
</task>

<context>
<codebase>
- Language: TypeScript
- Framework: Express.js
- Database: PostgreSQL with Prisma ORM
</codebase>
<recent_changes>
- Added OAuth integration last week
- Refactored user permissions system
</recent_changes>
</context>

<thinking>
Before providing findings, analyze:
1. Input validation patterns
2. Authentication flow
3. Authorization checks
4. Data exposure risks
</thinking>

<criteria>
A successful audit must:
- Cover OWASP Top 10 vulnerabilities
- Include severity ratings
- Provide actionable fixes
- Reference specific file:line locations
</criteria>

<output_format>
## Security Audit Report

### Critical Issues
[List with severity, location, fix]

### High Priority
[List with severity, location, fix]

### Recommendations
[Strategic improvements]
</output_format>

<constraints>
- Do not execute any code
- Focus on static analysis
- Flag potential issues even if uncertain
</constraints>
```

---

## Nested Structures

For complex tasks, nest tags to organize related information:

```xml
<context>
  <project>
    <name>MyAPI</name>
    <type>REST API</type>
    <language>Python</language>
  </project>

  <environment>
    <runtime>Python 3.11</runtime>
    <framework>FastAPI</framework>
    <database>PostgreSQL</database>
  </environment>

  <constraints>
    <time>Complete within this session</time>
    <scope>Only modify src/ directory</scope>
  </constraints>
</context>
```

---

## Command File Pattern

Claude Sentient commands should follow this structure:

```markdown
---
description: Brief description
argument-hint: <args>
allowed-tools: Tool1, Tool2
---

# /command-name — Title

<role>
[Define the expertise/persona for this command]
</role>

<task>
[Core objective of this command]
</task>

## Usage

[Usage examples]

## Process

<steps>
### 1. PHASE_NAME
[What happens in this phase]

### 2. PHASE_NAME
[What happens in this phase]
</steps>

<output_format>
[How results should be presented]
</output_format>

<constraints>
[Rules and limitations]
</constraints>
```

---

## Tag Usage by Command Type

| Command Type | Essential Tags | Optional Tags |
|--------------|----------------|---------------|
| **Audit** (cs-assess, cs-ui) | role, task, criteria, output_format | thinking, constraints |
| **Loop** (cs-loop) | task, context, steps, constraints | thinking |
| **Review** (cs-review) | role, task, criteria, output_format | audience, tone |
| **Planning** (cs-plan) | task, context, thinking, output_format | constraints, criteria |
| **Learning** (cs-learn) | task, context, output_format | - |

---

## Best Practices

### DO

1. **Use semantic tag names** — `<task>` not `<t>`, `<output_format>` not `<of>`
2. **Keep tags focused** — One concept per tag
3. **Nest when logical** — Group related info under parent tags
4. **Include examples** — Show expected patterns in `<examples>`
5. **Specify output format** — Be explicit about structure

### DON'T

1. **Over-nest** — 2-3 levels max, deeper = harder to parse
2. **Duplicate info** — Each tag should have unique content
3. **Use vague tags** — `<info>` is too generic, use `<context>` or `<background>`
4. **Omit closing tags** — Always close tags properly
5. **Mix formats** — Within a tag, be consistent (all bullets or all prose)

---

## Negative Prompting (Anti-Prompts)

Anthropic's guidance on when to use positive vs negative framing:

### Use Positive Framing For: General Behavior

```
❌ Don't say: "Do not use markdown"
✅ Do say: "Write in flowing prose paragraphs"
```

### Use Explicit DON'Ts For: Specific Pitfalls

When there are common mistakes that need direct prevention:

```xml
<avoid>
- Don't add features beyond what was asked
- Don't create abstractions for one-time operations
- Don't speculate about code you haven't read
- Don't hard-code values for specific test cases
</avoid>
```

### The `<avoid>` Tag Pattern

Add an `<avoid>` section to commands for task-specific anti-patterns:

```xml
<avoid>
## Common Mistakes to Prevent

- **Overengineering**: Don't add features, abstractions, or "improvements" beyond
  what was asked. Keep solutions minimal.

- **Speculation**: Don't propose changes to code you haven't read. Always
  investigate before answering.

- **Test hacking**: Don't hard-code values or create workarounds to pass tests.
  Implement general solutions.

- **Premature action**: Don't start implementing before understanding requirements.
  For ambiguous requests, ask first.
</avoid>
```

### When to Add Anti-Prompts

| Command Type | Anti-Prompts Needed |
|--------------|---------------------|
| **Implementation** (cs-loop) | Overengineering, speculation, test hacking |
| **Review** (cs-review, cs-assess) | Acting on read-only tasks, excessive formatting |
| **Planning** (cs-plan) | Premature implementation, skipping exploration |
| **Status** (cs-status) | Making changes, modifying files |

### Reference

Full patterns available in `rules/anthropic-patterns.md`

---

## Starter Templates

### Simple Task

```xml
<task>
[What to do]
</task>

<output_format>
[How to present results]
</output_format>
```

### Analysis Task

```xml
<role>
[Expert persona]
</role>

<task>
[Analysis objective]
</task>

<context>
[Background information]
</context>

<thinking>
[Analysis approach]
</thinking>

<output_format>
[Report structure]
</output_format>
```

### Multi-Step Workflow

```xml
<role>
[Expert persona]
</role>

<task>
[Overall objective]
</task>

<context>
[Background and state]
</context>

<steps>
1. [Phase 1]
2. [Phase 2]
3. [Phase 3]
</steps>

<constraints>
[Rules and boundaries]
</constraints>

<output_format>
[Final output structure]
</output_format>
```

---

## Integration with Claude Sentient

When creating or modifying commands:

1. **Check this rule** — Ensure XML structure is followed
2. **Use appropriate tags** — Match command type to tag set
3. **Test parsing** — Claude should understand the structure
4. **Document deviations** — If a command needs different tags, note why

This rule is auto-loaded for prompt-related tasks via `rules/_index.md`.
