---
id: 004-exif-strip-and-media-caps
unit: 004-capture
intent: 001-nagar-shield-mvp1
status: ready
priority: must
created: 2026-11-04T00:00:00Z
assigned_bolt: null
implemented: partial
---

# Story: 004-exif-strip-and-media-caps

## User Story

**As a** Nagar Shield user who is sharing a photo, video, or document as evidence
**I want** my file cleaned of its hidden location data and kept small enough to send over a slow mobile connection
**So that** my evidence actually arrives, and my home address is not leaked through the picture

## Acceptance Criteria

- [ ] **Given** a photo with embedded EXIF GPS, **When** it is processed by `stripExif` / `compressImage`, **Then** the uploaded object contains **no** embedded EXIF GPS tag and carries the app-supplied `lat` / `lng` / `captured_at` instead
- [ ] **Given** a video picked from the gallery that carries embedded location metadata, **When** it is transcoded, **Then** the location metadata is absent from the uploaded object and the app-supplied coordinates are the only location on the record
- [ ] **Given** a photo whose longest edge exceeds 1920 px, **When** it is processed, **Then** the uploaded object is re-encoded at a longest edge of **≤ 1920 px** (1080p class) and the compressed result is what is uploaded
- [ ] **Given** a video longer than 30 seconds, **When** it is transcoded, **Then** the uploaded object is trimmed to **≤ 30 s**; **Given** a video whose frame exceeds 1080p, **Then** it is re-encoded to **≤ 1920 px** on its longest edge
- [ ] **Given** a picked file that is larger than **10 MB** or whose MIME type is not PDF or DOC, **When** it is processed, **Then** the client rejects it with `MEDIA_TOO_LARGE` or `UNSUPPORTED_MEDIA` respectively and **no bytes are uploaded**
- [ ] **Given** a client that bypasses the client-side checks and posts an over-cap or unsupported payload directly, **When** the server re-validates it, **Then** the request is rejected with `MEDIA_TOO_LARGE` or `UNSUPPORTED_MEDIA` and no `reports` row and no Storage object is created
- [ ] **Given** a photo, video, or file that has been processed, **When** the user's device storage is inspected, **Then** the **original** file is byte-for-byte unchanged — the sanitised output is written to a new app-sandbox draft and the source asset is never modified in place
- [ ] **Given** a captured media item, **When** the app-supplied coordinates are written into the sanitised output's metadata, **Then** those coordinates equal `reports.lat` / `reports.lng` / `reports.captured_at` exactly — a mismatch between the media metadata and the row is a defect
- [ ] **Given** a document the user uploads, **When** it is processed, **Then** it is passed through without re-encoding and its original content is preserved; only the size cap and the MIME allow-list apply
- [ ] **Given** the media pipeline is exercised in tests, **When** the assertion runs, **Then** it reads the metadata back **off the uploaded object** and asserts the absence of a GPS tag — asserting on the in-memory asset is not sufficient evidence that the strip happened

## Technical Notes

- **The EXIF strip is a re-encode, not a metadata scrub.** `expo-image-manipulator` re-encodes the image, which drops the original EXIF block as a side effect — that is the reliable strip for photos. For a *picked* video, the strip happens on the transcoded output. This is why the pipeline re-encodes rather than "cleaning" metadata in place.
- **The pipeline is four focused operations**, each small and independently testable:
  - `stripExif(media, { lat, lng, captured_at })` — removes embedded EXIF GPS and attaches the app-supplied coordinates.
  - `compressImage(image)` — re-encodes to the 1080p cap (longest edge ≤ 1920), producing an EXIF-free JPEG.
  - `transcodeVideo(video)` — re-encodes to 1080p / 30 s max; a longer recording is trimmed at 30 s.
  - `uploadToStorage(file)` — direct-to-bucket upload of the **sanitised** bytes under the signed-path policy.
- **The enforced caps (PRD-X-4):**
  | Media | Cap | Enforcement |
  |-------|-----|-------------|
  | Photo | longest edge ≤ 1920 px (1080p class) | client-side re-encode; server-side re-validation |
  | Video | ≤ 1920 px longest edge **and** ≤ 30 s | client-side re-encode / trim; server-side re-validation |
  | File | ≤ 10 MB and MIME in {PDF, DOC} | client-side check; server-side re-validation |

  The video cap is **30 s**, not the prototype's ৬০ সেকেন্ড — see `001-capture-screen` for the copy deviation.
