---
id: 016-location
unit: 005-location
intent: 001-nagar-shield-mvp1
type: ddd-construction-bolt
status: planned
stories: [002-os-share-sheet-fallback, 003-share-with-all-primary-contacts]
created: 2026-11-04T00:00:00Z

# Dependency Tracking
requires_bolts: [015-location]
enables_bolts: [017-location]
requires_units: [001-foundation, 002-identity, 004-capture]
blocks: false

# Complexity Assessment
complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 3
---

## Bolt: 016-location

### Objective
Deliver **share channels** for unit `005-location`. Stories: 2. Bolt type: `ddd-construction-bolt`.

### Stories Included

- [ ] **002-os-share-sheet-fallback** — Priority: must
- [ ] **003-share-with-all-primary-contacts** — Priority: must

### Expected Outputs

- `ddd-01-domain-model.md` — entities, aggregates, invariants
- `ddd-02-technical-design.md` — schema, RLS, API contracts, UI composition
- `ddd-03-test-report.md` — verification evidence per acceptance criterion
- Working implementation for every story listed above

### Dependencies

#### Bolt Dependencies (within intent)

- **015-location** (Required): must complete first

#### Unit Dependencies (cross-unit)

- **001-foundation**: unit must be complete
- **002-identity**: unit must be complete
- **004-capture**: unit must be complete

#### Enables (other bolts waiting on this)

- 017-location
