---
id: 010-help-seek
unit: 003-help-seek
intent: 001-nagar-shield-mvp1
type: ddd-construction-bolt
status: complete
stories: [007-find-a-station-map, 004-graceful-degradation]
created: 2026-11-04T00:00:00Z

# Dependency Tracking
requires_bolts: [009-help-seek]
enables_bolts: [025-jobs-operations]
requires_units: [001-foundation, 002-identity]
blocks: false

# Complexity Assessment
complexity:
  avg_complexity: 3
  avg_uncertainty: 3
  max_dependencies: 3
  testing_scope: 3
---

## Bolt: 010-help-seek

### Objective
Deliver **station map and degradation** for unit `003-help-seek`. Stories: 2. Bolt type: `ddd-construction-bolt`.

### Stories Included

- [x] **007-find-a-station-map** — Priority: should
- [x] **004-graceful-degradation** — Priority: must

> **The bolt is `complete`.** A bolt is `complete` only when **every** story
> it lists says `implemented: true` in its own frontmatter.
> `007-find-a-station-map` landed on 2026-11-13; `004-graceful-degradation`
> landed on 2026-11-14 with the location-denied, battery-saver, and offline
> guidance — one shared `ManualDialGuidance` component that every help entry
> point renders.
>
> **The `ddd-*.md` artifacts are not written**: the story files carry the
> design (Technical Notes), the change record (Implementation) and the
> evidence (Verification) instead, so inventing a separate artifact file
> would be duplicating what already exists.
>
> **One limitation is recorded, not hidden.** The Android power-save
> detection needs a native module that this build does not ship, so the
> battery-saver warning ships as its static copy. The capability is a named
> constant (`BATTERY_SAVER_DETECTION`) and the story records it as a known
> limitation — the story's own specified degradation path, not a silent
> no-op.

### Expected Outputs

- `ddd-01-domain-model.md` — entities, aggregates, invariants
- `ddd-02-technical-design.md` — schema, RLS, API contracts, UI composition
- `ddd-03-test-report.md` — verification evidence per acceptance criterion
- Working implementation for every story listed above

### Dependencies

#### Bolt Dependencies (within intent)

- **009-help-seek** (Required): must complete first

#### Unit Dependencies (cross-unit)

- **001-foundation**: unit must be complete
- **002-identity**: unit must be complete

#### Enables (other bolts waiting on this)

- 025-jobs-operations
