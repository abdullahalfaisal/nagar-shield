---
id: 007-help-seek
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
type: ddd-construction-bolt
status: planned
stories: [001-home-and-help-alert-grid, 002-personal-emergency-picker]
created: 2026-11-04T00:00:00Z

# Dependency Tracking
requires_bolts: [003-foundation, 006-identity]
enables_bolts: [008-help-seek]
requires_units: [001-foundation, 002-identity]
blocks: false

# Complexity Assessment
complexity:
  avg_complexity: 3
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 3
---

## Bolt: 007-help-seek

### Objective
Deliver **help alert grid** for unit `003-help-seek`. Stories: 2. Bolt type: `ddd-construction-bolt`.

### Stories Included

- [x]**001-home-and-help-alert-grid** — Priority: must
- [ ] **002-personal-emergency-picker** — Priority: must

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

- 008-help-seek
