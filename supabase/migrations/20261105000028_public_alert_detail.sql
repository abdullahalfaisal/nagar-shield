-- ---------------------------------------------------------------------------
-- 20261105000028_public_alert_detail.sql
--
-- Story: `006-alerts / 009-alert-detail-screen`
--
-- The **public** alert detail — the surface behind the feed card's
-- `✎ বিস্তারিত দেখুন` link.
--
-- The problem
-- -----------
-- The prototype's `data-nav="21a"` is the **author's own** report detail,
-- owned by unit `004-capture`. There is no prototype screen for a *public*
-- alert detail, so this story creates one.
--
-- The public surface cannot read the report the way the author's own surface
-- does:
--
--   * `reports_select_own` scopes the read to `author_id = auth.uid()`, so a
--     citizen cannot read a neighbour's report row at all;
--   * `report_media_select_own` scopes the media to the author and to a
--     moderator, so the media of a neighbour's report are equally unreadable;
--   * and the Storage bucket's select policy is the author's folder plus the
--     moderator's, so the signed URL cannot be issued either.
--
-- The fix
-- -------
-- One `SECURITY DEFINER` read model — `public.alert_detail` — that returns the
-- report's content and its media **paths** for a report that is publicly
-- visible, and one Storage policy that lets a signed URL be minted for the
-- media of such a report.
--
-- The privacy position is unchanged
-- ----------------------------------
-- The function returns **no author field of any kind**. `author_id` is not in
-- the output, `author_display_name` is not in the output, and the display
-- alias is only carried when the author explicitly chose `identified` —
-- which is the same rule the `alerts_feed` projection already applies. The
-- author is **not** erased: `reports.author_id` remains server-side for
-- moderation (FR-DATA-3); the public surface simply has no field to render.
--
-- The function only ever returns a report that the caller could already see
-- in the feed: `moderation_status in ('visible', 'restored')` and not
-- soft-deleted. A report that moderation removed resolves to nothing, and the
-- client renders its "no longer available" state rather than a removed
-- report.
--
-- Why the media come back as paths and not as URLs
-- -------------------------------------------------
-- A signed URL is short-lived and is minted by the client against the Storage
-- API. Returning a URL from the database would mean minting one server-side
-- on every read, which is both slower and harder to expire precisely. The
-- path is returned instead, and the client signs it — the same path the
-- author's own detail already signs.
-- ---------------------------------------------------------------------------

create or replace function public.alert_detail(p_report_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_report public.reports%rowtype;
  v_author_name text;
  v_media jsonb;
begin
  if p_report_id is null then
    raise exception 'VALIDATION_FAILED' using errcode = '22023';
  end if;

  select r.* into v_report
  from public.reports r
  where r.id = p_report_id
    and r.deleted_at is null
    and r.moderation_status in ('visible', 'restored');

  -- A report that is not publicly visible simply does not exist here. The
  -- client renders the same "no longer available" state for "removed" and
  -- "never existed", so the two are indistinguishable from outside.
  if not found then
    return null;
  end if;

  -- The display alias is carried only for an `identified` report — the same
  -- rule the feed projection applies.
  if v_report.public_visibility = 'identified' then
    select p.full_name into v_author_name
    from public.profiles p
    where p.id = v_report.author_id;
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', rm.id,
             'report_id', rm.report_id,
             'storage_path', rm.storage_path,
             'media_type', rm.media_type,
             'byte_size', rm.byte_size,
             'duration_seconds', rm.duration_seconds,
             'width', rm.width,
             'height', rm.height
           )
           order by rm.created_at asc, rm.id asc
         ), '[]'::jsonb)
  into v_media
  from public.report_media rm
  where rm.report_id = v_report.id
    and rm.purged_at is null;

  return jsonb_build_object(
    'id', v_report.id,
    'category', v_report.category,
    'description', v_report.description,
    'area_hierarchy', v_report.area_hierarchy,
    'captured_at', v_report.captured_at,
    'public_visibility', v_report.public_visibility,
    'author_display_name', v_author_name,
    'lat', v_report.lat,
    'lng', v_report.lng,
    'media', v_media
  );
end;
$$;

-- The grant is **explicit**. Postgres grants `EXECUTE` on a new function to
-- `PUBLIC` by default, and `anon` is a member of `PUBLIC` — so without the
-- revoke below, an anonymous visitor could resolve a report through this
-- surface. The alert detail is an authenticated surface (the feed is
-- authenticated too), so the function is revoked from `PUBLIC` and granted
-- to `authenticated` alone.
revoke execute on function public.alert_detail(uuid) from public;
revoke execute on function public.alert_detail(uuid) from anon;
grant execute on function public.alert_detail(uuid) to authenticated;

comment on function public.alert_detail(uuid) is
  'The public alert detail for one visibly-moderated report. Carries no author id and no author display name unless the report was filed as identified (FR-DATA-3 / FR-NG-5). Returns NULL for a removed or deleted report.';

-- -----------------------------------------------------------------------------
-- The Storage select policy for the public alert detail.
--
-- The capture write path stores an object at
--
--   reports/<author_id>/<client_request_id>/<file>
--
-- so the **second** segment is the author's id and the third is the report's
-- `client_request_id`. The object can therefore be joined back to its report
-- without any extra column on the object itself.
--
-- The policy grants a signed-URL read for the media of a report that is
-- publicly visible. It is deliberately narrower than "the author or a
-- moderator":
--
--   * the bucket is still private — the bytes are never public, and the URL
--     is short-lived and minted on demand;
--   * the report must still be `visible` or `restored` — a removed report's
--     media become unreadable the moment moderation acts;
--   * a soft-deleted report's media are unreadable too.
--
-- The author's own objects remain readable through the pre-existing
-- `report_media_select_own` policy, and a moderator's through
-- `report_media_select_moderator`. This policy is **additional**, not a
-- replacement — a report that is both the caller's own and visible is covered
-- by all three, which is fine: a policy is a permission, and several
-- permissions can grant the same access.
-- -----------------------------------------------------------------------------

drop policy if exists "report_media_select_public" on storage.objects;

create policy "report_media_select_public"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'report-media'
    and (storage.foldername(name))[1] = 'reports'
    and exists (
      select 1
      from public.reports r
      join public.report_media rm
        on rm.report_id = r.id
       and rm.storage_path = storage.objects.name
      where r.author_id::text = (storage.foldername(name))[2]
        and r.client_request_id::text = (storage.foldername(name))[3]
        and r.deleted_at is null
        and r.moderation_status in ('visible', 'restored')
    )
  );
