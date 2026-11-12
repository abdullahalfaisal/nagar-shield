---
id: 011-capture
unit: 004-capture
intent: 001-nagar-shield-mvp1
type: ddd-construction-bolt
status: planned
stories: [001-capture-screen]
created: 2026-11-04T00:00:00Z

# Dependency Tracking
requires_bolts: [003-foundation, 006-identity]
enables_bolts: [012-capture]
requires_units: [001-foundation, 002-identity]
blocks: false

# Complexity Assessment
complexity:
  avg_complexity: 3
  avg_uncertainty: 2
  max_dependencies: 3
  testing_scope: 3
---

## Bolt: 011-capture

### Objective
Deliver **capture screen** for unit `004-capture`. Stories: 1. Bolt type: `ddd-construction-bolt`.

### Stories Included

- [ ] **001-capture-screen** — Priority: must

### Expected Outputs

- `ddd-01-domain-model.md` — entities, aggregates, invariants
- `ddd-02-technical-design.md` — schema, RLS, API contracts, UI composition
- `ddd-03-test-report.md` — verification evidence per acceptance criterion
- Working implementation for every story listed above

### Dependencies

#### Bolt Dependencies (within intent)

- **003-foundation** (Required): must complete first
- **006-identity** (Required): must complete first

#### Unit Dependencies (cross-unit)

- **001-foundation**: unit must be complete
- **002-identity**: unit must be complete

#### Enables (other bolts waiting on this)

- 012-capture
