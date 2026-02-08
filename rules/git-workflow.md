# Git Workflow Rules

## Branch Naming
```
feature/TICKET-123-short-description
bugfix/TICKET-456-fix-issue
hotfix/SEC-789-patch-vuln
release/v2.1.0
```

## Commit Messages
```
<type>(<scope>): <subject>

[body]

[footer]
```

### Types
| Type | When |
|------|------|
| feat | New feature |
| fix | Bug fix |
| docs | Documentation |
| refactor | Code restructure |
| test | Tests |
| chore | Tooling, deps |

### Examples
```
feat(auth): add OAuth login with Google

Implements Google OAuth with PKCE.

Closes #123
```

```
fix(api): handle null response from user service

Previously caused TypeError when user not found.

Fixes #456
```

## PR Standards
- Title: `[TICKET-123] Short description`
- Size: <500 lines (split if larger)
- One logical change per PR
- Tests included
- Self-reviewed before requesting

## Rules
- Never force push to shared branches
- Never commit directly to main
- Squash merge feature branches
- Delete branches after merge

## Checklist
- [ ] Branch follows naming convention
- [ ] Commits are atomic
- [ ] Rebased on latest main
- [ ] Tests pass locally
- [ ] No debug code
- [ ] No secrets in commits

## Full Reference
`reference/v1/template/.claude/rules/git-workflow.md`
