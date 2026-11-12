---
id: 013-capture
unit: 004-capture
intent: 001-nagar-shield-mvp1
type: ddd-construction-bolt
status: planned
stories: [002-area-hierarchy-extraction, 003-report-detail-and-category-edit]
created: 2026-11-04T00:00:00Z

# Dependency Tracking
requires_bolts: [012-capture]
enables_bolts: [014-capture]
requires_units: [001-foundation, 002-identity]
blocks: false

# Complexity Assessment
complexity:
  avg_complexity: 2
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 2
---

## Bolt: 013-capture

### Objective
Deliver **geocode and report** for unit `004-capture`. Stories: 2. Bolt type: `ddd-construction-bolt`.

### Stories Included

- [ ] **002-area-hierarchy-extraction** — Priority: must
- [ ] **003-report-detail-and-category-edit** — Priority: must

### Expected Outputs

- `ddd-01-domain-model.md` — entities, aggregates, invariants
- `ddd-02-technical-design.md` — schema, RLS, API contracts, UI composition
- `ddd-03-test-report.md` — verification evidence per acceptance criterion
- Working implementation for every story listed above

### Dependencies

#### Bolt Dependencies (within intent)

- **012-capture** (Required): must complete first

#### Unit Dependencies (cross-unit)

- **001-foundation**: unit must be complete
- **002-identity**: unit must be complete

#### Enables (other bolts waiting on this)

- 014-capture
