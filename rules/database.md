# Database Rules

## Principles
1. Data integrity first — Constraints prevent bugs
2. Normalize, then denormalize
3. Index strategically — Every index has cost
4. Migrations are code — Version controlled, reversible

## Naming
```sql
-- Tables: plural, snake_case
users, order_items

-- Columns: snake_case
user_id, created_at, is_active

-- Indexes: idx_table_columns
idx_orders_user_id
```

## Required Columns
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- your columns --
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Data Types
| Use | Type |
|-----|------|
| IDs | UUID or BIGINT |
| Money | DECIMAL(19,4) |
| Timestamps | TIMESTAMPTZ |
| Large text | TEXT |

## Indexing
```sql
-- Index all foreign keys
CREATE INDEX idx_orders_user_id ON orders(user_id);

-- Composite for common queries
CREATE INDEX idx_orders_user_status ON orders(user_id, status);

-- Partial for filtered queries
CREATE INDEX idx_active_users ON users(email)
  WHERE deleted_at IS NULL;
```

## Safe Migrations
```sql
-- 1. Add nullable
ALTER TABLE users ADD COLUMN phone VARCHAR(20);

-- 2. Backfill in batches
UPDATE users SET phone = 'unknown'
  WHERE phone IS NULL LIMIT 1000;

-- 3. Add constraint after backfill
ALTER TABLE users ALTER COLUMN phone SET NOT NULL;
```

## Anti-Patterns
```sql
-- SELECT * (over-fetching)
SELECT * FROM users;  -- Select specific columns

-- No LIMIT
SELECT id FROM large_table;  -- Add LIMIT

-- N+1 queries
for user in users:
  orders = query(user.id)  -- Batch instead
```

## Checklist
- [ ] All tables have primary keys
- [ ] Foreign keys constrained
- [ ] Indexes on FKs and query patterns
- [ ] Migrations reversible
- [ ] No SELECT *

## Full Reference
`reference/v1/template/.claude/rules/database.md`
