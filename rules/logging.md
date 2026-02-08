# Logging Rules

## Principles
1. Log for operators — Someone debugging at 3 AM
2. Structured over text — JSON enables searching
3. Context is king — Include correlation IDs
4. Protect privacy — Never log secrets or PII

## Log Levels
| Level | When |
|-------|------|
| ERROR | Operation failed, needs attention |
| WARN | Recoverable issue, potential problem |
| INFO | Business events, state changes |
| DEBUG | Development diagnostics |

## Structured Format
```json
{
  "timestamp": "2026-02-01T10:30:00Z",
  "level": "info",
  "message": "Order created",
  "service": "order-service",
  "requestId": "req_abc123",
  "userId": "user_123",
  "orderId": "order_456"
}
```

## Always Log
- Authentication events
- Authorization failures
- Business transactions
- Errors with context
- Performance anomalies

## Never Log
- Passwords, tokens, secrets
- Credit cards, SSN
- Full request bodies in prod
- Stack traces to users

## Pattern
```javascript
logger.error('Payment failed', {
  error: err.message,
  stack: err.stack,
  userId: user.id,
  orderId: order.id,
  amount: order.total,
  requestId: req.id
});
```

## Checklist
- [ ] Structured JSON logging
- [ ] Correlation IDs in all logs
- [ ] No secrets in logs
- [ ] Errors include context
- [ ] Alerts on ERROR level

## Full Reference
`reference/v1/template/.claude/rules/logging.md`
