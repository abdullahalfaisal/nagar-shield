-- =============================================================================
-- Nagar Shield — MVP Phase 1
-- 005_seed_reference_data.sql
--
-- Two kinds of seed:
--
--   1. The `profiles` rows for the auth users that already exist. The
--      `handle_new_user` trigger only fires for NEW signups, so a database
--      that predates the trigger has auth users with no profile. This
--      migration backfills them, deriving a placeholder phone from the email
--      when the user metadata carries none.
--
--   2. The curated Dhaka `area_lookup` rows. Waiver W-3 makes the local
--      table the FIRST geocode source; without any rows every capture would
--      fall through to the online Nominatim backup, which is slow,
--      rate-limited, and may be unreachable.
--
-- The curated station / hotline dataset is NOT seeded here — it is
-- regenerated from the repo JSON by `tools/mirror-reference-data.cjs`.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Backfill profiles for auth users that predate the trigger
-- -----------------------------------------------------------------------------

insert into public.profiles (id, email, phone, full_name, role)
select
  u.id,
  u.email,
  coalesce(
    u.raw_user_meta_data ->> 'phone',
    '+8801' || lpad((abs(hashtext(u.id::text)) % 100000000)::text, 8, '0')
  ),
  nullif(btrim(coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
  case
    when coalesce(u.raw_user_meta_data ->> 'role', '') = 'moderator'
      then 'moderator'::public.app_role
    else 'citizen'::public.app_role
  end
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 2. The curated Dhaka area lookup
--
-- One row per thana / neighborhood with its centroid. The centroid is the
-- point the reverse-geocode matches against, so it must be the AREA's centre
-- rather than any one building inside it.
-- -----------------------------------------------------------------------------

insert into public.area_lookup (
  name, name_bn, division, city, thana, neighborhood, centroid
)
values
  ('Dhanmondi', 'ধানমন্ডি', 'Dhaka', 'Dhaka', 'Dhanmondi', 'Dhanmondi',
   st_setsrid(st_makepoint(90.3774, 23.7461), 4326)),
  ('Mirpur', 'মিরপুর', 'Dhaka', 'Dhaka', 'Mirpur', 'Mirpur',
   st_setsrid(st_makepoint(90.4027, 23.8042), 4326)),
  ('Gulshan', 'গুলশান', 'Dhaka', 'Dhaka', 'Gulshan', 'Gulshan',
   st_setsrid(st_makepoint(90.4078, 23.7925), 4326)),
  ('Banani', 'বনানী', 'Dhaka', 'Dhaka', 'Banani', 'Banani',
   st_setsrid(st_makepoint(90.4066, 23.7937), 4326)),
  ('Tejgaon', 'তেজগঞ্জ', 'Dhaka', 'Dhaka', 'Tejgaon', 'Tejgaon',
   st_setsrid(st_makepoint(90.3797, 23.7559), 4326)),
  ('Motijheel', 'মতিঝিল', 'Dhaka', 'Dhaka', 'Motijheel', 'Motijheel',
   st_setsrid(st_makepoint(90.3915, 23.7694), 4326)),
  ('Shahbagh', 'শাহবাগ', 'Dhaka', 'Dhaka', 'Shahbagh', 'Shahbagh',
   st_setsrid(st_makepoint(90.3946, 23.7411), 4326)),
  ('Wari', 'ওয়ারী', 'Dhaka', 'Dhaka', 'Wari', 'Wari',
   st_setsrid(st_makepoint(90.3653, 23.7721), 4326)),
  ('Bashundhara', 'বসুন্ধরা', 'Dhaka', 'Dhaka', 'Bashundhara', 'Bashundhara',
   st_setsrid(st_makepoint(90.4268, 23.8226), 4326)),
  ('Uttara', 'উত্তরা', 'Dhaka', 'Dhaka', 'Uttara', 'Uttara',
   st_setsrid(st_makepoint(90.3795, 23.8759), 4326)),
  ('Nikunja', 'নিকুঞ্জ', 'Dhaka', 'Dhaka', 'Nikunja', 'Nikunja',
   st_setsrid(st_makepoint(90.3756, 23.7894), 4326)),
  ('Lalmatia', 'লালমাটিয়া', 'Dhaka', 'Dhaka', 'Lalmatia', 'Lalmatia',
   st_setsrid(st_makepoint(90.3664, 23.7488), 4326)),
  ('Palashpur', 'পলাশপুর', 'Dhaka', 'Dhaka', 'Palashpur', 'Palashpur',
   st_setsrid(st_makepoint(90.3781, 23.7727), 4326)),
  ('Savar', 'সাভার', 'Dhaka', 'Dhaka', 'Savar', 'Savar',
   st_setsrid(st_makepoint(90.2667, 23.8583), 4326)),
  ('Khilkhet', 'খিলখেত', 'Dhaka', 'Dhaka', 'Khilkhet', 'Khilkhet',
   st_setsrid(st_makepoint(90.4110, 23.8210), 4326)),
  ('Baridhara', 'বারিধারা', 'Dhaka', 'Dhaka', 'Baridhara', 'Baridhara',
   st_setsrid(st_makepoint(90.3830, 23.7980), 4326)),
  ('Ramna', 'রামনা', 'Dhaka', 'Dhaka', 'Ramna', 'Ramna',
   st_setsrid(st_makepoint(90.3570, 23.7800), 4326)),
  ('Adabor', 'আদাবর', 'Dhaka', 'Dhaka', 'Adabor', 'Adabor',
   st_setsrid(st_makepoint(90.3500, 23.7650), 4326)),
  ('Pallabi', 'পল্লাবী', 'Dhaka', 'Dhaka', 'Pallabi', 'Pallabi',
   st_setsrid(st_makepoint(90.3950, 23.8120), 4326)),
  ('Kalabagan', 'কলাবাগান', 'Dhaka', 'Dhaka', 'Kalabagan', 'Kalabagan',
   st_setsrid(st_makepoint(90.3980, 23.7440), 4326)),
  ('Hazaribagh', 'হাজারীবাগ', 'Dhaka', 'Dhaka', 'Hazaribagh', 'Hazaribagh',
   st_setsrid(st_makepoint(90.3460, 23.7820), 4326)),
  ('Mohammadpur', 'মোহাম্মদপুর', 'Dhaka', 'Dhaka', 'Mohammadpur', 'Mohammadpur',
   st_setsrid(st_makepoint(90.3688, 23.7461), 4326)),
  ('Sher-e-Bangla Nagar', 'শের-বাংলা নগর', 'Dhaka', 'Dhaka', 'Sher-e-Bangla Nagar', 'Sher-e-Bangla Nagar',
   st_setsrid(st_makepoint(90.3961, 23.7245), 4326)),
  ('Mymensingh Sadar', 'ময়মনসিংহ সদর', 'Mymensingh', 'Mymensingh', 'Mymensingh Sadar', 'Mymensingh Sadar',
   st_setsrid(st_makepoint(90.4073, 24.7539), 4326))
on conflict do nothing;
