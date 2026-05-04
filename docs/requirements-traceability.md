# Requirements Traceability

## Purpose

Every meaningful code section must be traceable to one or more requirements from [requirements.md](requirements.md).

Traceability should make it possible to answer:

- why a file exists
- which requirement a class, function, route, test, or migration implements
- which tests verify a requirement
- whether a requirement has implementation coverage

## Requirement Reference Format

Use this exact format in code comments:

```text
Requirements: REQ-ID, REQ-ID
```

Examples:

```ts
// Requirements: OPT-004, OPT-005, OPT-012
export function calculateChargingPlan(...) {
  ...
}
```

```ts
// Requirements: CHG-101, CHG-103
export class MockChargerController implements ChargerController {
  ...
}
```

```sql
-- Requirements: DB-001, DB-002, DB-005, DB-006
create table electricity_prices (...);
```

## What Must Be Tagged

Tag these code sections:

- exported functions
- exported classes
- interfaces and type definitions with product meaning
- HTTP routes
- database migrations
- repository methods
- integration clients
- optimizer behavior
- validation logic
- test suites and test cases

Small private helper functions do not need separate tags when they are fully covered by the nearest tagged parent section.

## File-Level References

Each source file should start with a short file-level requirement reference when the whole file has a clear purpose.

Example:

```ts
// Requirements: TIB-001, TIB-002, TIB-006, TIB-007
```

Then add more specific references to exported sections when needed.

## Test References

Each test case should reference the behavior it verifies.

Example:

```ts
it("selects the cheapest intervals before departure", () => {
  // Requirements: OPT-003, OPT-004, TST-002
});
```

This makes tests useful as requirement evidence instead of only implementation checks.

## Commit and PR References

Commit messages and pull request descriptions should mention relevant requirement IDs when practical.

Example:

```text
Implement charging optimizer for OPT-001, OPT-004, OPT-005
```

## Traceability Matrix

The implementation traceability matrix lives in [traceability-matrix.md](traceability-matrix.md).

When adding a new module, route, migration, or test suite:

1. Add requirement comments in code.
2. Add or update matrix rows.
3. Add tests for requirements that describe deterministic behavior.

## Coverage States

Use these states in the matrix:

| State | Meaning |
| --- | --- |
| `planned` | Requirement has a planned implementation location, but no implementation yet. |
| `implemented` | Requirement has implementation code. |
| `tested` | Requirement has automated test coverage. |
| `deferred` | Requirement is intentionally postponed. |
| `out-of-scope` | Requirement describes an explicit exclusion. |

## Review Checklist

Before considering a requirement complete:

- The requirement appears in code comments.
- The requirement appears in the traceability matrix.
- Deterministic behavior has tests.
- Integration behavior has either tests, mock tests, or a documented manual verification path.
- No implementation depends on an out-of-scope requirement.
