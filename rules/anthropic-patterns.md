# Anthropic Prompt Patterns

> Tested prompt patterns from Anthropic's official documentation and prompt library.
> These patterns are optimized for Claude 4.x models (Opus 4.5, Sonnet 4.5, Haiku 4.5).

---

## Core Principles

### 1. Be Explicit with Instructions

Claude 4.x takes instructions literally. Be specific about desired output.

```
❌ Less effective:
Create an analytics dashboard

✅ More effective:
Create an analytics dashboard. Include as many relevant features and interactions
as possible. Go beyond the basics to create a fully-featured implementation.
```

### 2. Add Context for Why

Explaining WHY improves Claude's understanding and generalization.

```
❌ Less effective:
NEVER use ellipses

✅ More effective:
Your response will be read aloud by a text-to-speech engine, so never use
ellipses since the text-to-speech engine will not know how to pronounce them.
```

### 3. Positive Framing Over Negatives

Tell Claude what TO DO instead of what NOT to do (for general behavior).

```
❌ Less effective:
Do not use markdown in your response

✅ More effective:
Your response should be composed of smoothly flowing prose paragraphs.
```

### 4. Explicit DON'Ts for Specific Pitfalls

Use explicit negatives for common mistakes that need direct prevention.

```xml
<avoid>
- Don't add features beyond what was asked
- Don't create abstractions for one-time operations
- Don't design for hypothetical future requirements
</avoid>
```

---

## Tested Prompt Patterns

### Investigate Before Answering

Prevents hallucinations by requiring code inspection before proposing changes.

```xml
<investigate_before_answering>
Never speculate about code you have not opened. If the user references a specific
file, you MUST read the file before answering. Make sure to investigate and read
relevant files BEFORE answering questions about the codebase. Never make any claims
about code before investigating unless you are certain of the correct answer - give
grounded and hallucination-free answers.
</investigate_before_answering>
```

**Use in:** `/cs-loop`, `/cs-review`, `/cs-assess`

---

### Default to Action

Makes Claude proactive about implementing rather than just suggesting.

```xml
<default_to_action>
By default, implement changes rather than only suggesting them. If the user's intent
is unclear, infer the most useful likely action and proceed, using tools to discover
any missing details instead of guessing. Try to infer the user's intent about whether
a tool call (e.g., file edit or read) is intended or not, and act accordingly.
</default_to_action>
```

**Use in:** `/cs-loop`

---

### Conservative Action (Alternative)

For when you want Claude to be more hesitant.

```xml
<do_not_act_before_instructions>
Do not jump into implementation or change files unless clearly instructed to make
changes. When the user's intent is ambiguous, default to providing information,
doing research, and providing recommendations rather than taking action. Only
proceed with edits, modifications, or implementations when the user explicitly
requests them.
</do_not_act_before_instructions>
```

**Use in:** `/cs-plan`, `/cs-assess` (read-only commands)

---

### Parallel Tool Calls

Maximizes efficiency by running independent operations simultaneously.

```xml
<use_parallel_tool_calls>
If you intend to call multiple tools and there are no dependencies between the tool
calls, make all of the independent calls in parallel. Prioritize calling tools
simultaneously whenever the actions can be done in parallel rather than sequentially.
For example, when reading 3 files, run 3 tool calls in parallel to read all 3 files
into context at the same time. Maximize use of parallel tool calls where possible to
increase speed and efficiency. However, if some tool calls depend on previous calls
to inform dependent values like the parameters, do NOT call these tools in parallel
and instead call them sequentially. Never use placeholders or guess missing parameters.
</use_parallel_tool_calls>
```

**Use in:** `/cs-loop`, `/cs-assess`

---

### Avoid Overengineering

Keeps solutions minimal and focused.

```xml
<avoid_overengineering>
Avoid over-engineering. Only make changes that are directly requested or clearly
necessary. Keep solutions simple and focused.

- Don't add features, refactor code, or make "improvements" beyond what was asked
- A bug fix doesn't need surrounding code cleaned up
- A simple feature doesn't need extra configurability
- Don't add error handling for scenarios that can't happen
- Trust internal code and framework guarantees
- Only validate at system boundaries (user input, external APIs)
- Don't create helpers or abstractions for one-time operations
- Don't design for hypothetical future requirements
- The right amount of complexity is the minimum needed for the current task
</avoid_overengineering>
```

**Use in:** `/cs-loop`

---

### Code Exploration

Ensures thorough code understanding before making changes.

```xml
<explore_before_changing>
ALWAYS read and understand relevant files before proposing code edits. Do not
speculate about code you have not inspected. If the user references a specific
file/path, you MUST open and inspect it before explaining or proposing fixes.
Be rigorous and persistent in searching code for key facts. Thoroughly review
the style, conventions, and abstractions of the codebase before implementing
new features or abstractions.
</explore_before_changing>
```

**Use in:** `/cs-loop`, `/cs-plan`

---

### Avoid Excessive Markdown

Controls output formatting for cleaner responses.

```xml
<avoid_excessive_markdown>
When writing reports, documents, technical explanations, or analyses, write in
clear, flowing prose using complete paragraphs and sentences. Use standard
paragraph breaks for organization and reserve markdown primarily for:
- `inline code`
- code blocks (```...```)
- simple headings (##, ###)

Avoid using **bold** and *italics* excessively.

DO NOT use ordered lists (1. ...) or unordered lists (*) unless:
a) You're presenting truly discrete items where a list format is the best option
b) The user explicitly requests a list or ranking

Instead of listing items with bullets or numbers, incorporate them naturally
into sentences. Your goal is readable, flowing text that guides the reader
naturally through ideas rather than fragmenting information into isolated points.
</avoid_excessive_markdown>
```