- **Client-side enforcement is before upload, and server-side re-validation is the second line.** The client check is the UX (a clear Bangla/English rejection before the user waits on a transfer); the server check is the contract. A client bypass is rejected with `MEDIA_TOO_LARGE` (413) or `UNSUPPORTED_MEDIA` (415). An over-cap item is **never uploaded** — the bytes do not leave the handset.
- **The original file on the device is never modified.** The pipeline always writes a new draft into the app sandbox (`expo-file-system`) and leaves the source asset untouched. This is not only a privacy requirement — modifying the user's gallery file in place would corrupt their personal library and is unacceptable on Android.
- **The app-supplied coordinates are the record; the media metadata is only a convenience.** `reports.lat` / `lng` / `captured_at` are authoritative. The coordinates written into the media metadata must equal them, and the test asserts equality. A mismatch is a defect, not a rounding difference to be tolerated.
- **The stripped bytes are what reach Storage.** The upload path takes the sanitised draft, never the original picked asset. The storage path carries the sanitised file's extension and the size recorded in `report_media.byte_size` is the **sanitised** size, not the original.
- **MIME allow-list.** `application/pdf` and the DOC family only for the file entry point; images for the photo path; video for the video path. `media_type` on `report_media` is one of `photo` | `video` | `file` and is derived from the entry point, not from the raw file extension.
- **The caps keep the free tier inside quota.** The Storage bucket is on the 1 GB free tier; the caps plus unit 008's 90-day purge are what keep it there. The caps are mandatory, not an optimisation.
- **Error mapping.** `MEDIA_TOO_LARGE` and `UNSUPPORTED_MEDIA` map to typed `AppError`s and to Bangla/English strings through the shared `resolveErrorMessage`; a raw Postgres or Storage error never reaches the user.
- **Testing.** Jest covers the 140-character boundary (owned by `001-capture-screen`), the media-cap checks, the EXIF strip, and the fact that the original file is unchanged. The EXIF assertion reads metadata back **off the uploaded object**, not off the in-memory asset — the pipeline's whole point is what leaves the device.
- **The pipeline runs on the device, before any byte is uploaded.** There is no server-side media-processing step at MVP; the Edge Function validates metadata and the Storage policy enforces the size and MIME constraints on the object.

## Dependencies

### Requires
- Unit `001-foundation` — `packages/shared` (`ApiErrorCode` incl. `MEDIA_TOO_LARGE` and `UNSUPPORTED_MEDIA`), the typed Supabase client, the design tokens, and the `bn` / `en` i18n bundles
- `001-capture-screen` — the three entry points that select the media, the copy that states the caps, and the `lat` / `lng` / `captured_at` the app supplies
- `007-storage-upload-and-finalize` — the private bucket, the signed-path policy, and the server-side re-validation the client-side checks are mirrored by

### Enables
- `005-offline-upload-queue` — the sanitised draft is what the queue persists and retries
- `007-storage-upload-and-finalize` — the sanitised media and its metadata are what `finalize_capture` records and what the Storage policy accepts

## Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| A photo is already 400 px on its longest edge | It is still re-encoded (so the EXIF strip still happens) but the dimensions are unchanged; no upscaling ever occurs |
| A video is 29 s and 720p | It passes the caps unchanged apart from the re-encode; the EXIF / location metadata strip still applies |
| A video is 45 s | It is trimmed at 30 s; the trimmed output is what is uploaded and what `report_media.duration_seconds` records |
| A picked file has an uppercase `.PDF` extension | The MIME type, not the string case of the extension, decides; the file is accepted |
| A picked file is a `.docx` or `.xlsx` | Rejected with `UNSUPPORTED_MEDIA`; only PDF and DOC are in the allow-list |
| A file is exactly 10 MB | Accepted; 10 MB + 1 byte is rejected with `MEDIA_TOO_LARGE` |
| The device is low on storage and the re-encode cannot be written | The pipeline surfaces a typed error, the original file is untouched, and the user is told what happened — the app does not crash and does not upload the unsanitised original |
| The source file is deleted from the gallery between selection and processing | The pipeline fails with a typed error and no partial upload is attempted |
| A camera photo has no EXIF at all | The re-encode still runs and the app-supplied coordinates are written; the output is valid |
| The sanitised output is larger than the original (a pathological re-encode) | The upload is still attempted, but the 10 MB cap is re-checked against the **sanitised** size before any bytes are sent |
| The app is killed mid-transcode | The partially written draft is discarded on next launch; the original file is intact and nothing was uploaded |

