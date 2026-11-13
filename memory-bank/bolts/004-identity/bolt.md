---
id: 004-identity
unit: 002-identity
intent: 001-nagar-shield-mvp1
type: ddd-construction-bolt
status: planned
stories: [001-signup-with-email-and-phone, 002-dual-identifier-login]
created: 2026-11-04T00:00:00Z

# Dependency Tracking
requires_bolts: [003-foundation]
enables_bolts: [005-identity]
requires_units: [001-foundation]
blocks: false

# Complexity Assessment
complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

## Bolt: 004-identity

### Objective
Deliver **profile and auth core** for unit `002-identity`. Stories: 2. Bolt type: `ddd-construction-bolt`.

### Stories Included

- [x]**001-signup-with-email-and-phone** — Priority: must
- [x]**002-dual-identifier-login** — Priority: must

### Expected Outputs

- `ddd-01-domain-model.md` — entities, aggregates, invariants
- `ddd-02-technical-design.md` — schema, RLS, API contracts, UI composition
- `ddd-03-test-report.md` — verification evidence per acceptance criterion
- Working implementation for every story listed above

### Dependencies

#### Bolt Dependencies (within intent)

- **003-foundation** (Required): must complete first

#### Unit Dependencies (cross-unit)

- **001-foundation**: unit must be complete

#### Enables (other bolts waiting on this)

- 005-identity
