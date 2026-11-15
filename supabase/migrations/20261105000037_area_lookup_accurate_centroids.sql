-- =============================================================================
-- area_lookup — accurate centroids, more areas, a tighter match radius
--
-- The auto-detected area on Capture was often wrong. Two causes, both here:
--
--   1. Many curated centroids were several kilometres from the place they
--      name. Mirpur sat near Banani, Motijheel near Farmgate, Wari near
--      Mohammadpur, Ramna near Adabor. `reverse_geocode` matches the NEAREST
--      centroid, so a citizen standing in Mirpur 10 was told "Banani".
--   2. With 24 rows, any place not on the list (Badda, Rampura, Mohakhali,
--      Old Dhaka…) took the name of whichever row happened to be nearest,
--      up to 7 km away.
--
-- This migration moves every Dhaka centroid to the area's centre, adds the
-- major areas that were missing, corrects three Bangla names, drops the
-- fictional `Palashpur` row (its centroid sat on top of Sher-e-Bangla Nagar
-- and won matches there), and narrows the local match to 4 km. Beyond 4 km
-- of every centroid the honest answer is "not known locally": the RPC falls
-- through to the cache and the degraded result, and `finalize-capture` tries
-- the online backup.
--
-- The coordinates are area centres to roughly 0.5 km, which is the precision
-- a nearest-centroid match can use. Reports already filed keep the area they
-- were filed with; `area_hierarchy` is stored on the report.
-- =============================================================================

-- 1. Move the existing centroids and correct the Bangla names.
update public.area_lookup a
set
  centroid = st_setsrid(st_makepoint(v.lng, v.lat), 4326),
  name_bn = v.name_bn
from (
  values
    ('Adabor', 'আদাবর', 23.7735, 90.3560),
    ('Banani', 'বনানী', 23.7940, 90.4040),
    ('Baridhara', 'বারিধারা', 23.8010, 90.4215),
    ('Bashundhara', 'বসুন্ধরা', 23.8185, 90.4330),
    ('Dhanmondi', 'ধানমন্ডি', 23.7465, 90.3760),
    ('Gulshan', 'গুলশান', 23.7880, 90.4160),
    ('Hazaribagh', 'হাজারীবাগ', 23.7335, 90.3640),
    ('Kalabagan', 'কলাবাগান', 23.7490, 90.3830),
    ('Khilkhet', 'খিলক্ষেত', 23.8290, 90.4220),
    ('Lalmatia', 'লালমাটিয়া', 23.7560, 90.3680),
    ('Mirpur', 'মিরপুর', 23.8069, 90.3687),
    ('Mohammadpur', 'মোহাম্মদপুর', 23.7620, 90.3590),
    ('Motijheel', 'মতিঝিল', 23.7330, 90.4180),
    ('Nikunja', 'নিকুঞ্জ', 23.8330, 90.4180),
    ('Pallabi', 'পল্লবী', 23.8240, 90.3640),
    ('Ramna', 'রমনা', 23.7440, 90.4030),
    ('Shahbagh', 'শাহবাগ', 23.7385, 90.3960),
    ('Sher-e-Bangla Nagar', 'শেরেবাংলা নগর', 23.7700, 90.3780),
    ('Tejgaon', 'তেজগাঁও', 23.7620, 90.3960),
    ('Uttara', 'উত্তরা', 23.8700, 90.3990),
    ('Wari', 'ওয়ারী', 23.7180, 90.4200)
) as v(name, name_bn, lat, lng)
where a.name = v.name;

-- 2. The fictional row. Nothing references `area_lookup` by id: reports
--    store their `area_hierarchy` as a value.
delete from public.area_lookup where name = 'Palashpur';

-- 3. The major Dhaka areas that were missing.
insert into public.area_lookup (name, name_bn, division, city, thana, neighborhood, centroid)
select v.name, v.name_bn, 'Dhaka', 'Dhaka', v.name, v.name,
       st_setsrid(st_makepoint(v.lng, v.lat), 4326)
