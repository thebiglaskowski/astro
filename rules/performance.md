# Performance Rules

## Principles
1. Measure first — Profile before optimizing
2. Optimize bottlenecks — Not everything
3. User perception matters — Perceived ≠ actual

## Web Vitals Targets
| Metric | Good |
|--------|------|
| LCP | ≤2.5s |
| FID | ≤100ms |
| CLS | ≤0.1 |
| TTFB | ≤800ms |

## API Response Targets
| Type | Target |
|------|--------|
| Health check | <10ms |
| Simple CRUD | <100ms |
| List + pagination | <200ms |
| Complex query | <500ms |

## Optimization Patterns
```javascript
// Pagination - never unlimited
const users = await User.findAll({
  limit: Math.min(limit, 100),
  offset: (page - 1) * limit
});

// Field selection
const user = await User.findOne({
  attributes: ['id', 'name'],  // Not SELECT *
  where: { id }
});

// Parallel when possible
const [users, orders] = await Promise.all([
  getUsers(),
  getOrders()
]);
```

## Caching
| Data Type | TTL |
|-----------|-----|
| Static assets | 1 year |
| API responses | 1-5 min |
| User session | 30 min |
| Computed stats | 15-60 min |

```javascript
// Cache-aside pattern
async function getUser(id) {
  const cached = await cache.get(`user:${id}`);
  if (cached) return cached;

  const user = await db.users.findOne(id);
  await cache.set(`user:${id}`, user, 3600);
  return user;
}
```

## Anti-Patterns
```javascript
// Sync in hot path
fs.readFileSync(path);  // Use async

// Unbounded cache
const cache = {};  // Use LRU with limit

// N+1 queries
for (user of users) {
  orders = await getOrders(user.id);  // Batch!
}
```

## Checklist
- [ ] Core Web Vitals in "Good"
- [ ] No API response >2s
- [ ] No N+1 queries
- [ ] Pagination on lists
- [ ] Caching where appropriate

## Full Reference
`reference/v1/template/.claude/rules/performance.md`
