# Design and quality review — 15 November 2026

Status: **plan approved with the recommendations in section 8. Phases 1, 2 and 3 and C5 are implemented (15 November 2026, not yet committed); everything else is still open.**

Done so far: C1 to C4, C5, H20, M42 and M43 (phase 1), H1 to H7, H9, H10, M17 and M19 (phase 2), and H11 to H14, H16 to H22, H24 to H28, M1 to M7, M12 to M16, M20 to M22, M26, M31, M32, M34, M35 and M38 to M41 (phase 3). M27 (hotline 16247) is skipped until the service is confirmed. Decision 3 was applied: the three emergency contacts are recommended, with Skip for now. Decision 4 was applied: signing out keeps a user's unsent reports for them instead of deleting them. Decisions 1 to 3 and 5 to 7 were approved as recommended but belong to later phases, so no code for them has been written. Decision 7 (hotline 16247) still needs a check against the official source.

## 1. Summary

The review covered the mobile app (all 31 screens and the shared components) and the moderator web console. It found 5 critical problems, 47 high-priority problems, 73 medium ones and 20 low-priority items.

The critical problems are all about data safety, not appearance:

- A report waiting to upload can be sent under a different account if someone else signs in on the same phone.
- The next person to sign in can briefly see the previous person's contacts and reports.
- "Log out" deletes unsent reports on a single tap, with no confirmation.
- Unsent reports can get stuck on the phone and never be sent.
- A signed-out moderator who opens the web console reaches a page with no way to sign in.

All automated checks pass (section 3), so none of these problems is caught by the existing tests.

The plan in section 9 groups the work into seven phases, about 34 working days for one developer. Section 8 lists eight decisions that are needed before some of the phases can start.

## 2. Scope and method

**Reviewed**

| Area | What |
|---|---|
| Mobile app | `apps/mobile`: 16 sign-in and onboarding screens, 15 signed-in screens, 45 shared components, the theme, and the auth, data and device logic under `src/shared` |
| Web console | `apps/admin`: sign-in, queue, report detail, users, audit log |
| Backend | Only where the app and the server must agree (`finalize-capture`, storage rules) |

**How**

- Six independent code reviews ran in parallel: sign-in and onboarding; feed, capture and history; help, contacts and settings; design-system consistency; the web console; and a logic bug hunt.
- Every probe, the SQL tests, the mobile and web unit tests and the type checks were run against the local Supabase stack.
- I re-checked the five critical findings and several high ones against the code myself.

**Limits**

- Nothing was run on a phone or in a browser. Layout, keyboard and screen-reader findings that can only be settled on a device are marked **(device)**. Section 10 is the device test list.
- Findings marked **(likely)** depend on runtime behaviour that the code alone does not prove.
- Bangla wording was checked only where a finding mentions it. It still needs a native-speaker review.

**Reading the tables**

- Paths are relative to `apps/mobile` unless they start with `apps/admin`, `packages` or `supabase`.
- Effort: **S** is under an hour, **M** is about half a day, **L** is more than a day.

## 3. Functional test results

| Check | Result |
|---|---|
| Mobile unit tests | 906 of 906 pass (68 suites) |
| Web console unit tests | 144 of 144 pass (11 suites) |
| SQL tests | 476 of 476 pass |
| Probes: account deletion, alternate phone, biometric gate, capture submit, contacts, disabled-account writes, dual-identifier login, moderation console, password reset, public alert, report category, signup, server-side write | All pass (245 checks) |
| Edge Function smoke test | 36 of 36 pass |
| REST smoke test | 11 of 11 pass |
| Type checks (mobile, web console, Edge Functions) | Clean |
| `tools/check-i18n-keys.cjs` | Fails on `some.key`. False alarm: the string is in a comment in `src/__tests__/hardcodedStrings.test.ts:383`. The checker should skip comments. |

## 4. Critical findings

### C1. An unsent report can be uploaded under another account

