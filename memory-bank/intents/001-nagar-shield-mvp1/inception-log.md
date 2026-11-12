---
intent: 001-nagar-shield-mvp1
phase: inception
status: complete
created: 2026-11-04T00:00:00Z
updated: 2026-11-04T00:00:00Z
---

# Inception Log — Nagar Shield MVP Phase 1

## Session

| Field | Value |
|---|---|
| Intent | `001-nagar-shield-mvp1` |
| Product | Nagar Shield — BD citizen safety app |
| Phase | MVP Phase 1 |
| Flow | specsmd AI-DLC (`https://github.com/fabriqaai/specs.md`) |
| Project type | `full-stack-web` |

## Artifacts produced

| Artifact | Path | Status |
|---|---|---|
| Requirements | `memory-bank/intents/001-nagar-shield-mvp1/requirements.md` | complete |
| System context | `memory-bank/intents/001-nagar-shield-mvp1/system-context.md` | complete |
| Units | `memory-bank/intents/001-nagar-shield-mvp1/units.md` | complete |
| Unit briefs | `memory-bank/intents/001-nagar-shield-mvp1/units/*/unit-brief.md` (8) | complete |
| Stories | `memory-bank/intents/001-nagar-shield-mvp1/units/*/stories/*.md` (62) | complete |
| Bolt plan | `memory-bank/intents/001-nagar-shield-mvp1/bolt-plan.md` | complete |
| Bolt instances | `memory-bank/bolts/*/bolt.md` (27) | complete |
| Standards | `memory-bank/standards/*.md` (6) | complete |
| Design contract | `docs/design/design-tokens.md`, `docs/design/screen-spec.md` | complete |

## Key decisions taken during inception

| # | Decision | Rationale | Source |
|---|---|---|---|
| D-1 | Full PRD MVP is the contract, not the thinner Showcase profile | Showcase is a delivery profile over the same code, not a separate build | PRD §9.1, ADR-008 |
| D-2 | Design fidelity is a hard constraint | The user asked for "the design is same to same"; tokens + screen spec are the port contract | `prototype ui.html` |
| D-3 | Excluded the prototype's Charts / crime-stats screen entirely | FR-NG-3, FR-NG-4, ADR-010 — no crime dashboards in the product | PRD, ARCHITECTURE |
| D-4 | Excluded the prototype's fake iOS status bar | The target platform is Android; the real status bar replaces it | Platform decision |
| D-5 | Fire = `102`, Police/Medical = `999` | Locked PRD fact A-7; a prior prototype-review note asserting `16123` was wrong | PRD A-7 |
| D-6 | Email-primary Supabase Auth; phone as a required unique profile attribute | Waiver W-1; one auth user per person | ARCHITECTURE W-1 |
| D-7 | SMS OTP feature-flagged off for Phase 1 | Waiver W-2 — free-tier budget; the flag can be enabled later without changing the identity model | ARCHITECTURE W-2 |
| D-8 | The `contacts` table is unified with `emergency_contacts` | The prototype's onboarding wizard and screen 20 use one concept; a separate table would fork the code | Brief consistency |
| D-9 | Alerts + History live in one unit (`006-alerts`) | Both are read models over `reports` and share the map component | Unit cohesion |
| D-10 | `jobs-operations` is a separate unit from the feature domains | The purge job and the delivery pipeline span the whole system | Separation of concerns |
| D-11 | Added `client_request_id` idempotency key to `reports` | The offline upload queue can retry a submit whose response was lost; without it a retry creates a duplicate report | Capture unit brief |
| D-12 | Public feed omits `author_id` entirely (not nulled) | A nulled column is still named `author_id` and would fail the negative privacy test | Alerts unit brief |

## Open decisions raised during inception (need owner input)

These were surfaced by the unit briefs. None block the first bolt.

| # | Question | Where | Impact if unresolved |
|---|---|---|---|
| Q-1 | ~~`profiles.alternate_phone` — the prototype's S-02 "Alternate Phone" step has no persistence target in the specified schema. Add a nullable non-unique column, or drop the step?~~ **RESOLVED**: the column was added (`supabase/migrations/20261105000001_initial_schema.sql:75`) as nullable and non-unique, the format CHECK landed in migration 020, and the S-02 step now writes it. | `002-identity` | none — closed |
| Q-2 | FR-PERMS-3 battery-saver detection has **no first-class Expo API** — it likely needs a thin native module (Expo Modules API / `react-native-power-manager`). Ship it, or downgrade FR-PERMS-3 to "detect best-effort"? | `003-help-seek` | A native module, or an unmet FR |
| Q-3 | FR-SEEK-1 names three More Help categories; the prototype sheet shows six flat rows. The brief keeps all six rows 1:1 and makes each open its category. Confirm? | `003-help-seek` | Low — the brief's resolution is already the 1:1-safe choice |
| Q-4 | The prototype's screen 17 video copy says `সর্বোচ্চ ৬০ সেকেন্ড`; PRD-X-4 locks the cap at **30 s**. The brief changes the copy to 30 s. Confirm? | `004-capture` | Low — PRD wins by default |
| Q-5 | The prototype's screen 20 copy says "If no answer, it moves to the next primary, then the rest" — a dispatch-style automatic failover that FR-HELP-5's 2026-10-12 override forbids. The brief ports the layout but corrects the copy. Confirm? | `003-help-seek` | Low — the override is explicit |
| Q-6 | FR-ALERTS-5 names a `data-nav="21a"` alert-detail target that has no prototype screen, and the prototype's 21a is actually the *author's own* report detail (owned by unit 004). The brief builds a distinct public alert-detail screen. Confirm? | `006-alerts` | Low — the brief's resolution is coherent |

## Scope note — excluded by design

The following prototype surfaces are **not** built:

- Screen 23 "Charts (Admin App)" and the crime-statistics concept (FR-NG-3 / FR-NG-4).
- Any auto-dial, call-state observation, or call-outcome logic (C-1).
- Any delivery / read receipt for location sharing (ADR-005, waiver W-4).
- Live location streaming (FR-NG-7 / FR-LOC-3).
- Live Alerts push (FR-NG-8).
- SMS-OTP delivery (waiver W-2, flag off).

## Next phase

Construction. Start at bolt `001-foundation`.
