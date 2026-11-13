---
id: 017-location
unit: 005-location
intent: 001-nagar-shield-mvp1
type: ddd-construction-bolt
status: complete
stories: [004-snapshot-payload-and-telemetry, 005-location-permission-degradation]
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
requires_bolts: [016-location]
enables_bolts: [025-jobs-operations]
requires_units: [001-foundation, 002-identity, 004-capture]
blocks: false
completed: '2026-11-13T00:00:00Z'

# Complexity Assessment
complexity:
  avg_complexity: 2
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 2
---

## Bolt: 017-location

### Objective
Deliver **payload and degradation** for unit `005-location`. Stories: 2. Bolt type: `ddd-construction-bolt`.

### Stories Included

- [x] **004-snapshot-payload-and-telemetry** — Priority: must
- [x] **005-location-permission-degradation** — Priority: must

### Expected Outputs

- `ddd-01-domain-model.md` — entities, aggregates, invariants
- `ddd-02-technical-design.md` — schema, RLS, API contracts, UI composition
- `ddd-03-test-report.md` — verification evidence per acceptance criterion
- Working implementation for every story listed above

### Dependencies

#### Bolt Dependencies (within intent)

- **016-location** (Required): must complete first

#### Unit Dependencies (cross-unit)

- **001-foundation**: unit must be complete
- **002-identity**: unit must be complete
- **004-capture**: unit must be complete

#### Enables (other bolts waiting on this)

- 025-jobs-operations
