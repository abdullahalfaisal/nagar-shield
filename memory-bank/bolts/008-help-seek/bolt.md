---
id: 008-help-seek
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
type: ddd-construction-bolt
status: planned
stories: [003-bundled-station-hotline-dataset]
created: 2026-11-04T00:00:00Z

# Dependency Tracking
requires_bolts: [007-help-seek]
enables_bolts: [009-help-seek]
requires_units: [001-foundation, 002-identity]
blocks: false

# Complexity Assessment
complexity:
  avg_complexity: 1
  avg_uncertainty: 1
  max_dependencies: 1
  testing_scope: 1
---

## Bolt: 008-help-seek

### Objective
Deliver **curated dataset** for unit `003-help-seek`. Stories: 1. Bolt type: `ddd-construction-bolt`.

### Stories Included

- [x]**003-bundled-station-hotline-dataset** — Priority: must

### Expected Outputs

- `ddd-01-domain-model.md` — entities, aggregates, invariants
- `ddd-02-technical-design.md` — schema, RLS, API contracts, UI composition
- `ddd-03-test-report.md` — verification evidence per acceptance criterion
- Working implementation for every story listed above

### Dependencies

#### Bolt Dependencies (within intent)

- **007-help-seek** (Required): must complete first

#### Unit Dependencies (cross-unit)

- **001-foundation**: unit must be complete
- **002-identity**: unit must be complete

#### Enables (other bolts waiting on this)

- 009-help-seek
