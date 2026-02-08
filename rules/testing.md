# Testing Rules

## Principles
1. Test behavior, not implementation
2. Fast feedback — unit tests in milliseconds
3. Deterministic — same input = same result
4. Isolated — tests don't depend on each other

## Coverage Targets
- Overall: 80%
- New code: 90%
- Critical paths: 100%

## Test Pyramid
```
      E2E (5-10%, slow, few)
    Integration (15-20%, medium)
  Unit (70-80%, fast, many)
```

## Naming
```javascript
// Pattern: should_[expected]_when_[condition]
it('should_return_user_when_valid_id')
it('should_throw_error_when_user_not_found')
```

## Structure (AAA)
```javascript
it('should calculate total', () => {
  // Arrange
  const cart = new Cart();
  cart.addItem({ price: 100 });

  // Act
  const total = cart.getTotal();

  // Assert
  expect(total).toBe(100);
});
```

## When to Mock
✓ External services, APIs, databases
✓ Time, randomness, file system
✗ The code under test
✗ Simple value objects

## Anti-Patterns
```javascript
// Multiple things in one test
it('should work', () => {
  expect(create()).toBeDefined();
  expect(delete()).toBe(true);  // Separate test!
});

// Sleep instead of wait
await sleep(1000);              // Bad
await waitFor(() => ...);       // Good

// Testing implementation
expect(component.state.x);      // Bad
expect(screen.getByText(...));  // Good
```

## Checklist
- [ ] Tests have descriptive names
- [ ] Each test verifies one behavior
- [ ] No hardcoded delays
- [ ] Edge cases covered
- [ ] Error paths tested

## Full Reference
`reference/v1/template/.claude/rules/testing.md`
