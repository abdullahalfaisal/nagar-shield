---
id: 010-help-seek
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
type: ddd-construction-bolt
status: planned
stories: [007-find-a-station-map, 004-graceful-degradation]
created: 2026-11-04T00:00:00Z

# Dependency Tracking
requires_bolts: [009-help-seek]
enables_bolts: [025-jobs-operations]
requires_units: [001-foundation, 002-identity]
blocks: false

# Complexity Assessment
complexity:
  avg_complexity: 3
  avg_uncertainty: 3
  max_dependencies: 3
  testing_scope: 3
---

## Bolt: 010-help-seek

### Objective
Deliver **station map and degradation** for unit `003-help-seek`. Stories: 2. Bolt type: `ddd-construction-bolt`.

### Stories Included

- [ ] **007-find-a-station-map** — Priority: should
- [ ] **004-graceful-degradation** — Priority: must

### Expected Outputs

- `ddd-01-domain-model.md` — entities, aggregates, invariants
- `ddd-02-technical-design.md` — schema, RLS, API contracts, UI composition
- `ddd-03-test-report.md` — verification evidence per acceptance criterion
- Working implementation for every story listed above

### Dependencies

#### Bolt Dependencies (within intent)

- **009-help-seek** (Required): must complete first

#### Unit Dependencies (cross-unit)

- **001-foundation**: unit must be complete
- **002-identity**: unit must be complete

#### Enables (other bolts waiting on this)

- 025-jobs-operations
