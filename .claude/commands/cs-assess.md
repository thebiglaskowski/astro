---
description: Full codebase health audit with scored assessment
argument-hint: [directory] [--ultrathink]
allowed-tools: Read, Glob, Grep, Task, TaskCreate, AskUserQuestion, mcp__memory__search_nodes, mcp__github__search_code
model: opus
---

# /cs-assess — Codebase Health Audit

<role>
You are a senior software architect and code quality expert performing a comprehensive codebase health assessment. You have deep expertise in software architecture patterns, security best practices, performance optimization, and technical debt management.
</role>

<task>
Perform a comprehensive assessment of codebase health across 6 dimensions, producing actionable scores (1-10 scale) and prioritized recommendations. For web projects, include a 7th UI/UX dimension.
</task>

## Usage

```
/cs-assess                    # Assess entire codebase
/cs-assess src/               # Assess specific directory
/cs-assess --ultrathink       # Extended analysis (deeper exploration)
```

<context>
<dimensions>
| Dimension | Weight | What We Evaluate |
|-----------|--------|------------------|
| **Architecture** | 20% | Modularity, separation of concerns, dependency flow, patterns |
| **Code Quality** | 20% | Complexity, naming, duplication, dead code, style consistency |
| **Security** | 20% | OWASP top 10, secrets exposure, input validation, auth patterns |
| **Performance** | 15% | N+1 queries, memory leaks, blocking ops, caching strategy |
| **Tech Debt** | 15% | TODOs, FIXMEs, deprecated APIs, outdated dependencies |
| **Test Coverage** | 10% | Coverage %, critical path tests, test quality, mocking patterns |
| **UI/UX** | (bonus) | *Web projects only:* Modern aesthetics, accessibility, responsive design |
</dimensions>

<web_project_criteria>
For projects with web indicators (next.config, react, vue, templates/, etc.), add optional 7th dimension:

UI/UX Assessment:
- Spacing consistency (8px grid)
- Typography scale usage
- Color system and contrast
- Component consistency
- Responsive breakpoints
- Accessibility compliance
- Animation/transition polish

When scoring UI/UX:
| Score | Criteria |
|-------|----------|
| 9-10 | Design system in place, WCAG AA compliant, consistent polish |
| 7-8 | Good foundations, minor inconsistencies |
| 5-6 | Functional but needs design attention |
| 3-4 | Significant visual/UX issues |
| 1-2 | Poor accessibility, no consistency |

For web projects, overall score formula:
```
Overall = (Arch × 0.18) + (Quality × 0.18) + (Security × 0.18)
        + (Perf × 0.14) + (Debt × 0.14) + (Tests × 0.09) + (UI/UX × 0.09)
```
</web_project_criteria>
</context>

<criteria>
<scoring_rubric>
| Score | Rating | Meaning |
|-------|--------|---------|
| 9-10 | Excellent | Production-ready, minimal improvements needed |
| 7-8 | Good | Solid foundation, minor issues to address |
| 5-6 | Fair | Functional but needs attention before scaling |
| 3-4 | Poor | Significant issues, refactoring recommended |
| 1-2 | Critical | Major problems, immediate action required |
</scoring_rubric>

<priority_criteria>
| Priority | Timeframe | Criteria |
|----------|-----------|----------|
| **Immediate** | This sprint | Security issues, breaking bugs, blockers |
| **Short-term** | Next 2-4 weeks | Tech debt, performance, maintainability |
| **Long-term** | Next quarter | Architecture, patterns, major refactors |
</priority_criteria>
</criteria>

<steps>
## Process

### 1. SCOPE
- Detect project profile (Python, TypeScript, Go, etc.)
- Identify scope (full codebase or specified directory)
- Check for `--ultrathink` flag (spawn parallel analysis agents)

### 2. EXPLORE
- **Standard**: Quick scan of key files (entry points, core modules, tests)
- **Ultrathink**: Deep exploration with parallel `Task` agents per dimension

| Mode | Depth | Time |
|------|-------|------|
| Standard | ~50 files sampled | Fast |
| Ultrathink | Full codebase scan | Thorough |

### 3. ANALYZE (Per Dimension)

<thinking>
For each dimension, systematically evaluate:
</thinking>

#### Architecture
```
- Check: Module boundaries, import cycles, layer violations
- Look for: index files, dependency injection, interface segregation
- Red flags: God classes, circular deps, tight coupling
```

#### Code Quality
```
- Check: Function length (<50 lines), nesting depth (<3), complexity
- Look for: Consistent naming, clear abstractions, DRY
- Red flags: Magic numbers, copy-paste code, inconsistent style
```

#### Security
```
- Check: Input validation, SQL injection, XSS, CSRF protection
- Look for: Auth middleware, secrets management, rate limiting
- Red flags: Hardcoded secrets, eval(), unsanitized user input
```

#### Performance
```
- Check: Query patterns, async/await usage, caching
- Look for: Pagination, connection pooling, lazy loading
- Red flags: N+1 queries, synchronous I/O, memory accumulation
```

#### Tech Debt
```
- Check: TODO/FIXME count, deprecated API usage
- Look for: Commented code, unused exports, old dependencies
- Red flags: 100+ TODOs, security vulnerabilities in deps
```

