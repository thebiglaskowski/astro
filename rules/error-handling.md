# Error Handling Rules

## Principles
1. Fail fast — Detect early
2. Fail loud — Don't swallow errors
3. Fail safe — Graceful degradation
4. Provide context — What, where, why, how to fix

## Error Hierarchy
```
AppError (base)
├── ValidationError     (400)
├── AuthenticationError (401)
├── AuthorizationError  (403)
├── NotFoundError       (404)
├── ConflictError       (409)
└── ServiceError        (500)
```

## Error Messages

### For Users
```
✗ "ECONNREFUSED 127.0.0.1:5432"
✓ "Unable to save. Please try again."
```

### For Developers
```javascript
logger.error('Payment failed', {
  error: err.message,
  stack: err.stack,
  userId: user.id,
  orderId: order.id,
  requestId: req.id
});
```

## Try-Catch Pattern
```javascript
try {
  await processPayment(order);
} catch (error) {
  if (error instanceof ValidationError) {
    return res.status(400).json({ error: error.toJSON() });
  }
  if (error instanceof NotFoundError) {
    return res.status(404).json({ error: error.toJSON() });
  }
  // Re-throw unexpected
  throw error;
}
```

## Anti-Patterns
```javascript
// Swallowing errors
try { doThing(); } catch (e) { }  // NEVER

// Generic handling
catch (e) { console.log('Error'); }  // No context

// Wrong status
res.status(200).json({ error: 'Not found' });  // Should be 404
```

## Checklist
- [ ] Errors have appropriate types
- [ ] User messages are friendly
- [ ] Dev logs include context
- [ ] No sensitive data in messages
- [ ] Unexpected errors re-thrown

## Full Reference
`reference/v1/template/.claude/rules/error-handling.md`
