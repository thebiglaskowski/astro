# API Design Rules

## Principles
1. Consistency — Same patterns everywhere
2. Predictability — Clients can guess behavior
3. Stateless — No server-side session state

## REST URLs
```
GET    /users           List
POST   /users           Create
GET    /users/:id       Read
PUT    /users/:id       Replace
PATCH  /users/:id       Update
DELETE /users/:id       Delete

# Nested resources
GET    /users/:id/orders

# Actions (when REST doesn't fit)
POST   /orders/:id/actions/cancel
```

## Response Format
```json
{
  "data": { },
  "meta": { "requestId": "abc123" }
}
```

## Error Format
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "User-friendly message",
    "details": [
      { "field": "email", "message": "Invalid format" }
    ]
  }
}
```

## Status Codes
| Code | Use |
|------|-----|
| 200 | Success (GET, PUT, PATCH) |
| 201 | Created (POST) |
| 204 | No Content (DELETE) |
| 400 | Bad Request (validation) |
| 401 | Unauthorized (no auth) |
| 403 | Forbidden (no permission) |
| 404 | Not Found |
| 409 | Conflict (duplicate) |
| 429 | Rate Limited |
| 500 | Server Error |

## Pagination
```
GET /users?page=2&limit=20

Response includes:
{ "meta": { "total": 100, "page": 2, "pages": 5 } }
```

## Versioning
```
/api/v1/users
/api/v2/users
```

## Checklist
- [ ] URLs use nouns, not verbs
- [ ] Plural resource names
- [ ] Appropriate status codes
- [ ] Structured error responses
- [ ] Pagination on lists
- [ ] Rate limiting headers

## Full Reference
`reference/v1/template/.claude/rules/api-design.md`
