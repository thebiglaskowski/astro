# Terminal UI Rules

## Principles
1. Instant feedback — Never leave users waiting
2. Visual clarity — Important info stands out
3. Graceful degradation — Works everywhere
4. Helpful errors — What went wrong AND how to fix

## Status Indicators
```
✓ Success (green)
✗ Error (red)
⚠ Warning (yellow)
ℹ Info (blue)
○ Pending (gray)
● Active (cyan)
```

## Progress Feedback
| Duration | Feedback |
|----------|----------|
| <0.5s | None needed |
| 0.5-3s | Spinner |
| >3s | Progress bar or spinner with status |

## Color Usage
| Color | Meaning |
|-------|---------|
| Green | Success, complete |
| Red | Error, failure |
| Yellow | Warning, caution |
| Blue | Info, highlight |
| Cyan | Active, in-progress |
| Gray | Secondary |

## Message Patterns
```
✓ Build complete
  Output: dist/bundle.js (245 KB)
  Time: 2.3s

✗ Error: Config not found
  Expected: ./config.json
  Hint: Run `init` to create config
```

## Error Structure
1. What went wrong
2. Where it happened
3. Why it might have happened
4. How to fix it

## Exit Codes
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 130 | Interrupted (Ctrl+C) |

## Checklist
- [ ] Spinner for operations >0.5s
- [ ] Structured error messages
- [ ] Clear suggestions for fixes
- [ ] Confirmation for destructive actions
- [ ] Respect NO_COLOR env

## Full Reference
`reference/v1/template/.claude/rules/terminal-ui.md`