- **Where:** `src/shared/services/uploadQueue.ts:29`, `src/shared/services/submitCapture.ts:84`
- **Problem:** A queued report does not record who created it. The queue is cleared only by the Log out button. If the session ends another way (session expiry, a failed token refresh, or the biometric screen's "use password" path) and a different person signs in, the queue sends the first person's photo, description and location as the second person's report.
- **Fix:** Store the author's id with each queued report. Before sending, skip any report whose author is not the signed-in user. Also clear or hold the queue whenever the signed-in user changes.
- **Effort:** M

### C2. The next user can see the previous user's data

- **Where:** `app/_layout.tsx:24`; query keys in `src/shared/api/contacts.ts:35`, `history.ts:138`, `reportDetail.ts:168`
- **Problem:** The data cache is never cleared on sign-out, and the cache keys for contacts, history and report detail do not include the user. A second user who signs in within five minutes first sees the previous user's contacts and reports. If the refresh fails (offline), that data stays on screen.
- **Fix:** Clear the cache when the user signs out or the signed-in user changes.
- **Effort:** S

### C3. Signing out deletes unsent reports without asking

- **Where:** `app/(app)/settings.tsx:294-308` and `:131`, `src/shared/auth/authService.ts:234`, `src/shared/auth/useSignOut.ts:28-39`, `app/(auth)/account-disabled.tsx:50,70`, `app/(auth)/account-deleted.tsx:72`
- **Problem:** One tap on "Log out" signs out and deletes every queued report and its photo or video. The warning appears afterwards. When the phone is offline the sign-out call returns an error, so even that warning is skipped. Deleting the account and the sign-out buttons on the disabled and deleted screens delete the queue with no warning at all.
- **Fix:** Ask for confirmation first, and state how many unsent reports will be lost. Treat an offline sign-out as successful. With C1 in place, the better option is to keep the queue for its owner instead of deleting it (decision 4).
- **Effort:** S

### C4. Unsent reports can be stranded and never sent

| | Where | Problem | Fix | Effort |
|---|---|---|---|---|
| a | `app/(app)/capture.tsx:144` | The queue is sent only while the Capture screen is open. A report queued offline is not sent when the network returns unless the user opens Capture again. | Run the queue sender from the signed-in layout, so it works on every screen. | S |
| b | `src/shared/services/queueDrain.ts:89`, `uploadQueue.ts` | An attempt is counted even when the phone is offline. After three attempts the report is marked "saved on device" and is never tried again; no button retries it. | Do not count an attempt while offline. Add a "Send now" action for saved reports, or keep retrying on a long delay. | M |
| c | `src/shared/services/submitCapture.ts:102-106`, storage rules in `supabase/migrations` | **(likely)** The upload uses "replace if it exists", but the storage rules allow only inserting and reading. If the upload succeeded and the confirmation was lost, every retry is refused, so the report can never complete. | Upload without replace and treat "already exists" as success. One test against local Supabase will confirm this. | S |
| d | `src/shared/services/queueDrain.ts:58` | A queued report whose file is gone uses up its three attempts and then stays in the queue forever, taking one of the 20 places. | Check the file before trying. If it is missing, remove the report and tell the user. | S |
| e | `src/shared/services/uploadQueue.ts` | **(likely)** Two changes to the queue file at the same moment can overwrite each other, which drops a newly queued report. | Make queue changes run one at a time. | S |

### C5. A signed-out moderator cannot reach the sign-in page

- **Where:** `apps/admin/app/moderator-gate.tsx:48-52`, `apps/admin/app/access-only-state.tsx:24-37`
- **Problem:** Opening the console while signed out, or after the session expires, shows "Moderator access only" with no link to sign in and no sign-out button. The moderator has to type `/login` into the address bar.
- **Fix:** Send a signed-out visitor to `/login`. For a signed-in account that is not a moderator, show the message with a "Sign out" button.
- **Effort:** S

## 5. High-priority findings

### 5.1 Emergency help

| ID | Where | Problem | Fix | Effort |
|---|---|---|---|---|
| H1 | `src/shared/services/dialer.ts:17` | **(device)** The app asks Android whether it can open a phone link before dialling. On Android 11 and later that answer is "no" unless the app declares it, and the app does not. In an installed build, tapping 999 may show only the "dial manually" note and never open the dialler. | Open the dialler directly and handle the failure. Test in a development build. | S |
| H2 | `app/(app)/thana-line.tsx:39-42,135-139` | While the location is still loading, or when it is denied, the screen shows a Dhaka police station with a live call button, wherever the user is. | Show no station until the location is known. Until then show 999. | S |
| H3 | `src/shared/ui/WrongNumberSheet.tsx`, `app/(app)/more-help.tsx:117`, `thana-line.tsx:183` | The "Wrong number?" sheet is drawn inside the scrolling page. On the hotline list it appears below the last row, off screen, so the button seems to do nothing. After a report is sent there is no confirmation, and the keyboard covers the text box. | Rebuild it on the shared `BottomSheet`, and confirm with a toast. | M |
| H4 | `app/(app)/help-alert.tsx:126`, `more-help.tsx:107` | When a call cannot be placed, the "dial this number yourself" note appears below the tiles or the 12-row list, off screen. The user sees no response. | Scroll the note into view, or pin it above the list. | S |
| H5 | `app/(app)/thana-line.tsx:141-146` | The "Call now" button is 40 dp wider than the screen area it sits in, so it runs off the right edge. | Move the side spacing to a wrapper. | S |
| H6 | `app/(app)/location-sharing.tsx:474-482` | "Share without location" still asks for location and may share it. It is also enabled when no contact is selected, and then does nothing. | Skip the location step for this button. Disable it with no contact selected. | S |
| H7 | `app/(app)/location-sharing.tsx:248-259` | **(device)** Sharing more than a minute after the screen opened waits for a new GPS position with no time limit. Indoors the button can stay disabled indefinitely. | Wait about 4 seconds, then use the last position. Show "Getting location…" on the button. | S |
| H8 | `app/(app)/location-sharing.tsx:339-413` | **(device)** The fixed parts of the screen need about 600 dp of height. On a small phone the contact list overlaps the Share button. | Shrink the map on short screens and put the list and cards in one scrolling area. | M |

### 5.2 Security and session

| ID | Where | Problem | Fix | Effort |
|---|---|---|---|---|
| H9 | `src/shared/auth/useBiometricGate.ts:58,99`, `app/(app)/_layout.tsx:36-67`, `app/index.tsx:25` | The fingerprint lock is checked only when the app starts. Reopening the app from recent apps does not ask again. When the phone is offline the check fails and the app opens without it. Home also appears for a moment before the lock, or before the "account disabled" screen. | Re-check when the app returns to the foreground. On a failed check, require the password. Show the splash screen until the checks finish. | M |
| H10 | `app/(auth)/reset-password.tsx:145-162`, `src/shared/auth/authService.ts:82` | After a password reset, a user with fingerprint turned on is asked for a fingerprint immediately. Sessions created by sign-up or by a reset have no expiry at all. | Share one "finish sign-in" step between login, sign-up and reset. | S |

### 5.3 Feed, alert detail and history

| ID | Where | Problem | Fix | Effort |
|---|---|---|---|---|
| H11 | `src/shared/api/alerts.ts:170` | Below 20% battery the alert feed cannot load at all: the first load, pull to refresh, Retry and "Load more" all fail, with the message "check your connection". After coming back online, Retry fails for up to 15 seconds. | Apply the battery saver only to the automatic refresh every minute. | S |
| H12 | `app/(app)/alert-detail.tsx:67,134`, `report-detail.tsx:78,173`, `history.tsx:100`, `contacts.tsx:68`, `location-sharing.tsx:73`, `help-alert.tsx:42` | A failed load is shown as if there were no data: "removed by moderation", "report not found", "No reports found", "No contacts saved", "0 saved". None offers a retry. A user may add contacts again that already exist. | Show a "could not load" state with Retry on each screen. | M |
| H13 | `app/(app)/alert-detail.tsx:231-241`, `src/shared/ui/FlagSheet.tsx:54-71`, `app/(app)/home.tsx:238`, `src/shared/ui/AlertCard.tsx:182` | Reporting an alert gives no confirmation. Reopening the sheet shows the old "sent" text. On Home the flag button on every card does nothing. | Confirm with a toast, reset the sheet when it closes, and hide the flag button where it has no action. | S |
| H14 | `app/(app)/report-detail.tsx:276-345` | If saving the incident type fails, the error is shown on the page behind the open sheet. The user taps a type and nothing appears to happen. | Show the error and a progress indicator inside the sheet. | S |
| H15 | `app/(app)/home.tsx:104-218` | **(device)** The greeting, help banner, quick actions and area chips are fixed and take about 400 dp. On a small phone or with large text almost no room is left for the feed. | Let the whole page scroll, keeping only the chip row pinned. | M |

### 5.4 Capture

| ID | Where | Problem | Fix | Effort |
|---|---|---|---|---|
| H16 | `app/(app)/capture.tsx:215-218` | With permission granted but the phone's location switched off, the screen retries the location without end. The card flickers between "Getting your location…" and "unavailable". | Retry only when the permission changes from off to on. | S |
| H17 | `app/(app)/capture.tsx:454-474`, `src/shared/services/permissions.ts:139` | When camera and photo access are denied, both tiles disappear. The screen asks for a photo or video but offers nothing to tap and no way to open Settings. The user cannot send a report. | Show a card with the reason and an "Open Settings" button. | S |
| H18 | `app/(app)/capture.tsx:357-362` | Closing the screen, or the Android back button, discards the photo or video, the description and the chosen area without asking. | Ask before discarding when anything has been entered. | S |
| H19 | `app/(app)/capture.tsx:814-823` | With "Show my name" chosen, the line underneath still says "Your identity stays completely hidden". | Change the line to match the choice. | S |
| H20 | `src/shared/services/captureFlow.ts:148` | **(likely)** A quick double tap on Send can file two reports, because each tap gets its own request id. | Block a second send while one is running, and create the id once per report. | S |
| H21 | `app/(app)/capture.tsx:181-191` | **(device)** On iPhone, the camera or gallery is opened while the chooser sheet is still closing. iOS can silently refuse this, so the tap does nothing. | Open the camera or gallery after the sheet has closed. | S |

### 5.5 Contacts

| ID | Where | Problem | Fix | Effort |
|---|---|---|---|---|
| H22 | `app/(app)/contact-editor.tsx:141-168` | If the contact is created but marking it as primary fails, pressing Save again creates the same contact a second time. | Remember the created contact and continue from there on retry. | S |
| H23 | `app/(app)/contacts.tsx:254-310` | On a 320 dp phone the contact name gets about 34 dp of width and shows as "Ab…". Each row is about 110 dp tall. | Move the star out of the name line and stack the two action buttons. | M |

### 5.6 Sign-in and onboarding

| ID | Where | Problem | Fix | Effort |
|---|---|---|---|---|
| H24 | `src/shared/wizard/ContactCaptureScreen.tsx:390` | A saved emergency contact number is displayed wrongly: +8801712345678 shows as "07123-45678". This is the same bug that was fixed on the Contacts screen. | Correct the digit slicing and add a test. | S |
| H25 | `app/(auth)/login.tsx:63`, `src/shared/i18n/en.ts:35` | A wrong password shows "Please sign in again." | Show "Phone, email or password is incorrect". | S |
| H26 | `app/(auth)/phone.tsx:40,75`, `register.tsx:49,144`, `forgot-password.tsx:125`, `reset-password.tsx:255` | The main button stays grey with no explanation, and the 8-character password rule is not shown. The field error messages exist in the code but can never appear. | Keep the button enabled, check on press, and show a message under the field that is wrong. | M |
| H27 | `src/shared/wizard/ContactCaptureScreen.tsx:249-263`, `app/(auth)/contact-1.tsx:29` | Three emergency contacts are required, with no Skip and no Back on the first one. Closing and reopening the app bypasses the requirement anyway. | Add "Skip for now" and remind the user on Home (decision 3). | S |
| H28 | `app/(auth)/reset-password.tsx:110-118`, `verify-otp.tsx:213-223` | After a wrong or expired code, the user is returned to an empty code field with no message. | Carry the error to the code screen and show it. | S |
| H29 | `src/shared/ui/InputField.tsx:95-147` | **(device)** In every text field the label is drawn on top of the placeholder until the field is focused, for example "Phone or email" over "you@example.com". | Show the placeholder only once the label has moved up. | S |

### 5.7 Appearance and layout

| ID | Where | Problem | Fix | Effort |
|---|---|---|---|---|
| H30 | `src/shared/ui/StatusBanner.tsx:39`, `ManualDialGuidance.tsx:51-81`, `ListRow.tsx:109`, `app/(app)/thana-line.tsx:80-119`, `station-map.tsx:182`, `report-detail.tsx:311`, `src/shared/wizard/ContactCaptureScreen.tsx:273-326`, `app/(auth)/location-permission.tsx:75-107` | In dark mode these draw a pale background with near-white text, so the text cannot be read. This includes the "Saved on device" banner and the manual-dial number. Dark is the default theme. | Add background colours that change with the theme and use them in these places. Follow the phone's light or dark setting by default (decision 2). | M |
| H31 | `src/shared/ui/Button.tsx:128-161` | In dark mode the labels of secondary buttons ("Sign in", "Use password instead", "Sign out") have a contrast of about 2.6:1 against a required 4.5:1. | Use a lighter violet for the label in dark mode. | S |
| H32 | `src/shared/ui/KeyboardScroll.tsx:19-31` and the screens that use it | **(device)** On Android the keyboard can cover the focused field and the main button on login, forgot password, the code screen, reset password, register, Capture and the contact editor. | Use a keyboard-aware scroll view and pin the main button (decision 6). | M |

### 5.8 Web console

| ID | Where (under `apps/admin`) | Problem | Fix | Effort |
|---|---|---|---|---|
| H33 | `app/globals.css:176-188,252` | The side menu is a fixed 232 px and never collapses. At 375 px wide the content area is about 63 px. The console cannot be used on a phone or a small tablet. This is critical if moderators must work on those devices (decision 5). | Below about 900 px, turn the menu into a top bar with a toggle and reduce the padding. | M |
| H34 | `app/queue/queue-client.tsx:128`, `app/audit/audit-client.tsx:82` | When loading fails, "The queue is clear" is shown under the error. A moderator can read a failed load as an empty queue. | Show the empty state only after a successful load, and add "Try again". | S |
| H35 | `app/queue/[reportId]/report-detail-client.tsx:269-272` | After a decision there is no confirmation, no return to the queue, and the report's new status is not shown. | Confirm, return to the queue, and show the status on the page. | M |
| H36 | `app/queue/[reportId]/report-detail-client.tsx:194,280-348` | A report that was already restored or removed still shows a working decision form. | Show the form only for reports that are waiting for review. | S |
| H37 | `app/users/users-client.tsx:45-53`, `lib/queries.ts:185-196` | A failed search shows "No account matched". Typing after a search clears the results and flashes the same message. | Search on the submitted text, and show the error when the search fails. | S |
| H38 | `lib/queries.ts:259-262`, `app/users/users-client.tsx:143` | After "Disable", the account row does not update. The moderator cannot tell it worked and may submit again. | Refresh the row and show a confirmation. | S |
| H39 | `app/users/users-client.tsx:184-208` | Disabling an account takes one click, with no confirmation, and the console has no way to undo it. | Add a confirmation step that names the account, and an "Enable" action. | M |
| H40 | `app/audit/audit-client.tsx:154` | The user links in the audit log open an empty search page. | Read the id from the link and run the search. | S |
| H41 | `app/audit/audit-client.tsx:87`, `app/globals.css:544-576` | The audit table is cut off on narrower windows, with no sideways scroll. | Wrap the table in a scrolling container. | S |
| H42 | `app/globals.css:111-129` | In the default dark theme, links and secondary buttons have a contrast of about 2.4:1, and small grey labels about 3.3 to 3.8:1. | Add lighter text colours for the dark theme. | M |
| H43 | `lib/supabase/server.ts:51-60` | **(browser)** Nothing saves a refreshed session. After about an hour idle, a reload can sign the moderator out and land on the dead end in C5. | Add a middleware that refreshes the session and redirects signed-out requests to `/login`. | M |

## 6. Medium and low-priority findings

### 6.1 Mobile: feed, history and media

| ID | Where | Problem | Fix | Effort |
|---|---|---|---|---|
| M1 | `src/shared/api/alertDetail.ts:216`, `reportDetail.ts:241` | Media links last 10 minutes and are not renewed. Opening a photo or video after that shows a blank screen. | Request a new link when the viewer opens. | S |
| M2 | `app/(app)/history.tsx:100-118` | History loads only the newest 50 reports. In a busy area the user's own reports can be missing, and the totals disagree with the list. | Load further pages, or load the user's own reports separately. | M |
| M3 | `src/shared/api/reportDetail.ts:224` | After changing an incident type or sending a report, History and the feed keep showing the old data for up to a minute. | Refresh those lists after the change. | S |
| M4 | `app/(app)/history.tsx:97-99`, `history-map.tsx:57-65` | With no location, distances are measured from central Dhaka and the map shows a "you are here" dot there. Distances over a kilometre print as "4200 m". | Hide the distance and the dot without a real position. Show kilometres. | S |
| M5 | `app/(app)/history-map.tsx:120-147`, `src/shared/ui/TileMapFallback.tsx:55-148` | The map says "tiles are unreachable" whenever there are no reports, including while loading. The notice never clears once shown, and it covers the "Use my location" button on Location sharing. | Show the notice only on a real tile failure and clear it on recovery. | S |
| M6 | `app/(app)/home.tsx:231-282` | Home loads every page of the feed, and "See all" appears only after the last one. Each card makes its own extra request for media. | Limit Home to about five cards and put "See all" in the section header. | S |
| M7 | `app/(app)/home.tsx:224`, `alerts.tsx:109` | **(device)** The pull-to-refresh spinner appears on every automatic refresh, once a minute. | Show it only for a refresh the user started. | S |
| M8 | `src/shared/ui/MediaViewer.tsx:79-143` | The viewer has no previous and next buttons, so screen-reader users cannot move between items. Android cannot zoom. A photo that fails to load leaves a black screen. | Add the buttons, zoom on both platforms, and loading and error states. | M |
| M9 | `src/shared/ui/AlertCard.tsx:89-93,243-270` | **(device)** On iPhone the screen reader probably cannot reach the photo button inside a card. | Place the media button beside the card body, not inside it. | S |
| M10 | `app/(app)/history.tsx:120-127`, `src/shared/ui/SegmentedTabs.tsx:68-86` | Four tabs do not fit on a 320 dp screen; "Distribution" breaks or is cut. | Make the tab row scroll sideways. | M |
| M11 | `src/shared/ui/HistoryFilterSheet.tsx:79-142`, `FlagSheet.tsx:98-118` | In the filter sheet, Apply sits below about 11 rows and is off screen. In the flag sheet, the buttons can be cut off on short phones. | Pin the buttons below the scrolling list. | S |

### 6.2 Mobile: capture

| ID | Where | Problem | Fix | Effort |
|---|---|---|---|---|
| M12 | `app/(app)/capture.tsx:231-256` | Send shows "Getting your location…" for up to 15 seconds with no way to send without it. | Add "Send without location" and shorten the wait. | S |
| M13 | `app/(app)/capture.tsx:1394` | When a photo or video cannot be prepared, the message is "Could not send — saved on your phone instead". Nothing was sent or saved. | Use a separate "Couldn't use that file, try another" message. | S |
| M14 | `app/(app)/capture.tsx:871-883` | The area list is empty while loading or after a failure, with no message. Offline with location denied, the user cannot pick an area and cannot send. | Show loading, error with Retry, and a list stored in the app. | S |
| M15 | `app/(app)/capture.tsx:323-325` | **(device)** If the user denies location in the system prompt, the screen stays in automatic mode and the report is filed with no position. | Treat the denial as "choose an area". | S |
| M16 | `src/shared/services/mediaSources.ts:61` | **(likely)** On a low-memory Android phone the app can be closed while the camera is open, and the recording is lost. | Recover the pending result when Capture opens. | M |

### 6.3 Mobile: help, contacts and maps

| ID | Where | Problem | Fix | Effort |
|---|---|---|---|---|
| M17 | `src/shared/ui/MoreHelpSheet.tsx:83-255` | Tapping a hotline's name or number opens the list; only the small icon dials. The Android back button leaves the screen without closing the sheet, and the Close button sits under the gesture bar. | Make the row dial. Rebuild on `BottomSheet` together with H3. | M |
| M18 | `app/(app)/station-map.tsx:99-258` | After choosing a station from the list, its details appear at the top of the list, often scrolled out of view, and the map does not move. | Show the details in a fixed card and centre the map on the station. | M |
| M19 | `app/(app)/contacts.tsx:302` | The call button on a contact has no error handling. On a device with no dialler nothing happens. | Use the same call path as the help screens. | S |
| M20 | `app/(app)/contact-editor.tsx:70-218` | A wrong name and a wrong phone number show the same message. The edit form is blank and can be saved before the contact loads. "Next" on the keyboard does not move to the next field, and the phone suggests the user's own number. | Use a message per field, a loading state, field-to-field focus, and turn off autofill. | M |
| M21 | `app/(app)/location-sharing.tsx:109-136,584` | With "share with all primaries" on, no contact shows as ticked, and the first tap on one changes nothing. | Derive the ticks from who will receive the share. | S |
| M22 | `src/shared/api/contacts.ts:245-322` | Changing the primary contact can fail halfway and leave none. A delete that succeeds can still show an error and leave the row on screen. | Do the primary change in one database call. Always refresh the list after a delete. | M |
| M23 | `src/shared/ui/TileMapFallback.tsx:99-111`, `StationMap.tsx:224,312` | Map pins have no name for screen readers and are 16 dp, far under the 48 dp touch size. | Add the station name as the label and enlarge the touch area. | S |
| M24 | `app/(app)/help-alert.tsx:115-121` | The "Personal contacts" tile has a call icon but only opens the list. The introduction promises a call to primary contacts that does not exist. | Use an arrow icon, or add a "Call primary contact" action. | M |
| M25 | `app/(app)/help-alert.tsx:242`, `src/shared/ui/ListRow.tsx:51`, `more-help.tsx:63` | **(device)** Titles are limited to one line, so long Bangla hotline and station names are cut off. | Allow two lines. | S |
| M26 | `app/(app)/location-sharing.tsx:285-297,601` | Typing coordinates with Bangla digits or a comma is rejected with a "range" message, shown under the wrong field. | Accept both, and show the error on the field that failed. | S |
| M27 | `packages/shared/src/data/hotlines.json:117-123` | Hotline 16247 is "NARC Control Room" in English and "BRTA control room" in Bangla. The two languages name different services (decision 7). | Confirm the service and correct both names. | S |

### 6.4 Mobile: sign-in and onboarding

| ID | Where | Problem | Fix | Effort |
|---|---|---|---|---|
| M28 | `src/shared/ui/InputField.tsx`, `KeyboardScroll.tsx:24` | The "Next" key closes the keyboard instead of moving to the next field. On iPhone the number pad cannot be closed except by tapping outside. | Chain the fields, and close the keyboard on scroll. | M |
| M30 | `src/shared/ui/WizardScreen.tsx:79`, `app/(auth)/welcome.tsx`, `login.tsx`, `verify-otp.tsx`, `app/(app)/capture.tsx:956` and others | Several text colours are below 4.5:1: links, grey secondary text in dark mode, and the amber cooldown banner. | Use the theme's muted-text colour for secondary text and add themed link colours. | M |
| M31 | `app/(auth)/reset-password.tsx:80-84`, `src/shared/navigation/useSafeRouter.ts:26` | If the app is restored on the new-password screen, the redirect back is swallowed and the user is left with a disabled button and no message. | Let that redirect through. | S |
| M32 | `src/shared/i18n/en.ts:57,99`, `app/(auth)/phone.tsx:68,124`, `welcome.tsx:70` | Four wording errors: a promise to send a code when none is sent; "Help is one tap away" beside a lock icon; "Tap what you need" above a list of steps; "valid for 9 minutes 59 more." | Add the correct strings. | S |
| M33 | `app/(auth)/welcome.tsx:85-107`, `login.tsx:189` | Wrapped subtitles are left-aligned under a centred badge, and side padding is applied twice. | Centre the text and remove the extra padding. | S |
| M34 | `app/(auth)/verify-otp.tsx:98-191` | The code countdown restarts at 10:00 each time the screen opens. When it reaches zero it just disappears. Resend gives no feedback. | Keep the real time, show "expired", and confirm a resend. | S |
| M35 | `app/(auth)/forgot-password.tsx:62-77`, `src/shared/auth/passwordResetService.ts:64` | When sending is rate-limited, the user cannot enter a code they already have. Requests have no time limit. Offline shows "Something went wrong". | Add "I already have a code", a 15-second limit, and the offline message. | M |
| M36 | `src/shared/wizard/ContactCaptureScreen.tsx:232`, `app/(auth)/register.tsx:133-216` | The step counter reads 1, 2, 3, 2, 2, 2, 4. "Create account" jumps to step 3. Register asks again for the phone, email and password already entered. | Calculate the step numbers and use one entry path. | M |
| M37 | `src/shared/ui/InputField.tsx:112-160`, `app/(auth)/login.tsx:86-134` and others | For screen readers: labels are read twice, errors are not announced on iPhone, titles are not marked as headings. | Hide the duplicate label, announce errors, and mark headings. | M |
| M38 | `app/(auth)/login.tsx:68-173` | Login has no back button. Its error banner is at the top and can be off screen when the user taps Sign in. | Add back, and scroll to the error. | S |
| M39 | `app/(auth)/biometric-gate.tsx:100-223` | "Attempts left" counts the wrong way. The screen says "fingerprint" on phones that use face unlock. | Show the true number remaining and match the wording to the phone. | S |
| M40 | `app/(auth)/register.tsx:47-66` | A blank name gives a general error with no field marked. An email already in use shows "That conflicts with the current state." | Check each field, and add "This email is already registered" with a Sign in link. | M |
| M41 | `packages/shared/src/schemas/index.ts:11-18`, `app/(auth)/verify-otp.tsx:242` | **(device)** Bangla digits typed into phone or code fields are dropped or rejected, although the Bangla label shows them. | Convert Bangla digits as they are typed. | S |
| M42 | `src/shared/api/session-storage.ts:541` | The 24-hour session without "Remember me" restarts on every token refresh, so it can last for days. | Keep the original sign-in time. | S |
| M43 | `src/shared/api/session-storage.ts:492` | **(likely)** When the session window ends during use, the app stays on signed-in screens showing empty lists, with no return to login. | Sign the user out when the window ends. | S |

### 6.5 Mobile: layout, fonts and consistency

| ID | Where | Problem | Fix | Effort |
|---|---|---|---|---|
| M44 | `app.json:18`, `src/shared/ui/Screen.tsx`, `WizardScreen.tsx:55` | **(device)** The app is marked as supporting iPad, but no screen limits its width, so fields, buttons and cards stretch across the tablet (decision 1). | Either turn off iPad support or centre the content at about 560 dp. | S |
| M45 | `src/shared/ui/InputField.tsx:117,170`, `Button.tsx:169-177`, `QuickActionRow.tsx:75`, `app/(app)/capture.tsx:1506` | **(device)** With large system text or on narrow phones: text fields clip at about 130% text size, button labels have double side padding, and quick-action and capture tiles cut off Bangla labels. | Use minimum heights, remove the extra padding, and allow more lines. | M |
| M46 | `app/(auth)/*`, `src/shared/ui/WizardScreen.tsx`, `InputField.tsx`, `Button.tsx`, `BottomSheet.tsx`, `EmptyState.tsx`, `StatusBanner.tsx`, `app/(app)/alert-detail.tsx`, `report-detail.tsx`, `history.tsx`, `alerts.tsx` | Many texts set a weight but not the app font, so they fall back to the phone's own font. The sign-in screens do not use the app fonts at all. Bangla titles have tight line spacing that can cut vowel marks **(device)**. | Route text through one component that sets the font, and loosen line spacing for Bangla. | M |
| M47 | `src/shared/ui/StatusBanner.tsx:60`, `HistoryFilterSheet.tsx:150` | Side spacing is applied twice, so banners on Capture and the History filter content are narrower than everything around them. | Remove the extra spacing. | S |

### 6.6 Web console

| ID | Where (under `apps/admin`) | Problem | Fix | Effort |
|---|---|---|---|---|
| M48 | `app/queue/[reportId]/report-detail-client.tsx:241-346` | **(browser)** "Restore" is selected by default, neither decision asks for confirmation, and Enter on a radio button can submit. | Start with nothing selected and add a confirmation. | M |
| M49 | `app/users/users-client.tsx:33-54`, `lib/queries.ts:289` | On the Users page and when saving a decision, an expired session shows "Please sign in again." with no link. | Handle an expired session in one place and go to `/login`. | S |
| M50 | `app/login/page.tsx:45-48` | A wrong password shows "Please sign in again." Signing in always opens the queue, so a link to a specific report is lost. | Show "Email or password is incorrect" and return to the requested page. | S |
| M51 | `lib/supabase/server.ts:76-88` | A temporary network or database failure tells a real moderator "This account has no moderation permission". | Show "Could not verify access" with a retry. | S |
| M52 | `app/queue/queue-client.tsx:83-154` | The "Author auto-hidden" filter only searches the 20 reports already loaded, and says none exist when later pages have not been checked. | Filter on the server. | M |
| M53 | `app/providers.tsx:34`, `app/queue/queue-client.tsx` | The queue never updates on its own and has no refresh button, sort or search. | Add Refresh, a one-minute automatic refresh, sort and search. | M |
| M54 | `app/queue/[reportId]/media-preview.tsx:36-116` | **(browser)** The media link expires after 10 minutes, and a video then shows "Media unavailable". While the link loads, the same message is shown. The page jumps when the image appears. | Renew the link before it expires, add a loading state, and reserve the image's space. | M |
| M55 | `app/admin-shell.tsx:39-78`, `app/queue/queue-client.tsx:187`, `report-detail-client.tsx:249` | Keyboard and screen-reader gaps: no "skip to content" link; each queue row is read only as "category – area"; a disabled Submit does not say a note is required. | Add the skip link, let the row's content be read, and show "Note required". | S |
| M56 | `app/admin-shell.tsx:150`, `app/layout.tsx:23`, `app/globals.css:268` | A light theme exists but can never be selected, and one colour it needs is undefined. | Remove it, or add a switch and define the colour. | S |
| M57 | `app/queue/queue-client.tsx:173`, `lib/format.ts:53`, `lib/api.ts:40` | The queue list hides the reporter's phone and email on screen, but the full values are still sent to the browser. The full name is shown even when the reporter chose to be anonymous. | Send only the masked value in the list, and respect the anonymity choice. | M |
| M58 | `lib/format.ts:247-267` | Audit times are in UTC with no year and no label. Moderators in Bangladesh can misread them by six hours. | Show Dhaka time with the year. | S |
| M59 | `app/globals.css:457-502` | Amber and red text on their pale backgrounds, and the hover state of the red button, are below 4.5:1. | Use darker text and a darker hover. | S |
| M60 | `apps/admin/app` (no `loading.tsx` or `error.tsx`), `app/providers.tsx:31` | Every page change waits with no loading sign, and errors show the framework's default page. After sign-out, queue data including reporters' contact details stays in memory. | Add loading and error pages, and clear the cache on sign-out. | M |

### 6.7 Low priority

| ID | Where | Problem | Fix | Effort |
|---|---|---|---|---|
| L1 | `src/shared/ui/AlertCard.tsx:47`, `app/(app)/alert-detail.tsx:187`, `report-detail.tsx:241`, `history.tsx:376` | The same incident type uses different icon styles and sizes on different screens. History shows the icon twice per row. | Use one category icon component. | M |
| L2 | `app/(app)/capture.tsx:357-1300`, `report-detail.tsx:313`, text links in `app/(auth)/*` | Several buttons and links show no change when pressed. | Add one shared pressed style. | S |
| L3 | `src/shared/ui/AlertFeedSkeleton.tsx:56` | The loading placeholder has a different shape from the real card, so the page shifts when data arrives. | Match the placeholder to the card. | S |
| L4 | `src/shared/ui/MediaStrip.tsx:83` | Media tiles are a fixed 104 dp: two per row with a gap on a 360 dp phone, and a single photo looks small. | Size the tiles from the screen width. | S |
| L5 | `app/(app)/alert-detail.tsx:138`, `report-detail.tsx:177` | Error and empty messages sit at the top of the screen instead of the centre. | Centre them. | S |
| L6 | `src/shared/i18n/en.ts:372`, `bn.ts:364,426`, `app/(app)/history.tsx:201` | "✎ See details" reads as "edit". The Bangla tab for "Reports" says "type". "Total reports" appears twice in a row. | Correct the three strings. | S |
| L7 | `app/(app)/capture.tsx:496`, distances, media counter, filter chips | In Bangla some numbers still use English digits. The video progress is announced to screen readers at every step. | Use one number formatter, and announce progress less often. | S |
| L9 | `app/_layout.tsx:100`, `app/showcase.tsx` | The component showcase can be opened in a release build with `nagarshield://showcase`, without an account. | Register it only in development builds. | S |
| L10 | `src/shared/api/areas.ts:109` | In Bangla a thana can be shown with the name of the first area inside it, for example "Mirpur" as "মিরপুর ১০". | Translate a thana only from an exact match. | S |
| L11 | `app/(auth)/phone.tsx:113`, `register.tsx:206`, `alternate-phone.tsx:115` | iPhone does not offer a strong password at sign-up, and the phone suggests the user's own number for the alternate number. | Correct the autofill hints. | S |
| L12 | `app/(auth)/account-disabled.tsx:105`, `account-deleted.tsx:119` | "Contact support" gives no way to do so. The last day of the recovery period reads "0 more days". | Add a contact method and fix the day count. | S |
| L13 | `app/(auth)/*` | There is no language switch before sign-in; the language follows the phone. No show-password button. | Add both. | M |
| L14 | `apps/admin/app/layout.tsx:15`, `app/globals.css:143` | Every console page has the same tab title, there is no icon, and the named fonts are never loaded. | Add page titles, an icon and the fonts. | S |
| L15 | `apps/admin` inline styles | Spacing and text sizes are written per page (card padding 14, 16, 20 and 28). | Add spacing and text-size variables and shared classes. | M |
| L16 | `tools/check-i18n-keys.cjs` | Reports a key found in a comment as missing. | Skip comments. | S |

## 7. Design-system findings

These come from a review of the theme, the 45 shared components and a search of every screen. Contrast ratios are calculated from the colour values in `src/shared/theme/tokens.ts`; the requirement is 4.5:1 for text and 3:1 for icons and control outlines.

**The design scale is defined but almost unused.** Across the screens, `theme.spacing` is used 0 times, `theme.shadows` 0 times, the line-height scale 0 times and `theme.radius` 0 times (10 shared components use it). Sizes are written as plain numbers. Part of this is deliberate: the tap-target test reads those numbers, so any clean-up must update that test too.

| ID | Priority | Where | Problem | Fix | Effort |
|---|---|---|---|---|---|
| D1 | High | `src/shared/theme/tokens.ts:58-67`, `src/shared/ui/Button.tsx:92-123`, `Card.tsx:58-67`, `app/(app)/help-alert.tsx:206-213` | White text on gradients that are too light: main button 2.7:1, emergency red 2.8 to 3.8:1, amber help tile 2.2 to 3.2:1, green help tile 2.5 to 3.8:1. The help-tile subtitles are 1.8 to 2.4:1. | Darken every gradient stop to at least 4.5:1 against white, and make the subtitles fully white. | M |
| D2 | High | `ink[500]` as text: 113 uses in 44 files. `violet[700]` as text or link: 41 uses. `src/shared/ui/InputField.tsx:99-159`, `ListRow.tsx:68`, `EmptyState.tsx:41` | In dark mode, grey secondary text is 3.3 to 3.8:1, violet links and secondary button labels are 2.4 to 2.7:1, and red error text is 3.5 to 4.0:1. The correct muted-text colour exists but is used only 10 times. This widens H31 and M30. | Use the muted-text colour for all secondary text. Add link and error colours that change with the theme. | M |
| D3 | High | `appFont` is used only in `app/(app)/home.tsx`, `capture.tsx`, `src/shared/ui/AlertCard.tsx`, `QuickActionRow.tsx` | The app loads Inter and Noto Sans Bengali, but only four files use them. Every other screen and component shows the phone's own font, so Home looks different from the rest of the app. This widens M46. | Add one text component that applies the app font, and move the shared components to it first, then the screens. | L |
| D4 | High | `src/shared/ui/InputField.tsx:169-175`, `AreaChipRow.tsx:149`, `Card.tsx:137-143`, `AppBar.tsx:81-92`, `ListRow.tsx:51-53` | **(device)** Nothing in the app allows for large system text. Fixed heights hold text that grows: text fields (56), area chips (36), help tiles (80). Screen and row titles are limited to one line. This widens M45. | Use minimum heights, allow two lines on titles, and limit scaling only on chips, tabs and badges. | M |
| D5 | Medium | `src/shared/ui/AppBar.tsx:47-92`, `app/(app)/help-alert.tsx:57-86`, `capture.tsx:1414-1430` | Three different screen headers: back button 40, 48 and 44 dp; title 17 and 18 px; side spacing 16 and 20. | Extend the shared header to cover all three and remove the two custom ones. | M |
| D6 | Medium | `src/shared/ui/Screen.tsx:100-104`, `WizardScreen.tsx:250-254`, `StickyFooter.tsx:42-49`, `app/(auth)/login.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `verify-otp.tsx` | Three different containers for the bottom button, each with its own spacing. `StickyFooter` is not used by any screen. Four sign-in screens put the button in the scrolling content instead of pinning it. | Keep one pinned footer and use it everywhere. | M |
| D7 | Medium | All screens | Side spacing is 20 on most signed-in screens, 24 on sign-in screens and the contact editor, and mixed within Settings (16 and 20) and Contacts (20 and 24). The token for it is used by no screen. | Use the token, and add a second one if 24 is intended for forms. | M |
| D8 | Medium | `src/shared/theme/tokens.ts:69-136`, all screens | Values that are not on the scale are common: corner radius 12 (27 uses) and 16 (22 uses); text sizes 16, 17, 22, 28, 32 and fractions such as 12.5; spacing 10 and 14. `capture.tsx` alone has 67 such numbers. | Add the values that are really in use to the scale, replace the numbers, and add a lint rule to keep it that way. | L |
| D9 | Medium | `src/shared/ui/Card.tsx` (18 colours), `app/(app)/help-alert.tsx` (11), `location-sharing.tsx:677-775` (10), `HelpBanner.tsx`, `ContactAvatar.tsx`, `AppBar.tsx:9` | Colours written directly in components. Some copy values that already exist in the theme. The map placeholder on Location sharing does not change with the theme. | Take them from the theme. | M |
| D10 | Medium | `app/(auth)/login.tsx:85`, `forgot-password.tsx:93`, `register.tsx:152`, `reset-password.tsx:208`, `verify-otp.tsx:214`, `app/(app)/contact-editor.tsx:181`, `src/shared/wizard/ContactCaptureScreen.tsx:370` | The same error banner is copied into seven files. Its text is 4.4:1 in light mode, and in dark mode it is a bright pink block. Other screens style errors differently again. | Build one shared error banner with themed colours. | M |
| D11 | Medium | `src/shared/ui/Toggle.tsx:44`, `InputField.tsx:68,90`, `RadioGroup.tsx:34`, `ListRow.tsx:94` | Control outlines are too faint: the "off" track of a switch is 1.1 to 1.3:1, the text-field border 1.3 to 1.7:1, the empty radio ring 1.3 to 2.0:1, and grey icons 2.0 to 3.0:1. | Add one outline colour that reaches 3:1 on every background. | S |
| D12 | Medium | `src/shared/ui/ManualDialGuidance.tsx:67`, `app/(app)/contacts.tsx:173`, `app/(auth)/verify-otp.tsx:226`, `src/shared/ui/ContactAvatar.tsx:82` | Amber text on pale amber is 3.1:1, including the emergency number in the manual-dial note. Green initials on pale green are 3.3:1. | Use the darker amber and green. | S |
| D13 | Medium | `src/shared/ui/Icon.tsx:44-55` | Icons grow with the system text size and overflow their buttons. | Stop icons from scaling. | S |
| D14 | Medium | `src/shared/ui/AppBar.tsx:81`, `SectionTitle.tsx:26`, `BottomSheet.tsx:80`, `WizardScreen.tsx:99` | No title in the app is marked as a heading for screen readers. | Mark the four title components as headings. | S |
| D15 | Medium | `src/shared/ui/Button.tsx:10-79` | The button has no loading state. More than 12 submit buttons change their label by hand, each in its own way, and none tells a screen reader it is busy. | Add a loading option to the button. | S |
| D16 | Medium | `src/shared/ui/SectionTitle.tsx:25`, `ListRowGroup.tsx:104`, `app/(app)/contacts.tsx:358`, `settings.tsx:452` | Section titles come in three styles. The 11 px upper-case style with wide letter spacing can break Bangla letter joins **(device)**. | Use the shared section title, with a small variant that has no upper case or letter spacing. | S |
| D17 | Medium | `app/(app)/thana-line.tsx:236`, `contacts.tsx:439`, `history-map.tsx:165` | These three screens build their own loading and empty messages instead of the shared one. | Use the shared component. | S |
| D18 | Medium | `src/shared/ui/Card.tsx:28-39`, `surface.ts:17-22` | Three shadow definitions exist, so cards on one screen can differ. None is visible in dark mode. | Use one, with a thin border in dark mode. | S |
| D19 | Low | All screens | Twelve icon sizes are in use with no rule. | Add four icon sizes to the scale. | S |
| D20 | Low | About 50 places, including `app/(app)/location-sharing.tsx`, `station-map.tsx`, `report-detail.tsx`, `src/shared/ui/MoreHelpSheet.tsx` | Text at 10 or 11 px. | Make 12 px the smallest size. | M |
| D21 | Low | All shared buttons, rows, chips and tabs | Only text fields show which control has focus, so a hardware keyboard or switch control cannot be followed. Pressed feedback differs from one control to the next. | Add one shared pressed and focused style. | M |
| D22 | Low | `src/shared/theme/ThemeProvider.tsx:11-23`, `app.json:9` | **(device)** The keyboard and system dialogs follow the phone's theme while the app follows its own, so a light keyboard can appear over a dark app. | Follow the phone's theme (decision 2), or set the keyboard to match. | S |
| D23 | Low | `src/shared/ui/Card.tsx`, `StatusBanner.tsx`, `app/(auth)/account-disabled.tsx:161` | Card corner radius and padding vary (16, 18, 22), and the same main action uses two button sizes. | Pick two card shapes and one button size for main actions. | S |

## 8. Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| 1 | iPad: support it properly, or turn it off? | Turn off iPad support for this release. The app is portrait-only and no screen is designed for a tablet. |
| 2 | Default theme: stay dark, or follow the phone? | Follow the phone's setting, and fix the dark-mode colours (H30, H31) either way. |
| 3 | Are three emergency contacts required at sign-up? | Make them recommended, with "Skip for now" and a reminder on Home. The current rule can be bypassed by restarting the app. |
| 4 | Unsent reports at sign-out: keep them for their owner, or delete after a warning? | Keep them for their owner. This needs C1, and it removes the data loss in C3. |
| 5 | Must moderators be able to use the console on a phone or small tablet? | If yes, H33 becomes critical. If no, state a minimum width of 1024 px and show a message below it. |
| 6 | Keyboard handling: add `react-native-keyboard-controller`, or write the scrolling by hand? | Add the library. It needs a development build, which video compression already requires. |
| 7 | Which service is hotline 16247? | Needs a check against the official source. |
| 8 | Which phases to approve, and in what order? | The order in section 9. |

## 9. Proposed plan

Estimates are working days for one developer and are rough. Each phase ends with the automated checks and the device tests for what it changed.

| Phase | Goal | Findings | Days | Depends on |
|---|---|---|---|---|
| 1 | Data safety and privacy | C1 to C4, H20, M42, M43 | 3 | Decision 4 |
| 2 | Emergency paths and the lock | H1 to H7, H9, H10, M17, M19 | 4 | A development build, for H1 |
| 3 | Broken or misleading flows | H11 to H14, H16 to H19, H21, H22, H24 to H28, M1 to M7, M12 to M16, M20 to M22, M26, M27, M31, M32, M34, M35, M38 to M41 | 6 | Decisions 3 and 7 |
| 4 | Dark mode, contrast and fonts | H30, H31, M30, M46, D1 to D3, D10 to D12, D22 | 5 | Decision 2 |
| 5 | Small screens, large text and keyboard | H8, H15, H23, H29, H32, M10, M11, M25, M28, M33, M36, M44, M45, M47, D4, D13 | 5 | Decisions 1 and 6 |
| 6 | Web console | C5, H33 to H43, M48 to M60 | 5 | Decision 5 |
| 7 | Consistency, accessibility and polish | M8, M9, M18, M23, M24, M37, D5 to D9, D14 to D21, D23, L1 to L16 | 6 | — |

C5 is a one-hour fix and can be done on its own before phase 6.

**Tests to add as the work is done**

- A queued report is never sent under a different user (C1).
- The cache is empty after sign-out (C2).
- A retry after a lost confirmation completes the report (C4c), as a probe against local Supabase.
- The feed loads when the battery is low (H11).
- A contrast check for every text and background pair in both themes, extending the existing `textContrast.test.ts` (H30, H31, M30, D1, D2, D11, D12).

## 10. Device test list

These findings were judged from code and need a check on a real device before and after the fix.

| Device or setting | Check |
|---|---|
| Android 11 or later, development build | Tapping 999 and a contact opens the dialler (H1) |
| Small Android phone, about 360 x 640 dp | Home feed height (H15), Location sharing (H8), contact rows (H23), History tabs (M10), filter and flag sheets (M11) |
| Android, keyboard open | Login, register, the code screen, reset password, Capture, contact editor: the focused field and the main button stay visible (H32) |
| iPhone | Camera and gallery open from Capture (H21); the number pad can be closed (M28); VoiceOver reaches the photo button on a card (M9) |
| System text size at 130% and 200% | Text fields, buttons, help tiles and quick actions do not clip (M45) |
| Bangla language | Titles are not cut (M25, M46); Bangla digits are accepted in phone and code fields (M41) |
| Dark mode | Banners, the manual-dial note, secondary buttons, links and grey text are readable (H30, H31, D2) |
| Phone location switched off, permission granted | Capture does not flicker (H16) |
| Battery below 20% | The feed loads and refreshes (H11) |
| Two accounts on one phone | No data or unsent report crosses between them (C1, C2) |
| iPad, if kept | Content width (M44) |
| Browser at 375, 768, 1024 and 1440 px | Console layout (H33), audit table (H41), keyboard-only use of every page (M55) |

## 11. Not reviewed

- The app running on a device or in a browser.
- Bangla wording, apart from the strings named above.
- The SQL functions and Edge Functions, apart from `finalize-capture` and the storage rules.
- Performance: start-up time, list scrolling and memory use.
- Video compression, which was added on 15 November and has not yet run in a development build.
