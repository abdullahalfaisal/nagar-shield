---
id: 025-jobs-operations
unit: 008-jobs-operations
intent: 001-nagar-shield-mvp1
type: simple-construction-bolt
status: complete
stories:
  - 001-media-purge-job
  - 002-deleted-account-pii-purge
  - 003-geocode-cache-cleanup
created: '2026-11-04T00:00:00Z'
current_stage: null
stages_completed:
  - name: plan
    completed: '2026-11-05T13:00:00Z'
    artifact: implementation-plan.md
  - name: implement
    completed: '2026-11-05T13:20:00Z'
    artifact: implementation-walkthrough.md
  - name: test
    completed: '2026-11-05T13:40:00Z'
    artifact: test-walkthrough.md
requires_bolts:
  - 003-foundation
  - 006-identity
  - 010-help-seek
  - 014-capture
  - 017-location
  - 021-alerts
  - 024-moderation
enables_bolts:
  - 026-jobs-operations
requires_units:
  - 001-foundation
  - 002-identity
  - 003-help-seek
  - 004-capture
  - 005-location
  - 006-alerts
  - 007-moderation
blocks: false
complexity:
  avg_complexity: 2
  avg_uncertainty: 1
  max_dependencies: 2
  testing_scope: 2
completed: '2026-11-05T14:31:52Z'
---

## Bolt: 025-jobs-operations

### Objective
Deliver **purge jobs** for unit `008-jobs-operations`. Stories: 3. Bolt type: `simple-construction-bolt`.

### Stories Included

- [ ] **001-media-purge-job** — Priority: must
- [ ] **002-deleted-account-pii-purge** — Priority: must
- [ ] **003-geocode-cache-cleanup** — Priority: should

### Expected Outputs

- `implementation-plan.md` — the change plan and file map
- `test-report.md` — verification evidence per acceptance criterion
- Working implementation for every story listed above

### Dependencies

#### Bolt Dependencies (within intent)

- **003-foundation** (Required): must complete first
- **006-identity** (Required): must complete first
- **010-help-seek** (Required): must complete first
- **014-capture** (Required): must complete first
- **017-location** (Required): must complete first
- **021-alerts** (Required): must complete first
- **024-moderation** (Required): must complete first

#### Unit Dependencies (cross-unit)

- **001-foundation**: unit must be complete
- **002-identity**: unit must be complete
- **003-help-seek**: unit must be complete
- **004-capture**: unit must be complete
- **005-location**: unit must be complete
- **006-alerts**: unit must be complete
- **007-moderation**: unit must be complete

#### Enables (other bolts waiting on this)

- 026-jobs-operations
