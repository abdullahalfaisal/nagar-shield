---
id: 002-area-hierarchy-extraction
unit: 004-capture
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: partial
---

# Story: 002-area-hierarchy-extraction

## User Story

**As a** Nagar Shield user reporting an incident
**I want** my report to be filed against the correct thana and neighborhood
**So that** the people nearby, and the moderators reviewing it later, can find and understand it

## Acceptance Criteria

- [ ] **Given** a submitted report whose coordinates fall inside a curated `area_lookup` area, **When** `finalize_capture` resolves the area, **Then** the `area_lookup` nearest-centroid lookup is consulted **first** and the stored `area_hierarchy` contains the matching `division`, `city`, and `thana` (plus `neighborhood` when the matched row carries one)
- [ ] **Given** a coordinate with no `area_lookup` match, **When** the resolver checks `geocode_cache`, **Then** a cache hit is used verbatim and **no** call is made to the online geocoder
- [ ] **Given** a coordinate with no `area_lookup` match and no `geocode_cache` entry, **When** the resolver falls through to the online backup, **Then** the request goes only to the allowlisted `GEOCODE_BASE_URL` host, is rate-limited, is given a short timeout, and is attempted **once**
- [ ] **Given** the online geocoder resolves the coordinate, **When** the resolve completes, **Then** the result is written to `geocode_cache` with `source = 'online'` and the resolved `area_hierarchy` is stored on the report
- [ ] **Given** the online geocoder is unreachable, times out, or returns an unusable payload, **When** the resolve completes, **Then** the report is still created with `division = 'Dhaka'`, `city = 'Dhaka'`, and an unknown thana, the response carries the non-fatal `GEOCODE_UNAVAILABLE` code, and **the submit still succeeds** with a `report_id`
- [ ] **Given** any submit, **When** the response is returned to the client, **Then** the submit path never awaited a live geocode call before returning — the client receives the `report_id` without waiting on the external geocoder
- [ ] **Given** a report whose coordinates fall outside Dhaka, **When** the area is resolved, **Then** the resolver does not invent a Dhaka thana from a nearest-centroid match that is implausibly distant, and the `area_lookup` nearest-centroid lookup is bounded by a radius
- [ ] **Given** a `geocode_cache` row is evicted at any moment, **When** a later submit resolves the same coordinate, **Then** the resolver re-resolves through `area_lookup` and then the online backup, and the cache is treated as an optimisation rather than a source of truth
- [ ] **Given** the `area_hierarchy` value returned to the client, **When** it is parsed with the shared `areaHierarchySchema`, **Then** `division` and `city` are present and non-empty, `thana` is present (a degraded resolve still carries a thana key), and `neighborhood` is optional and may be absent
- [ ] **Given** the resolver is exercised in tests, **When** the three resolution paths run — `area_lookup` hit, `geocode_cache` hit, and online-geocode → degrade — **Then** each path is covered by a test that asserts the stored `area_hierarchy` and the `source` recorded against the resolve

## Technical Notes

- **Resolution order is fixed and load-bearing:**
  1. `area_lookup` — the curated Dhaka-local nearest-centroid lookup, the **primary** source.
  2. `geocode_cache` — the resolved hierarchy for a rounded coordinate key.
  3. Online Nominatim-compatible backup — **cache-miss only**, allowlisted host (`GEOCODE_BASE_URL`), rate-limited, short timeout, single attempt.
  4. Graceful degrade — `division = 'Dhaka'`, `city = 'Dhaka'`, unknown thana.

  The online geocoder is a **backup**, never a step the normal path depends on.
- **Waiver W-3 / FR-CAPTURE-4 — the geocode must not block the submit.** Two readings, and both hold:
  - The *submit path* never awaits a live geocode before returning. The Edge Function resolves the area from the local table and the cache synchronously; the online backup is consulted at most on a miss and its failure degrades rather than fails.
  - No client code path awaits a geocode before enabling the submit. The Capture screen's CTA is never gated on a geocode (see `001-capture-screen`).
