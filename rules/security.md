# Security Rules

## Principles
1. Defense in depth — Multiple layers
2. Least privilege — Minimum permissions
3. Fail secure — Errors deny access
4. Never trust input — Always validate

## Checklist

### Authentication
- [ ] Passwords: bcrypt/Argon2, min 12 chars
- [ ] Sessions: HttpOnly, Secure, SameSite cookies
- [ ] Tokens: Cryptographically random, 256+ bits
- [ ] MFA available for sensitive operations

### Authorization
- [ ] Check permissions on every request
- [ ] Deny by default
- [ ] Log access control failures

### Input Validation
- [ ] Validate type, length, format, range
- [ ] Use allowlists over denylists
- [ ] Parameterized queries (never string concat SQL)
- [ ] Escape output based on context (HTML, JS, URL)

### Secrets
- [ ] Never in code or config files
- [ ] Use environment variables or secret manager
- [ ] Rotate regularly (90 days)
- [ ] Different secrets per environment

### Headers
```
Strict-Transport-Security: max-age=31536000
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Content-Security-Policy: default-src 'self'
```

## Anti-Patterns
```javascript
// NEVER
query(`SELECT * FROM users WHERE id = ${userId}`)  // SQL injection
element.innerHTML = userInput                       // XSS
exec(`ping ${hostname}`)                           // Command injection
const API_KEY = "sk-1234"                          // Hardcoded secret
```

## Quick Reference
- OWASP Top 10: A01-A10 (check all)
- Full guide: `reference/v1/template/.claude/rules/security.md`
