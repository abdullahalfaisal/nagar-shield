---
id: 003-foundation
unit: 001-foundation
intent: 001-nagar-shield-mvp1
type: simple-construction-bolt
status: planned
stories: [004-mobile-app-shell, 005-admin-skeleton-and-ci]
created: 2026-11-04T00:00:00Z

# Dependency Tracking
requires_bolts: [002-foundation]
enables_bolts: [004-identity, 007-help-seek, 011-capture, 015-location, 018-alerts, 022-moderation, 025-jobs-operations]
requires_units: []
blocks: false

# Complexity Assessment
complexity:
  avg_complexity: 2
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 2
---

## Bolt: 003-foundation

### Objective
Deliver **app shell and admin** for unit `001-foundation`. Stories: 2. Bolt type: `simple-construction-bolt`.

### Stories Included

- [ ] **004-mobile-app-shell** — Priority: must
- [ ] **005-admin-skeleton-and-ci** — Priority: must

### Expected Outputs

- `implementation-plan.md` — the change plan and file map
- `test-report.md` — verification evidence per acceptance criterion
- Working implementation for every story listed above

### Dependencies

#### Bolt Dependencies (within intent)

- **002-foundation** (Required): must complete first

#### Unit Dependencies (cross-unit)

- None.

#### Enables (other bolts waiting on this)

- 004-identity
- 007-help-seek
- 011-capture
- 015-location
- 018-alerts
- 022-moderation
- 025-jobs-operations
