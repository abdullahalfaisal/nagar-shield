---
id: 024-moderation
unit: 007-moderation
intent: 001-nagar-shield-mvp1
type: ddd-construction-bolt
status: planned
stories: [005-author-auto-hide-queue, 006-moderator-action-audit-log]
created: 2026-11-04T00:00:00Z

# Dependency Tracking
requires_bolts: [023-moderation]
enables_bolts: [025-jobs-operations]
requires_units: [001-foundation, 002-identity, 004-capture, 006-alerts]
blocks: false

# Complexity Assessment
complexity:
  avg_complexity: 2
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 2
---

## Bolt: 024-moderation

### Objective
Deliver **audit and auto hide** for unit `007-moderation`. Stories: 2. Bolt type: `ddd-construction-bolt`.

### Stories Included

- [x]**005-author-auto-hide-queue** — Priority: should
- [x]**006-moderator-action-audit-log** — Priority: must

### Expected Outputs

- `ddd-01-domain-model.md` — entities, aggregates, invariants
- `ddd-02-technical-design.md` — schema, RLS, API contracts, UI composition
- `ddd-03-test-report.md` — verification evidence per acceptance criterion
- Working implementation for every story listed above

### Dependencies

#### Bolt Dependencies (within intent)

- **023-moderation** (Required): must complete first

#### Unit Dependencies (cross-unit)

- **001-foundation**: unit must be complete
- **002-identity**: unit must be complete
- **004-capture**: unit must be complete
- **006-alerts**: unit must be complete

#### Enables (other bolts waiting on this)

- 025-jobs-operations