## Out of Scope

- Server-side transcoding, thumbnailing, or video poster-frame generation
- AI media classification, image blurring, or face detection — out of MVP scope
- HEIC / ProRAW / RAW decoding beyond what the platform picker hands over as a standard asset
- Audio extraction, narration, or any media editing beyond the caps
- The 90-day media purge job — unit `008-jobs-operations`
- The offline queue, the backoff schedule, and the "saved on device" state — `005-offline-upload-queue`
- The Edge Function, the Storage bucket, and the signed-path policy — `007-storage-upload-and-finalize`
- Modifying, deleting, or re-saving the user's original file in their gallery
- Any exif metadata other than GPS being deliberately preserved — the re-encode drops the original EXIF block as a whole

## Implementation

**The image path works: EXIF is stripped and the size caps are enforced. The story is not `complete` because the video path is not implemented and the dimension cap is the wrong value.**

### What ships

- **Images:** `apps/mobile/src/shared/services/prepareMedia.ts` re-encodes images, which is what actually removes the EXIF metadata — the comment at line 19 names *"the reliable EXIF strip"*.
- The video cap is enforced on the client: `prepareMedia.ts:108-110` throws `MEDIA_TOO_LARGE` with `{ maxSeconds: 30 }` when the picked video is over 30 s.
- The file size cap is enforced after the copy: `prepareMedia.ts:122-124` throws `MEDIA_TOO_LARGE` when the copied file exceeds the cap.
- The type allowlist is enforced: `prepareMedia.ts:104-106` throws `UNSUPPORTED_MEDIA` for a disallowed mime type.
- The server re-validates independently: `supabase/functions/finalize-capture/index.ts:9` documents that it re-validates `MEDIA_TOO_LARGE` / `UNSUPPORTED_MEDIA`, and `supabase/functions/_shared/contracts.ts:90` carries the code in its response contract.

### The gaps

- **The video path does no video work.** `prepareMedia.ts:103-136` — `prepareVideo` — checks the type, checks the duration, computes a resize target, and then:

  ```ts
  const file = new File(ensureDraftDirectory(), `video-${Date.now()}.${extensionFor(asset.mimeType, 'video')}`);
  const source = new File(asset.uri);
  await source.copy(file, { overwrite: true });
  ```

  It **copies the original bytes**. There is no trim, no transcode, and no location-metadata strip on the video path. The function's own doc comment (`prepareMedia.ts:98-101`) says *"A video longer than the 30 s cap is **trimmed** before the upload. The transcode itself needs the native video pipeline; when it is unavailable the original is kept and the server rejects it with `MEDIA_TOO_LARGE`"*. The **over-cap** case is genuinely handled — the client refuses it. But the **trim** the comment describes is never performed: a video between the cap and the limit is copied unchanged, and no trimming to 30 s happens. So the video's location metadata is never stripped either, which is the one thing the story is named for.

- **`MEDIA_DEFAULT_DIMENSION` is 1080, not the specified 1920.** `prepareMedia.ts:177`:

  ```ts
  const MEDIA_DEFAULT_DIMENSION = 1080;
  ```

  This is the fallback for a picked asset that reports no width or height, and it feeds `resizeTarget(width, height)` at `prepareMedia.ts:112-114`. So an asset with no reported dimensions is scaled to 1080, not 1920.

- **The server-side `UNSUPPORTED_MEDIA` is not reachable from the video path.** The client rejects the disallowed type before the upload, so the server's re-validation for a *video* never sees one. The code exists and is correct; it simply has no path to it for this media type.

- **No test covers the video path.** There is no assertion that a video is trimmed, that its metadata is stripped, or that the dimension cap is applied.

### What closing this needs

1. A real trim on the video path — the native pipeline the comment says is unavailable needs to be either shipped or the story amended to say the client refuses over-cap video rather than trimming it.
2. Location-metadata stripping for video, matching what the image path achieves by re-encoding.
3. `MEDIA_DEFAULT_DIMENSION` raised to the specified 1920.
4. A test on the video path asserting the output is trimmed to the cap and carries no location metadata.
