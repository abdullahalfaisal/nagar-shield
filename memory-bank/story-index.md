# Story Index — Nagar Shield MVP Phase 1

> Single-file story index for the intent `001-nagar-shield-mvp1`.
> 54 stories across 8 units, mapped to 27 bolts.
>
> The Status column is derived from each story file's `implemented`
> frontmatter, which is the authoritative source.
>
> **30 complete · 24 planned.** The index is reconciled against the story
> files on disk: 54 files, 54 rows, no duplicates, no orphans.

| Story | Title | Unit | Bolt | Priority | Status |
|---|---|---|---|---|---|
| 001-monorepo-workspace | Monorepo workspace and TypeScript configuration | 001-foundation | 001-foundation | must | planned |
| 002-shared-contracts | Shared contracts package | 001-foundation | 001-foundation | must | planned |
| 003-mobile-design-system | Mobile design system (theme tokens + UI primitives) | 001-foundation | 002-foundation | must | planned |
| 004-mobile-app-shell | Mobile app shell (Router groups, i18n, Supabase client) | 001-foundation | 003-foundation | must | planned |
| 005-admin-skeleton-and-ci | Admin app skeleton and CI pipeline | 001-foundation | 003-foundation | must | planned |
| 001-signup-with-email-and-phone | Signup with email and phone | 002-identity | 004-identity | must | complete |
| 002-dual-identifier-login | Dual-identifier login + Remember me | 002-identity | 004-identity | must | planned |
| 003-email-otp-password-reset | Email-OTP password reset | 002-identity | 005-identity | must | complete |
| 004-biometric-reauth-gate | Biometric re-auth gate | 002-identity | 005-identity | must | complete |
| 006-emergency-contacts-crud | Emergency contacts CRUD | 002-identity | 006-identity | must | complete |
| 005-remote-account-disable | Remote account disable | 002-identity | 006-identity | must | complete |
| 007-account-deletion-and-recovery | Account deletion + 30-day recovery | 002-identity | 006-identity | should | planned |
| 001-home-and-help-alert-grid | Home surface + Help Alert panic grid | 003-help-seek | 007-help-seek | must | planned |
| 002-personal-emergency-picker | Personal Emergency contact picker | 003-help-seek | 007-help-seek | must | planned |
| 003-bundled-station-hotline-dataset | Bundled station + hotline dataset | 003-help-seek | 008-help-seek | must | planned |
| 005-more-help-and-hotlines | More Help sheet + curated hotlines | 003-help-seek | 009-help-seek | must | complete |
| 006-thana-line-fallback | Thana line + 10 km → 999 fallback | 003-help-seek | 009-help-seek | must | complete |
| 008-wrong-number-report | Wrong-number report flow | 003-help-seek | 009-help-seek | should | complete |
| 007-find-a-station-map | Find-a-station map | 003-help-seek | 010-help-seek | should | complete |
| 004-graceful-degradation | Graceful degradation (location / battery) | 003-help-seek | 010-help-seek | must | planned |
| 001-capture-screen | Capture screen | 004-capture | 011-capture | must | planned |
| 004-exif-strip-and-media-caps | EXIF strip + media caps | 004-capture | 012-capture | must | planned |
| 007-storage-upload-and-finalize | Storage upload + finalize_capture | 004-capture | 012-capture | must | planned |
| 002-area-hierarchy-extraction | Area hierarchy extraction | 004-capture | 013-capture | must | planned |
| 003-report-detail-and-category-edit | Report detail + author category edit | 004-capture | 013-capture | must | complete |
| 005-offline-upload-queue | Offline upload queue | 004-capture | 014-capture | must | complete |
| 006-capture-permission-degradation | Capture permission degradation | 004-capture | 014-capture | must | complete |
| 001-location-sharing-screen | Location Sharing screen | 005-location | 015-location | must | complete |
| 002-os-share-sheet-fallback | OS share-sheet fallback | 005-location | 016-location | must | complete |
| 003-share-with-all-primary-contacts | Share with all primary contacts | 005-location | 016-location | must | complete |
| 004-snapshot-payload-and-telemetry | Snapshot payload + telemetry | 005-location | 017-location | must | complete |
| 005-location-permission-degradation | Location permission degradation | 005-location | 017-location | should | complete |
| 001-alerts-feed-list | Alerts feed list | 006-alerts | 018-alerts | must | planned |
| 003-area-filter-chips | Area filter chips | 006-alerts | 018-alerts | must | planned |
| 002-auto-refresh-and-pull-to-refresh | Auto-refresh + pull-to-refresh | 006-alerts | 019-alerts | must | planned |
| 004-flag-an-alert | Flag an alert | 006-alerts | 019-alerts | must | planned |
| 005-author-auto-hide | Author auto-hide (5 flags / 24 h) | 006-alerts | 019-alerts | should | complete |
| 006-history-list | History list | 006-alerts | 020-alerts | must | complete |
| 007-history-filters | History filters | 006-alerts | 020-alerts | must | complete |
| 008-history-map | History map | 006-alerts | 021-alerts | should | complete |
| 009-alert-detail-screen | Alert detail screen | 006-alerts | 021-alerts | must | complete |
| 001-moderator-login-and-queue | Moderator login + queue | 007-moderation | 022-moderation | must | planned |
| 002-report-review-detail | Report review detail | 007-moderation | 022-moderation | must | planned |
| 003-restore-remove-decision | Restore / remove decision | 007-moderation | 023-moderation | must | planned |
| 004-disable-a-user | Disable a user | 007-moderation | 023-moderation | must | planned |
| 005-author-auto-hide-queue | Author-auto-hidden queue group | 007-moderation | 024-moderation | should | complete |
| 006-moderator-action-audit-log | Moderator action audit log | 007-moderation | 024-moderation | must | planned |
| 001-media-purge-job | Media purge job (90-day) | 008-jobs-operations | 025-jobs-operations | must | complete |
| 002-deleted-account-pii-purge | Deleted-account PII purge (30-day) | 008-jobs-operations | 025-jobs-operations | must | complete |
| 003-geocode-cache-cleanup | Geocode cache cleanup | 008-jobs-operations | 025-jobs-operations | should | complete |
| 004-eas-build-profiles | EAS build profiles | 008-jobs-operations | 026-jobs-operations | must | complete |
| 005-ci-pipeline | CI pipeline | 008-jobs-operations | 026-jobs-operations | must | complete |
| 006-release-runbook | Release runbook | 008-jobs-operations | 027-jobs-operations | must | complete |
| 007-secrets-and-environments | Secrets and environments | 008-jobs-operations | 027-jobs-operations | must | complete |
