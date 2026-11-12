---
id: 019-alerts
unit: 006-alerts
intent: 001-nagar-shield-mvp1
type: ddd-construction-bolt
status: planned
stories: [002-auto-refresh-and-pull-to-refresh, 004-flag-an-alert, 005-author-auto-hide]
created: 2026-11-04T00:00:00Z

# Dependency Tracking
requires_bolts: [018-alerts]
enables_bolts: [020-alerts]
requires_units: [001-foundation, 002-identity, 004-capture]
blocks: false

# Complexity Assessment
complexity:
  avg_complexity: 3
  avg_uncertainty: 2
  max_dependencies: 3
  testing_scope: 3
---

## Bolt: 019-alerts

### Objective
Deliver **refresh and flagging** for unit `006-alerts`. Stories: 3. Bolt type: `ddd-construction-bolt`.

### Stories Included

- [ ] **002-auto-refresh-and-pull-to-refresh** — Priority: must
- [ ] **004-flag-an-alert** — Priority: must
- [ ] **005-author-auto-hide** — Priority: should

### Expected Outputs

- `ddd-01-domain-model.md` — entities, aggregates, invariants
- `ddd-02-technical-design.md` — schema, RLS, API contracts, UI composition
- `ddd-03-test-report.md` — verification evidence per acceptance criterion
- Working implementation for every story listed above

### Dependencies

#### Bolt Dependencies (within intent)

- **018-alerts** (Required): must complete first

#### Unit Dependencies (cross-unit)

- **001-foundation**: unit must be complete
- **002-identity**: unit must be complete
- **004-capture**: unit must be complete

#### Enables (other bolts waiting on this)

- 020-alerts