**Use in:** `/cs-review`, documentation commands

---

### Context Window Management

For long-running tasks that approach context limits.

```xml
<context_management>
Your context window will be automatically compacted as it approaches its limit,
allowing you to continue working indefinitely from where you left off. Therefore:

- Do not stop tasks early due to token budget concerns
- As you approach your token budget limit, save your current progress and state
- Always be as persistent and autonomous as possible
- Complete tasks fully, even if the end of your budget is approaching
- Never artificially stop any task early regardless of the context remaining
</context_management>
```

**Use in:** `/cs-loop` (long tasks)

---

### State Tracking

For tasks spanning multiple context windows.

```xml
<state_tracking>
Use structured formats for state data:
- JSON for test results, task status, structured information
- Freeform text for progress notes and general context
- Git for checkpoints and change history

Emphasize incremental progress:
- Keep track of your progress in a progress file
- Focus on completing one thing at a time
- Save state before context window refreshes
</state_tracking>
```

**Use in:** `/cs-loop`

---

### Avoid Test-Focused Solutions

Prevents hard-coding and workarounds.

```xml
<avoid_test_hacking>
Write high-quality, general-purpose solutions using standard tools. Do not:
- Create helper scripts or workarounds
- Hard-code values for specific test inputs
- Create solutions that only work for test cases

Instead:
- Implement logic that solves the problem generally
- Follow best practices and software design principles
- If tests are incorrect, inform the user rather than working around them
</avoid_test_hacking>
```

**Use in:** `/cs-loop`

---

### Never Dismiss Errors

Prevents the "pre-existing error" excuse pattern.

```xml
<never_dismiss_errors>
If you encounter an error during your work:
- Own it. Investigate whether your changes caused or exposed it.
- Never claim "this error was pre-existing" without evidence (git blame, commit history).
- If truly pre-existing, still report it clearly — don't use it as an excuse to skip quality gates.
- Either fix the issue or explicitly document it with context.

Investigate every error. Never dismiss, deflect, or ignore.
</never_dismiss_errors>
```

**Use in:** `/cs-loop`, all commands

---

### Admit Mistakes Clearly

Prevents gaslighting and deflection.

```xml
<admit_mistakes>
When you make an error:
- Acknowledge it clearly: "I made a mistake" not "there was an issue"
- Don't deflect blame to context limitations, code complexity, or external factors
- Don't claim you said something you didn't
- Don't claim code does something it doesn't
- Don't claim tests pass when they don't
- If uncertain, say "I'm not sure" rather than making confident wrong statements

Fix mistakes and capture learnings to prevent recurrence.
</admit_mistakes>
```

**Use in:** All commands

---

### Verify Architecture Alignment

Ensures changes respect existing patterns.

```xml
<verify_architecture>
Before implementing changes:
- Check DECISIONS.md for documented architecture decisions that affect your approach
- Look for patterns in existing code — match them, don't invent new ones
- If your approach conflicts with existing patterns, stop and ask rather than proceeding
- Re-read CLAUDE.md and learnings.md at the start of significant work

Never assume you remember the rules — verify them.
</verify_architecture>
```

**Use in:** `/cs-loop`, `/cs-plan`

---

### Frontend Aesthetics

Prevents generic "AI slop" design.

```xml
<frontend_aesthetics>
Avoid generic, "on distribution" outputs. In frontend design, this creates what
users call the "AI slop" aesthetic. Make creative, distinctive frontends.

Focus on:
- Typography: Beautiful, unique fonts. Avoid Arial, Inter, Roboto.
- Color: Commit to a cohesive aesthetic. Dominant colors with sharp accents.
- Motion: Animations for effects and micro-interactions. CSS-only when possible.
- Backgrounds: Create atmosphere and depth, not solid colors.

Avoid:
- Overused font families (Inter, Roboto, Arial, system fonts)
- Clichéd color schemes (purple gradients on white)
- Predictable layouts and component patterns
- Cookie-cutter design lacking context-specific character

Think outside the box. Vary between light/dark themes, different fonts,
different aesthetics.
</frontend_aesthetics>
```

**Use in:** `/cs-ui`, `/cs-loop` (web projects)

---

## Pattern Selection Guide

| Task Type | Recommended Patterns |
|-----------|---------------------|
| **Code changes** | investigate_before_answering, explore_before_changing, avoid_overengineering, verify_architecture |
| **Code review** | investigate_before_answering, avoid_excessive_markdown, never_dismiss_errors |
| **Planning** | do_not_act_before_instructions, explore_before_changing, verify_architecture |
| **Long tasks** | context_management, state_tracking, use_parallel_tool_calls |
| **UI/Frontend** | frontend_aesthetics, avoid_overengineering |
| **Testing** | avoid_test_hacking, never_dismiss_errors |
| **Error handling** | never_dismiss_errors, admit_mistakes |
| **All tasks** | admit_mistakes, verify_architecture |

---

## Integration with Claude Sentient

These patterns are automatically loaded based on task context:

| Keywords | Patterns Loaded |
|----------|-----------------|
| implement, build, create | default_to_action, avoid_overengineering |
| review, audit, assess | investigate_before_answering, do_not_act_before_instructions |
| frontend, ui, design | frontend_aesthetics |
| refactor, fix, update | explore_before_changing, avoid_overengineering |

Commands can reference patterns with:
```
Apply @rules/anthropic-patterns#investigate_before_answering
```

---

## Sources

- [Prompting best practices - Claude Docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-4-best-practices)
- [Anthropic's Interactive Prompt Engineering Tutorial](https://github.com/anthropics/prompt-eng-interactive-tutorial)
- [Claude Code Frontend Design Skill](https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md)
