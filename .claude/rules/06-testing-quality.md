# Testing & Quality Assurance Rules

## Build Requirements

### Pre-Commit Checks
Before committing code, ensure:
1. `npm run build` completes successfully
2. No TypeScript errors (even if ignored in build config)
3. ESLint passes: `npm run lint`
4. No console errors in browser

### Build Commands
```bash
npm run dev          # Development with Turbopack
npm run build        # Production build (includes Prisma generate)
npm run lint         # ESLint check
npx prisma generate  # Generate Prisma client
```

## Code Review Checklist

### Security Review
- [ ] Authentication checked on all protected routes
- [ ] Authorization verified for resource access
- [ ] Input validation for all user inputs
- [ ] No PII logged or exposed
- [ ] No secrets hardcoded
- [ ] SQL/NoSQL injection prevented

### Data Integrity
- [ ] Visibility rules enforced
- [ ] Ownership verified before mutations
- [ ] Financial calculations validated server-side
- [ ] Transactions used for related operations

### Performance
- [ ] Database queries optimized (select, pagination)
- [ ] No N+1 queries
- [ ] Large arrays paginated
- [ ] Expensive operations cached or queued

### Accessibility
- [ ] Keyboard navigation works
- [ ] Screen reader compatible
- [ ] Color contrast sufficient
- [ ] Form labels present

## Error Scenarios to Test

### Authentication Errors
- Unauthenticated request
- Expired session
- Invalid token

### Authorization Errors
- Access to other user's private data
- Access to resource without membership
- Insufficient role permissions

### Input Validation Errors
- Missing required fields
- Invalid data types
- Out-of-range values
- Malformed ObjectIds

### Edge Cases
- Empty arrays/objects
- Null/undefined values
- Unicode characters
- Very long strings
- Concurrent modifications

## Performance Guidelines

### Response Time Targets
- API routes: < 500ms
- Page loads: < 3s (initial), < 1s (navigation)
- Database queries: < 100ms each

### Optimization Techniques
- Use `select` to limit fields
- Add database indexes for frequent queries
- Implement pagination for large datasets
- Cache expensive computations
- Use optimistic updates for better UX

## Monitoring Considerations

### Key Metrics to Track
- API response times
- Error rates by endpoint
- Authentication failures
- Database query performance
- User actions (for audit trail)

### Alerting Triggers
- Error rate > 1%
- Response time > 2s (p95)
- Authentication failure spike
- Database connection failures
