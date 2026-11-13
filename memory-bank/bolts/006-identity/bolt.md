---
id: 006-identity
unit: 002-identity
intent: 001-nagar-shield-mvp1
type: ddd-construction-bolt
status: planned
stories: [006-emergency-contacts-crud, 005-remote-account-disable, 007-account-deletion-and-recovery]
created: 2026-11-04T00:00:00Z

# Dependency Tracking
requires_bolts: [005-identity]
enables_bolts: [007-help-seek, 011-capture, 015-location, 018-alerts, 022-moderation, 025-jobs-operations]
requires_units: [001-foundation]
blocks: false

# Complexity Assessment
complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
---

## Bolt: 006-identity

### Objective
Deliver **contacts and account** for unit `002-identity`. Stories: 3. Bolt type: `ddd-construction-bolt`.

### Stories Included

- [x]**006-emergency-contacts-crud** — Priority: must
- [x]**005-remote-account-disable** — Priority: must
- [x]**007-account-deletion-and-recovery** — Priority: should

### Expected Outputs

- `ddd-01-domain-model.md` — entities, aggregates, invariants
- `ddd-02-technical-design.md` — schema, RLS, API contracts, UI composition
- `ddd-03-test-report.md` — verification evidence per acceptance criterion
- Working implementation for every story listed above

### Dependencies

#### Bolt Dependencies (within intent)

- **005-identity** (Required): must complete first

#### Unit Dependencies (cross-unit)

- **001-foundation**: unit must be complete

#### Enables (other bolts waiting on this)

- 007-help-seek
- 011-capture
- 015-location
- 018-alerts
- 022-moderation
- 025-jobs-operations
