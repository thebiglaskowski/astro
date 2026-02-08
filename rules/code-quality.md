# Code Quality Rules

## Principles
1. Readability over cleverness
2. Consistency with codebase
3. Simplicity — prefer simple solutions
4. DRY with judgment — avoid premature abstraction

## Complexity Limits
| Metric | Limit |
|--------|-------|
| Function lines | 50 |
| Cyclomatic complexity | 10 |
| Nesting depth | 3 |
| Parameters | 4 |
| File lines | 400 |

## Naming
```javascript
// Booleans: is/has/can/should
const isActive = true;
const hasPermission = true;

// Arrays: plural
const users = [];

// Functions: verb + noun
function getUser() {}
function validateEmail() {}

// Constants: UPPER_SNAKE
const MAX_RETRIES = 3;
```

## Code Smells

### Deep Nesting
```javascript
// Bad
if (user) {
  if (user.isActive) {
    if (user.hasPermission) {
      // do thing
    }
  }
}

// Good - early returns
if (!user) return;
if (!user.isActive) return;
if (!user.hasPermission) return;
// do thing
```

### Magic Numbers
```javascript
// Bad
if (retries > 3) throw new Error();

// Good
const MAX_RETRIES = 3;
if (retries > MAX_RETRIES) throw new Error();
```

### Boolean Parameters
```javascript
// Bad
createUser(data, true, false);

// Good
createUser(data, { sendEmail: true, validate: false });
```

## Checklist
- [ ] Names are clear
- [ ] No functions > 50 lines
- [ ] No nesting > 3 levels
- [ ] No magic numbers
- [ ] No console.log or debug code
- [ ] No commented-out code

## Full Reference
`reference/v1/template/.claude/rules/code-quality.md`