- **The nearest-centroid lookup uses the GiST index and a metre-correct radius.** The query casts to geography before the distance test — `ST_DWithin(centroid::geography, $point::geography, $radius)` — so the radius is metres on the SRID-4326 plane. A naive degree-based `ST_DWithin` is a defect, not a shortcut. The radius is bounded: a centroid implausibly far from the point is a miss, not a match.
- **`area_lookup` is curated, not scraped.** `supabase/seed/area-lookup.json` is the source of truth and the Postgres table is the mirror, exactly like `stations` / `hotlines` in unit 003 — one dataset, one refresh script, no runtime drift. Roughly 100–300 Dhaka metro rows at MVP.
- **`geocode_cache` is a cache.** The key is a rounded coordinate grid + geohash so nearby fixes share an entry. `source` is `local` | `online` | `degraded`. It may be evicted at any time; the eviction job belongs to unit `008-jobs-operations`, not to this unit. This unit owns the cache read and the write after a successful online resolve.
- **The allowlist is a hard constraint, and it is a security constraint.** The Edge Function may call only `GEOCODE_BASE_URL`. There is no user-supplied URL in the request, no redirect-following to an arbitrary host, and the resolved value is never rendered as HTML. This closes the SSRF hole that a "pass a geocode URL through the client" design would open.
- **Rate limiting the online backup.** The per-instance limiter caps requests per minute so a burst of cache misses cannot take down a public Nominatim instance (the unit brief rates this external dependency **High** risk — public instances rate-limit hard and are frequently unavailable).
- **A degraded resolve is a successful submit.** `GEOCODE_UNAVAILABLE` is a non-fatal **200** code per `memory-bank/standards/api-conventions.md`: the submit succeeded and the area degraded. The client treats it as success and shows the report, not as an error.
- **`area_hierarchy` is `jsonb NOT NULL`** with the default `{'division':'Dhaka','city':'Dhaka','thana':null,'neighborhood':null}`. The column is never null on a stored report — a report always carries an area hierarchy, even a degraded one.
- **The stored hierarchy is authoritative; the client card is a hint.** `reports.lat` / `lng` / `captured_at` and the server-resolved `area_hierarchy` are the record. The address shown on the Capture screen's location card may legitimately disagree (thana boundary, degraded geocode) and that is not a bug.
- **No raw coordinates in logs.** The Edge Function emits structured JSON logs with a request id and a hashed user id; raw GPS coordinates, media payloads, passwords, and tokens are never logged.
- **Testing.** A Supabase-local integration test covers the three paths — `area_lookup` hit, `geocode_cache` hit, online-geocode → degrade. The degrade test asserts both that the submit returns a `report_id` and that `area_hierarchy` carries `division = 'Dhaka'`, `city = 'Dhaka'`, and an unknown thana. The online path is exercised against a stubbed host, never a live public instance in CI.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` (`areaHierarchySchema`, `AreaHierarchy` type, `ApiErrorCode` incl. `GEOCODE_UNAVAILABLE`), the typed Supabase client, and the i18n key contract
- `supabase/migrations/0003_capture.sql` — the `area_lookup` and `geocode_cache` tables, the `area_lookup.centroid` GiST index, and the `reports.area_hierarchy` column with its default
- `supabase/seed/area-lookup.json` — the curated Dhaka-local dataset mirrored into `area_lookup`
- `001-capture-screen` — the `lat` / `lng` / `captured_at` the resolver is given

### Enables
- `007-storage-upload-and-finalize` — the resolver runs inside `finalize_capture` and supplies the `area_hierarchy` the response envelope returns
- Unit `006-alerts` — the `area_hierarchy` the Alerts feed filters on and the area chip row renders
- Unit `008-jobs-operations` — the `geocode_cache` table and its `source` / `last_hit_at` columns for the cache cleanup job

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| The geocoder host returns HTTP 429 | The resolve degrades to Dhaka / unknown thana, the submit succeeds, and the limiter's backoff is respected on the next attempt |
| The geocoder host returns a 200 with an empty or malformed address list | The payload fails the shared `areaHierarchySchema`, the resolve degrades, and nothing is written to `geocode_cache` |
| The geocoder responds slowly, beyond the timeout | The resolve degrades; the submit is not delayed beyond the timeout budget |
| The coordinate is exactly on a thana boundary | The nearest-centroid distance test decides; the result is deterministic and repeatable for the same coordinate |
| The coordinate is outside Dhaka metro entirely | The bounded nearest-centroid lookup returns no match; the resolver degrades rather than assigning a distant Dhaka thana |
| Two users submit from nearly the same coordinates at slightly different fixes | The rounded coordinate key collapses them onto the same `geocode_cache` entry; the cached hierarchy is shared |
| `geocode_cache` is empty and the geocoder is down on the very first submit of the day | The report is still created with a degraded hierarchy — the first submit is not the slowest and most fragile path |
| The `area_lookup` table has not yet been seeded | The local lookup returns no match, the cache is consulted, and the online backup or the degrade path carries the submit; no exception escapes |
| A cached entry holds `source = 'degraded'` | The resolver does not treat a degraded cache entry as an authoritative hierarchy for a fresh resolve; it re-resolves and overwrites the entry |
| The online resolve returns a `neighborhood` the shared schema rejects | The payload fails validation, the resolve degrades, and a raw third-party payload is never stored verbatim in `area_hierarchy` |

## Out of Scope

- The location fix capture, the permission request, and the reverse-geocoded address on the Capture screen's location card — `001-capture-screen` and `006-capture-permission-degradation`
- The client-side display of the resolved area — unit `006-alerts`
- The `geocode_cache` eviction / cleanup job — unit `008-jobs-operations`
- Curating or extending the `area-lookup.json` dataset beyond the seeded Dhaka metro areas
- Any map tile rendering, geofencing, or distance alert — no dispatch or geofence features at MVP
- Any use of the geocoder for the location-sharing or Help Alert paths
- Raw GPS logging or exposing raw coordinates in an API response

## Implementation

**The area-hierarchy shape and the server-side resolution ship. The story is not `complete` because the shared schema was never written and the resolution order contradicts the story.**

### What ships

- The hierarchy shape is typed in `packages/shared/src/types/index.ts` and referenced from `packages/shared/src/testing/index.ts`.
- The server resolves an area hierarchy. `supabase/migrations/20261105000003_functions.sql` defines the resolution with a curated `public.area_lookup` table of Dhaka-local centroids and a `ST_DWithin` match capped at **7 km**.
- The cap is deliberate and documented in the SQL: *"A thana is roughly 5–7 km across, so 7 km is the widest match that is still truthful."* The comment continues: *"Without the cap the nearest centroid always wins, so a coordinate 200 km away would be labelled 'Dhanmondi' — a fabricated address, which is exactly what the degraded path exists to avoid."*
- The response shape is `{ area_hierarchy, source }` with a `geocode_source` enum distinguishing the cache hit from the local match.

### The gaps

- **`areaHierarchySchema` does not exist.** `grep -rn "areaHierarchySchema" packages/shared apps/mobile apps/admin` returns **nothing**. The story names it as the shared contract for the hierarchy; the type exists but the validating schema — the thing that would reject a malformed hierarchy at the boundary — was never written. The server's JSON is trusted as-is.

- **The resolution order contradicts the story.** The story specifies the `area_lookup`-first order; the shipped code is **cache-first**. `supabase/migrations/20261105000003_functions.sql:332-368`:

  ```sql
  -- 1. Exact cache hit.
  select * into v_row
  from public.geocode_cache
  where key = v_key
  limit 1;

  if found then
    return jsonb_build_object(
      'area_hierarchy', v_row.area_hierarchy,
      'source', v_row.source
    );
  end if;

  -- 2. The curated Dhaka-local table — the PRIMARY source.
  ```

  The comment calls `area_lookup` *"the PRIMARY source"*, but the cache is consulted **first** and returns immediately. So the effective precedence is the reverse of the comment's own claim. This is not merely a wording mismatch: a **stale cache entry wins over the curated table**, which is the opposite of what the story wants and of what the code's own comment promises.

- **No test pins the precedence.** Nothing asserts which source wins when both a cache entry and a curated row exist for the same coordinate, so the order can drift silently in either direction.

### What closing this needs

1. `areaHierarchySchema` in `packages/shared`, with the server's response validated against it at the client boundary.
2. The resolution order made to match the story — `area_lookup` first, cache only as a fallback — or the story amended to say cache-first. Right now the code, the comment, and the story are three different positions.
3. A test that fixes the precedence: with both a cache entry and a curated row for one coordinate, the curated row wins.
4. A cache-invalidation rule, if the cache stays first — otherwise a corrected area never reaches a citizen.
