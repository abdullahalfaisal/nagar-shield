---
id: 014-capture
unit: 004-capture
intent: 001-nagar-shield-mvp1
type: ddd-construction-bolt
status: complete
stories: [005-offline-upload-queue, 006-capture-permission-degradation]
created: 2026-11-04T00:00:00Z
current_stage: null
stages_completed:
  - name: plan
    completed: '2026-11-13T00:00:00Z'
    artifact: the story files themselves — Technical Notes carries the design
  - name: implement
    completed: '2026-11-13T00:00:00Z'
    artifact: the story files themselves — Implementation carries the change record
  - name: test
    completed: '2026-11-13T00:00:00Z'
    artifact: the story files themselves — Verification carries the evidence

# Dependency Tracking
requires_bolts: [013-capture]
enables_bolts: [015-location, 018-alerts, 022-moderation, 025-jobs-operations]
requires_units: [001-foundation, 002-identity]
blocks: false
completed: '2026-11-13T00:00:00Z'

# Complexity Assessment
complexity:
  avg_complexity: 3
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 3
---

## Bolt: 014-capture

### Objective
Deliver **offline queue** for unit `004-capture`. Stories: 2. Bolt type: `ddd-construction-bolt`.

### Stories Included

- [x] **005-offline-upload-queue** — Priority: must
- [x] **006-capture-permission-degradation** — Priority: must

### Expected Outputs

- `ddd-01-domain-model.md` — entities, aggregates, invariants
- `ddd-02-technical-design.md` — schema, RLS, API contracts, UI composition
- `ddd-03-test-report.md` — verification evidence per acceptance criterion
- Working implementation for every story listed above

### Dependencies

#### Bolt Dependencies (within intent)

- **013-capture** (Required): must complete first

#### Unit Dependencies (cross-unit)

- **001-foundation**: unit must be complete
- **002-identity**: unit must be complete

#### Enables (other bolts waiting on this)

- 015-location
- 018-alerts
- 022-moderation
- 025-jobs-operations