from (
  values
    ('Azimpur', 'আজিমপুর', 23.7270, 90.3850),
    ('Badda', 'বাড্ডা', 23.7800, 90.4260),
    ('Cantonment', 'ক্যান্টনমেন্ট', 23.8180, 90.4000),
    ('Demra', 'ডেমরা', 23.7230, 90.4930),
    ('Farmgate', 'ফার্মগেট', 23.7570, 90.3890),
    ('Jatrabari', 'যাত্রাবাড়ী', 23.7100, 90.4340),
    ('Kafrul', 'কাফরুল', 23.7880, 90.3870),
    ('Kamrangirchar', 'কামরাঙ্গীরচর', 23.7180, 90.3720),
    ('Karwan Bazar', 'কারওয়ান বাজার', 23.7510, 90.3930),
    ('Keraniganj', 'কেরানীগঞ্জ', 23.6980, 90.3480),
    ('Khilgaon', 'খিলগাঁও', 23.7520, 90.4260),
    ('Kotwali', 'কোতোয়ালী', 23.7080, 90.4080),
    ('Lalbagh', 'লালবাগ', 23.7190, 90.3880),
    ('Malibagh', 'মালিবাগ', 23.7490, 90.4130),
    ('Mohakhali', 'মহাখালী', 23.7780, 90.4000),
    ('Mugda', 'মুগদা', 23.7310, 90.4290),
    ('Paltan', 'পল্টন', 23.7360, 90.4110),
    ('Rampura', 'রামপুরা', 23.7610, 90.4210),
    ('Shyamoli', 'শ্যামলী', 23.7720, 90.3650),
    ('Sutrapur', 'সূত্রাপুর', 23.7100, 90.4170),
    ('Tongi', 'টঙ্গী', 23.8980, 90.4080),
    ('Turag', 'তুরাগ', 23.8870, 90.3650)
) as v(name, name_bn, lat, lng)
where not exists (select 1 from public.area_lookup a where a.name = v.name);

-- 4. reverse_geocode with the 4 km local radius. Unchanged otherwise.
create or replace function public.reverse_geocode(p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row record;
  v_key text := public.geocode_key(p_lat, p_lng);
begin
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
  --
  -- Capped at 4 km. The Dhaka centroids are 1–2 km apart, so a point inside
  -- the city is always well within the cap; a point 4 km from every centroid
  -- is somewhere the table does not cover, and naming the nearest row anyway
  -- would be a fabricated address.
  select
    jsonb_build_object(
      'division', a.division,
      'city', a.city,
      'thana', a.thana,
      'neighborhood', a.neighborhood
    ) as area_hierarchy,
    'local'::public.geocode_source as source
  into v_row
  from public.area_lookup a
  where st_dwithin(
    a.centroid::geography,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    4000  -- 4 km
  )
  order by a.centroid <-> st_setsrid(st_makepoint(p_lng, p_lat), 4326)
  limit 1;

  if found then
    return jsonb_build_object(
      'area_hierarchy', v_row.area_hierarchy,
      'source', v_row.source
    );
  end if;

  -- 3. The nearest cached point within ~110 m.
  select * into v_row
  from public.geocode_cache
  where key like substr(v_key, 1, length(v_key) - 6) || '%'
  limit 1;

  if found then
    return jsonb_build_object(
      'area_hierarchy', v_row.area_hierarchy,
      'source', v_row.source
    );
  end if;

  -- 4. Degraded: the coordinate only. Never a fabricated street address.
  return jsonb_build_object(
    'area_hierarchy', jsonb_build_object(
      'division', null,
      'city', null,
      'thana', null,
      'neighborhood', null
    ),
    'source', 'degraded'
  );
end;
$$;

grant execute on function public.reverse_geocode(double precision, double precision)
  to anon, authenticated;
