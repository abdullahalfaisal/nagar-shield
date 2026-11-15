-- =============================================================================
-- report-media — photos and videos only
--
-- A report's evidence is a photo or a video. The app used to offer PDF / DOC
-- attachments as well; it no longer does, and `finalize-capture` now refuses
-- a `file` media type with `UNSUPPORTED_MEDIA`.
--
-- The bucket is the third line: it refuses any other content type at upload,
-- so a client that skips the app's checks still cannot store a document. The
-- list is the one the app's pipeline produces — photos are re-encoded to JPEG
-- on the device, the other image types are listed for older clients — and the
-- video types the phone cameras record.
--
-- Rows already filed with a `file` attachment are left as they are.
-- =============================================================================

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/3gpp'
]
where id = 'report-media';
