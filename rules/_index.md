# Rules Index

Rules provide topic-specific standards that auto-load based on task context.

## Auto-Loading

During `/cs-loop` INIT, rules are loaded based on task keywords:

| Keywords | Rules Loaded |
|----------|--------------|
| auth, login, password, jwt, oauth | `security`, `api-design` |
| test, spec, coverage, mock | `testing` |
| api, endpoint, route, rest | `api-design`, `error-handling` |
| database, query, schema, migration | `database` |
| performance, optimize, cache, slow | `performance` |
| ui, component, css, style | `ui-ux-design` |
| react, vue, svelte, angular, next, nuxt | `ui-ux-design` |
| frontend, web, responsive, tailwind | `ui-ux-design` |
| cli, terminal, command | `terminal-ui` |
| docs, readme, changelog | `documentation` |
| refactor, cleanup, quality | `code-quality` |
| git, commit, branch, pr | `git-workflow` |
| log, debug, trace | `logging` |
| error, exception, catch | `error-handling` |
| prompt, command, xml, template | `prompt-structure` |

## Available Rules

| Rule | Focus |
|------|-------|
| `security` | OWASP, auth, secrets, validation |
| `testing` | Coverage, mocks, TDD, naming |
| `api-design` | REST, responses, versioning |
| `database` | Schema, indexes, migrations |
| `performance` | Caching, optimization, Web Vitals |
| `code-quality` | Complexity, naming, dependencies |
| `documentation` | README, changelog, comments |
| `git-workflow` | Commits, branches, PRs |
| `error-handling` | Error types, logging, recovery |
| `logging` | Structured logs, levels, context |
| `ui-ux-design` | Spacing, typography, a11y |
| `terminal-ui` | Spinners, colors, progress |
| `prompt-structure` | XML tags, command templates |

## Usage

Rules auto-load during `/cs-loop`. For manual loading:
```
Load @rules/security for this review
```

## Full Reference

Complete rules with examples: `reference/v1/template/.claude/rules/`
