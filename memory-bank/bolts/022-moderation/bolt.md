---
id: 022-moderation
unit: 007-moderation
intent: 001-nagar-shield-mvp1
type: ddd-construction-bolt
status: planned
stories: [001-moderator-login-and-queue, 002-report-review-detail]
created: 2026-11-04T00:00:00Z

# Dependency Tracking
requires_bolts: [003-foundation, 006-identity, 014-capture, 021-alerts]
enables_bolts: [023-moderation]
requires_units: [001-foundation, 002-identity, 004-capture, 006-alerts]
blocks: false

# Complexity Assessment
complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 3
  testing_scope: 3
---

## Bolt: 022-moderation

### Objective
Deliver **queue** for unit `007-moderation`. Stories: 2. Bolt type: `ddd-construction-bolt`.

### Stories Included

- [ ] **001-moderator-login-and-queue** — Priority: must
- [ ] **002-report-review-detail** — Priority: must

### Expected Outputs

- `ddd-01-domain-model.md` — entities, aggregates, invariants
- `ddd-02-technical-design.md` — schema, RLS, API contracts, UI composition
- `ddd-03-test-report.md` — verification evidence per acceptance criterion
- Working implementation for every story listed above

### Dependencies

#### Bolt Dependencies (within intent)

- **003-foundation** (Required): must complete first
- **006-identity** (Required): must complete first
- **014-capture** (Required): must complete first
- **021-alerts** (Required): must complete first

#### Unit Dependencies (cross-unit)

- **001-foundation**: unit must be complete
- **002-identity**: unit must be complete
- **004-capture**: unit must be complete
- **006-alerts**: unit must be complete

#### Enables (other bolts waiting on this)

- 023-moderation
