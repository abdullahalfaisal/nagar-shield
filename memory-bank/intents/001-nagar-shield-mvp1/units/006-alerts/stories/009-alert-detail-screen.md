---
id: 009-alert-detail-screen
unit: 006-alerts
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: false
---

# Story: 009-alert-detail-screen

## User Story

**As a** Nagar Shield user who sees an alert in the feed and wants the full picture before deciding whether to trust or flag it
**I want** to open the alert and read its media, description, area, category, and time
**So that** I can judge the report properly instead of acting on a one-line summary

## Acceptance Criteria

- [ ] **Given** the user taps the feed card's **✎ বিস্তারিত দেখুন** link (`data-nav="21a"` in the prototype), **When** the detail surface opens, **Then** it is a **new surface** built in Phase 1 — the prototype has **no** screen for a *public* alert detail, so this screen is created from the alert card plus unit `004`'s report-detail pattern
- [ ] **Given** the detail surface renders, **When** its contents are inspected, **Then** it shows the **media**, the **full description**, the **area**, the **category**, the **relative time**, the **absolute capture time**, and a **flag action**
- [ ] **Given** the report has attached media, **When** the media block renders, **Then** it displays the media through a **short-lived signed URL** from unit `004`'s report-media path — the storage bucket is never public and the URL is never persisted
- [ ] **Given** the report is **anonymous**, **When** the screen renders, **Then** it shows **no author identity** — no name, no avatar, no handle, no author id, and no "reported by" row of any kind
- [ ] **Given** the category renders, **When** the text is read, **Then** it is the **Bangla / English pair** in the prototype's format — e.g. **চুরি — Theft** — and a report with no category shows the neutral **অকার্যনির্দিষ্ট — Uncategorized** placeholder rather than an empty gap
- [ ] **Given** the user taps the flag action on the detail surface, **When** the flag sheet opens, **Then** it behaves **exactly as in the feed** — the same five reason radios, the same optional note, the same submit / cancel, the same success toast, and the same error mapping for `CONFLICT` and `FLAG_RATE_LIMIT`
- [ ] **Given** the detail surface renders, **When** it is compared with the app's design system, **Then** it is built **only from the existing tokens and shared primitives** — no new colour token, no new type ramp, no new layout system
- [ ] **Given** the report was removed or hidden by moderation before the user opened it, **When** the detail query resolves, **Then** the screen shows a "this report is no longer available" state and renders **no** report content — it never renders a removed report
- [ ] **Given** the user opens the detail from the feed, **When** the screen renders, **Then** it is reachable by the route the feed card's link opens **and** by the History map's marker tap, and both entry points render the identical surface
- [ ] **Given** the device is offline or the signed URL has expired, **When** the media block loads, **Then** the media shows a graceful placeholder — the description, area, category, and times still render, and the screen never shows a broken image frame or a crash

## Technical Notes

- **There are two distinct surfaces behind `21a`, and they are not the same screen.** The prototype's `data-nav="21a"` target exists only as the **author's own** report-detail / category-refinement surface, which is unit `004`'s and is reached from History. There is **no** prototype screen for the **public** alert detail. This story builds the public alert-detail surface: image + description + category + area + time, with the flag action available from it as well.
- **The public detail is a different read path from the author's own detail.** The author's own surface reads the owner-scoped `reports` row; the public alert detail reads through the **public projection** (`alerts_feed` / the read model), which omits `author_id` entirely. The public surface never has an author id to hide — it simply has no author field.
- **The layout is derived, not invented.** The alert card supplies the area line, the category line, the relative time, and the accent; unit `004`'s report-detail pattern supplies the media block and the full description. No new token is introduced.
- **The media uses a short-lived signed URL.** Unit `004`'s report-media path issues the signed URL; the bucket stays private and the URL is held in memory for the life of the screen, never written to storage and never sent anywhere else.
- **The category renders as the Bangla / English pair** — **চুরি — Theft** — from the shared category labels, exactly as the feed card renders it. A `null` category shows the neutral **uncategorized** placeholder and never an invented category.
- **The times are both shown.** The relative time (**5 min ago**) is the same localised formatter the feed uses, derived from `captured_at`; the **absolute capture time** is the exact local timestamp, so a reader can place the event precisely. Neither is derived from `created_at` in place of `captured_at`.
- **The flag action is the same component, not a copy.** The detail surface opens the same flag bottom sheet `004-flag-an-alert` owns, with the same reason radios, the same optional note, the same **রিপোর্ট পাঠান** / **বাতিল** actions, the same **রিপোর্ট পাঠানো হয়েছে — ধন্যবাদ** toast, and the same `CONFLICT` / `FLAG_RATE_LIMIT` mapping. A shared-component test asserts both entry points render the same sheet.
- **The `report_hidden` response invalidates the feed and the detail.** When the flag on this detail triggers the 3-flag threshold, the client invalidates the feed query so the card leaves the feed, and the detail screen shows the "no longer available" state.
- **The author never appears, but the author is not erased.** `reports.author_id` remains server-side for moderation; the public surface simply has no field to render. A negative test asserts that no detail response body contains `author_id`.
- **The screen is a civic-information surface.** It never presents a citizen report as a verified incident and never claims the app notified, dispatched, or escalated anything to an authority (C-6).
- **Accessibility.** The flag action and every other control are ≥ 48 × 48 dp with accessibility labels; the media carries a descriptive label; the screen reader announces the category and the capture time.
- **i18n is a hard requirement.** Every string — the title, the labels, the time format, the unavailable state, the media placeholder — ships in `bn` (primary, native-speaker reviewed) and `en`.
- **Testing.** A Jest test asserts the detail renders the media, the description, the area, the category pair, both times, and the flag action, and that no author field exists in the rendered tree. A Supabase-local test asserts the detail read path returns no `author_id`. A Maestro flow covers: open Home → the feed renders → tap **✎ বিস্তারিত দেখুন** → the detail opens → tap the flag action → the sheet opens.