#### Test Coverage
```
- Check: Coverage %, test file presence, test patterns
- Look for: Unit tests, integration tests, edge cases
- Red flags: No tests, tests only for happy path
```

### 4. SCORE
Calculate weighted score:
```
Overall = (Arch × 0.20) + (Quality × 0.20) + (Security × 0.20)
        + (Perf × 0.15) + (Debt × 0.15) + (Tests × 0.10)
```

### 5. RECOMMEND
Prioritize findings by severity and effort.

### 6. OUTPUT
Generate structured report (see output_format below).
</steps>

<output_format>
```markdown
# Codebase Assessment: [Project Name]

## Summary
| Dimension | Score | Status |
|-----------|-------|--------|
| Architecture | X/10 | [emoji] |
| Code Quality | X/10 | [emoji] |
| Security | X/10 | [emoji] |
| Performance | X/10 | [emoji] |
| Tech Debt | X/10 | [emoji] |
| Test Coverage | X/10 | [emoji] |
| **Overall** | **X/10** | **[rating]** |

## Findings

### Architecture
[Key findings with file:line references]

### Code Quality
[Key findings with file:line references]

... (all dimensions)

## Recommendations

### Immediate (This Sprint)
1. [High priority item]
2. [High priority item]

### Short-term (2-4 Weeks)
1. [Medium priority item]
2. [Medium priority item]

### Long-term (Next Quarter)
1. [Strategic improvement]
2. [Strategic improvement]

## Next Steps
- [ ] Address immediate items
- [ ] Schedule short-term work
- [ ] Plan long-term initiatives
```
</output_format>

<constraints>
- Always provide file:line references for findings
- Score objectively based on evidence, not assumptions
- Acknowledge uncertainty when sampling (standard mode)
- Do not execute code or make changes during assessment
- Respect existing architectural decisions (check memory for context)
</constraints>

<avoid>
## Common Mistakes to Prevent

- **Making changes**: This is a READ-ONLY command. Don't edit files, don't fix issues, don't refactor. Only analyze and report.

- **Speculation**: Don't score based on assumptions. If you haven't read the code, acknowledge uncertainty. Use `[sampled]` notation.

- **Excessive markdown**: Don't fragment findings into bullet-point lists. Use flowing prose for explanations, tables for structured data.

- **Ignoring context**: Don't penalize patterns that were intentional decisions. Check memory for prior architectural decisions before criticizing.

- **Vague findings**: Don't say "code quality could be improved." Always provide specific file:line references and concrete issues.

- **Score inflation/deflation**: Don't give 9-10 unless truly excellent. Don't give 1-2 unless truly broken. Be calibrated.
</avoid>

## Ultrathink Mode

When `--ultrathink` is specified:

1. **Parallel Analysis**: Spawn 6 `Task` agents (one per dimension)
2. **Deep Exploration**: Each agent scans ALL relevant files
3. **Cross-Reference**: Memory search for prior decisions affecting scores
4. **GitHub Context**: Search for related issues/PRs if available

```yaml
Task:
  subagent_type: Explore
  prompt: "Analyze [dimension] for [scope]. Check: [criteria]. Report findings with file:line refs."
  model: sonnet
```

## Memory Integration

Search prior learnings that may affect assessment:
```
mcp__memory__search_nodes(query="architecture decision")
mcp__memory__search_nodes(query="security pattern")
mcp__memory__search_nodes(query="tech debt")
```

Prior decisions provide context for why certain patterns exist.

## Profile-Specific Checks

| Profile | Additional Checks |
|---------|-------------------|
| Python | Type hints coverage, docstrings, ruff compliance |
| Python Web | + UI/UX dimension (templates/, static/, Django/Flask) |
| TypeScript | Type coverage, ESLint rules, bundle size |
| TypeScript Web | + UI/UX dimension (React, Vue, Next.js, etc.) |
| Go | Error handling, golangci-lint, race conditions |
| Rust | Unsafe blocks, clippy warnings, documentation |

## Output Options

| Flag | Effect |
|------|--------|
| (none) | Print to console |
| `> ASSESSMENT.md` | Save to file (user redirects) |

## When to Use

- **Before major refactoring** — Know what you're dealing with
- **New team member onboarding** — Quick codebase overview
- **Pre-release audit** — Ensure quality standards
- **Technical debt planning** — Prioritize cleanup work
- **Architecture review** — Validate patterns and structure

<examples>
## Example Output

```
# Codebase Assessment: my-api

## Summary
| Dimension | Score | Status |
|-----------|-------|--------|
| Architecture | 7/10 | Good |
| Code Quality | 6/10 | Fair |
| Security | 8/10 | Good |
| Performance | 5/10 | Fair |
| Tech Debt | 4/10 | Poor |
| Test Coverage | 6/10 | Fair |
| **Overall** | **6.1/10** | **Fair** |

## Recommendations

### Immediate
1. Fix SQL injection in `src/api/users.py:45` (Security)
2. Add rate limiting to auth endpoints (Security)

### Short-term
1. Reduce complexity in `OrderService` - 15 methods, cyclomatic complexity 23
2. Add pagination to `/api/items` endpoint - currently returns all records
3. Clear 47 TODOs in core modules

### Long-term
1. Extract shared utilities into separate package
2. Implement caching layer for frequent queries
3. Increase test coverage from 45% to 80%
```
</examples>
