# Documentation Rules

## Principles
1. Documentation is a deliverable, not afterthought
2. Single source of truth for each piece of info
3. Write for the reader, not the writer
4. Outdated docs are worse than none

## When to Update CHANGELOG
**Always when you:**
- Add a new feature
- Fix a user-impacting bug
- Change defaults or config
- Deprecate or remove functionality
- Make breaking changes

**Skip only when:**
- Purely internal refactors
- No behavior change
- No user/operator impact

## When to Update Docs
**Always when you change:**
- APIs or interfaces
- Configuration options
- Installation/setup
- Architecture or boundaries
- Security or auth
- Database schema

## CHANGELOG Format
```markdown
## [1.2.0] - 2026-02-01

### Added
- OAuth login with Google (#123)

### Changed
- Improved error messages

### Fixed
- Header alignment on mobile (#456)

### Security
- Updated bcrypt for CVE-2024-XXX
```

## Code Comments
**Do comment:**
- Why something is done (not what)
- Complex algorithms
- Workarounds with ticket refs
- Public API docs

**Don't comment:**
- Obvious code
- Commented-out code (delete it)
- Redundant information

## Checklist
- [ ] README updated if user-facing
- [ ] CHANGELOG entry added
- [ ] API docs updated
- [ ] No typos
- [ ] Links are valid
- [ ] Examples tested

## Full Reference
`reference/v1/template/.claude/rules/documentation.md`