## Dependencies

### Requires
- `001-alerts-feed-list` — the alert card and its **✎ বিস্তারিত দেখুন** link (`data-nav="21a"`) that opens this surface
- `004-flag-an-alert` — the flag bottom sheet and the error mapping this surface's flag action reuses
- Unit `001-foundation` — the design tokens, the shared UI primitives, the Expo Router route, and the `bn` / `en` i18n bundles
- Unit `004-capture` — the report-media signed-URL path and the report-detail layout pattern this surface is derived from
- Unit `002-identity` — the session that scopes the flag write from this surface

### Enables
- Unit `007-moderation` — the moderator's read of the same report content in the staff console

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The report is `public_visibility = 'anonymous'` | No author identity of any kind is rendered — the surface has no author field at all |
| The report is `public_visibility = 'identified'` | No raw `author_id` is returned or rendered; a display alias may appear if the projection provides one |
| The report has no media | The media block is omitted — no broken image frame, no empty placeholder box; the description, area, category, and times still render |
| The report has no description | The description block is omitted — no empty gap and no empty string |
| The report has no category | The neutral **uncategorized** placeholder renders; the category is never invented |
| The signed URL has expired by the time the screen renders | The media shows a graceful placeholder and the rest of the screen is unaffected; the app requests a fresh signed URL at most once |
| The report was hidden or removed after the feed page was cached | The detail shows the "no longer available" state and renders no report content |
| The user is offline | The screen renders from the cached feed item where possible and shows an offline indication; it never crashes |
| The user has already flagged this report | The flag action shows the "already reported" state (the `CONFLICT` path), and the submit control does not re-count the flag |
| The user has exhausted the 10-flag hourly budget | The flag action shows the rate-limit message with `details.retry_after_sec`; no flag row is written |
| The flag on this detail triggers the 3-flag threshold | The feed query is invalidated so the card leaves the feed, and the detail screen shows the "no longer available" state |
| The user presses the system back button | The app returns to the feed (or the map) the detail was opened from; the detail screen is not a terminal destination |
| The report's `captured_at` is in the future because of a device clock skew | The relative time renders from the server timestamp without producing a nonsensical "in the future" string, and the absolute time shows the server value |

## Out of Scope

- The alert card and the feed projection — `001-alerts-feed-list`
- The flag sheet's own behaviour, the 3-flag threshold, the rate limit, and the author auto-hide — `004-flag-an-alert` and `005-author-auto-hide`
- The **author's own** report detail and the author-only category edit behind the prototype's `21a` — unit `004`; this is the **public** alert detail
- The report-media upload, the storage bucket, and the signed-URL issuance — unit `004`; this story only consumes the signed URL
- Showing the author, the author's profile, or any public author identity — forbidden
- A comment thread, reactions, "helpful" votes, sharing, or any social feature
- A map of the single report on the detail screen, and directions / navigation to the incident
- Any copy claiming the report was verified, reviewed, forwarded, or dispatched to an authority — forbidden by C-6
- Editing the category, the description, the media, or the visibility from this surface — only the author may edit their own report, and only the category
