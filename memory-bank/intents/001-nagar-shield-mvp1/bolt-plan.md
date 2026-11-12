---
intent: 001-nagar-shield-mvp1
phase: inception
status: complete
created: 2026-11-04T00:00:00Z
updated: 2026-11-04T00:00:00Z
---

# Bolt Plan — Nagar Shield MVP Phase 1

**27 bolts** covering **54 stories** across 8 units.
Bolt ids use a **global** 3-digit sequence in `memory-bank/bolts/`.

## Bolts

| Bolt | Unit | Type | Stories |
|---|---|---|---|
| `001-foundation` | 001-foundation | simple-construction-bolt | 2 |
| `002-foundation` | 001-foundation | simple-construction-bolt | 1 |
| `003-foundation` | 001-foundation | simple-construction-bolt | 2 |
| `004-identity` | 002-identity | ddd-construction-bolt | 2 |
| `005-identity` | 002-identity | ddd-construction-bolt | 2 |
| `006-identity` | 002-identity | ddd-construction-bolt | 3 |
| `007-help-seek` | 003-help-seek | ddd-construction-bolt | 2 |
| `008-help-seek` | 003-help-seek | ddd-construction-bolt | 1 |
| `009-help-seek` | 003-help-seek | ddd-construction-bolt | 3 |
| `010-help-seek` | 003-help-seek | ddd-construction-bolt | 2 |
| `011-capture` | 004-capture | ddd-construction-bolt | 1 |
| `012-capture` | 004-capture | ddd-construction-bolt | 2 |
| `013-capture` | 004-capture | ddd-construction-bolt | 2 |
| `014-capture` | 004-capture | ddd-construction-bolt | 2 |
| `015-location` | 005-location | ddd-construction-bolt | 1 |
| `016-location` | 005-location | ddd-construction-bolt | 2 |
| `017-location` | 005-location | ddd-construction-bolt | 2 |
| `018-alerts` | 006-alerts | ddd-construction-bolt | 2 |
| `019-alerts` | 006-alerts | ddd-construction-bolt | 3 |
| `020-alerts` | 006-alerts | ddd-construction-bolt | 2 |
| `021-alerts` | 006-alerts | ddd-construction-bolt | 2 |
| `022-moderation` | 007-moderation | ddd-construction-bolt | 2 |
| `023-moderation` | 007-moderation | ddd-construction-bolt | 2 |
| `024-moderation` | 007-moderation | ddd-construction-bolt | 2 |
| `025-jobs-operations` | 008-jobs-operations | simple-construction-bolt | 3 |
| `026-jobs-operations` | 008-jobs-operations | simple-construction-bolt | 2 |
| `027-jobs-operations` | 008-jobs-operations | simple-construction-bolt | 2 |

## Dependency Graph

```text
foundation:
  001 → 002 → 003
identity:
  004 → 005 → 006
help-seek:
  007 → 008 → 009 → 010
capture:
  011 → 012 → 013 → 014
location:
  015 → 016 → 017
alerts:
  018 → 019 → 020 → 021
moderation:
  022 → 023 → 024
jobs-operations:
  025 → 026 → 027
```

## Execution Order

1. `001`–`003` — **001-foundation** (workspace, contracts, design system, shell)
2. `004`–`006` — **002-identity** (profile, auth, biometrics, contacts)
3. `007`–`010` — **003-help-seek** (Help Alert, dataset, More Help, station map)
4. `011`–`014` — **004-capture** (Capture screen, media pipeline, geocode, offline queue)
5. `015`–`017` — **005-location** (share screen, channels, payload)
6. `018`–`021` — **006-alerts** (feed, flagging, history, map)
7. `022`–`024` — **007-moderation** (queue, decisions, audit)
8. `025`–`027` — **008-jobs-operations** (purge jobs, build + CI, runbook)

## Story Coverage

| Unit | Stories | Bolts |
|---|---|---|
| 001-foundation | 5 | 3 |
| 002-identity | 7 | 3 |
| 003-help-seek | 8 | 4 |
| 004-capture | 7 | 4 |
| 005-location | 5 | 3 |
| 006-alerts | 9 | 4 |
| 007-moderation | 6 | 3 |
| 008-jobs-operations | 7 | 3 |

Every story in every unit is assigned to exactly one bolt. Validation runs at generation time.
