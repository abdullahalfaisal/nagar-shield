---
id: 005-identity
unit: 002-identity
intent: 001-nagar-shield-mvp1
type: ddd-construction-bolt
status: planned
stories: [003-email-otp-password-reset, 004-biometric-reauth-gate]
created: 2026-11-04T00:00:00Z

# Dependency Tracking
requires_bolts: [004-identity]
enables_bolts: [006-identity]
requires_units: [001-foundation]
blocks: false

# Complexity Assessment
complexity:
  avg_complexity: 2
  avg_uncertainty: 2
  max_dependencies: 2
  testing_scope: 2
---

## Bolt: 005-identity

### Objective
Deliver **reset and biometrics** for unit `002-identity`. Stories: 2. Bolt type: `ddd-construction-bolt`.

### Stories Included

- [ ] **003-email-otp-password-reset** — Priority: must
- [ ] **004-biometric-reauth-gate** — Priority: must

### Expected Outputs

- `ddd-01-domain-model.md` — entities, aggregates, invariants
- `ddd-02-technical-design.md` — schema, RLS, API contracts, UI composition
- `ddd-03-test-report.md` — verification evidence per acceptance criterion
- Working implementation for every story listed above

### Dependencies

#### Bolt Dependencies (within intent)

- **004-identity** (Required): must complete first

#### Unit Dependencies (cross-unit)

- **001-foundation**: unit must be complete

#### Enables (other bolts waiting on this)

- 006-identity
