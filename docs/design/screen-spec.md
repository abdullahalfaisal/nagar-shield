# Nagar Shield — Screen Port Contract

> Generated from `prototype ui.html` by `tools/extract-screens.cjs`.
> Every screen in the prototype is listed here with its exact copy, layout order, and controls.
> The React Native build must reproduce these screens 1:1.

---

## Screen index

| # | data-screen | Name |
|---|---|---|
| 0 | 0 | Splash |
| 1 | 1 | S-00 Welcome |
| 2 | 2 | S-01 Phone |
| 3 | 3 | S-02 Alt Phone |
| 5 | 5 | S-04a Contact 1 |
| 6 | 6 | S-04b Contact 2 |
| 7 | 7 | S-04c Contact 3 |
| 8 | 8 | S-05 Location |
| 9 | 9 | S-06 Done |
| 11 | 11 | Login |
| 12 | 12 | Registration |
| 13 | 13 | Forgot Password |
| 14 | 14 | Home (Dashboard) |
| 15 | 15 | More Options |
| 16 | 16 | Settings |
| 17 | 17 | Capture (Report Crime) |
| 18 | 18 | Help Alert |
| 19 | 19 | Location Sharing |
| 20 | 20 | Emergency Contacts |
| 21 | 21 | History Overview |
| 22 | 22 | History Distribution |
| 23 | 23 | Charts (Admin App) |

---

## Screen specifications

### 0 — Splash

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `Nagar Shield`
- 🇧🇩 `শহরে, সদা সতর্ক`

**Layout classes used** (count):

- `right` ×1
- `splash-logo` ×1
- `splash-tagline` ×1
- `loading-dots` ×1

---

### 1 — S-00 Welcome

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `shield`
- `Welcome to`
- `Nagar Shield`
- `New here? Let's set up your safety profile — five quick steps so we can help when it matters most.`
- `What you'll add`
- `Phone · Alternate phone · Emergency contacts · Location`
- `Create my safety profile`
- `Already a user`
- `Log in to existing account`
- `New on this device?`
- `Create an account`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| Create my safety profile | button | `btn btn-primary btn-lg` | — | 2 |
| Log in to existing account | button | `btn btn-secondary btn-lg` | — | 11 |

**Layout classes used** (count):

- `ios-status` ×1
- `right` ×1
- `wizard-center` ×1
- `badge` ×1
- `wizard-sticky` ×1

---

### 2 — S-01 Phone

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `Setup ·`
- `Step 1 of 4`
- `Your safety profile`
- `Your`
- `phone number`
- `This is how we'll reach you when help is on the way. We never share it with other users.`
- `Mobile number (01XXXXXXXXX)`
- `lock`
- `Encrypted at rest. Used only by you and Nagar Shield.`
- `Continue`
- `Back`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| Continue | button | `btn btn-primary btn-lg` | — | 3 |

**Inputs**

- `type="tel" placeholder=" " id="wiz-phone-1"`

**Layout classes used** (count):

- `seg` ×3
- `ios-status` ×1
- `right` ×1
- `wizard-progress` ×1
- `seg active` ×1
- `wizard-step-label` ×1
- `wizard-hero` ×1
- `wizard-eyebrow` ×1
- `wizard-body` ×1
- `input-group` ×1
- `input-field` ×1
- `wizard-sticky` ×1

---

### 3 — S-02 Alt Phone

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `Setup ·`
- `Step 1 of 4`
- `Your safety profile`
- `An`
- `alternate number`
- `A second way to reach you if your primary number is unreachable. A close family member works well.`
- `Alternate mobile (01XXXXXXXXX)`
- `diversity_3`
- `Must be different from your primary number.`
- `Continue`
- `Back`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| Continue | button | `btn btn-primary btn-lg` | — | 4 |

**Inputs**

- `type="tel" placeholder=" " id="wiz-phone-2"`

**Layout classes used** (count):

- `seg` ×2
- `ios-status` ×1
- `right` ×1
- `wizard-progress` ×1
- `seg done` ×1
- `seg active` ×1
- `wizard-step-label` ×1
- `wizard-hero` ×1
- `wizard-eyebrow` ×1
- `wizard-body` ×1
- `input-group` ×1
- `input-field` ×1
- `wizard-sticky` ×1

---

### 5 — S-04a Contact 1

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `Setup ·`
- `Step 2 of 4`
- 🇧🇩 `Setup · ৪ ধাপ`
- `Add your`
- `first emergency contact`
- `Someone who will pick up if you call for help. Add three in total — family, close friends, anyone you trust.`
- `Contact 1`
- `Rahim Ahmed · 01712-345678`
- `check_circle`
- `Contact 2`
- `Not added yet`
- `chevron_right`
- `Contact 3`
- `Contact name`
- `Their mobile (01XXXXXXXXX)`
- `Save & continue`
- `Back`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| Save & continue | button | `btn btn-primary btn-lg` | — | 6 |

**Inputs**

- `type="text" placeholder=" " id="wiz-c1-name"`
- `type="tel" placeholder=" " id="wiz-c1-phone"`

**Layout classes used** (count):

- `slot-num` ×3
- `slot-text` ×3
- `slot-title` ×3
- `slot-sub` ×3
- `seg done` ×2
- `contact-slot` ×2
- `input-field` ×2
- `ios-status` ×1
- `right` ×1
- `wizard-progress` ×1
- `seg active` ×1
- `seg` ×1
- `wizard-step-label` ×1
- `wizard-hero` ×1

---

### 6 — S-04b Contact 2

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `Setup ·`
- `Step 2 of 4`
- 🇧🇩 `Setup · ৪ ধাপ`
- `Add a`
- `second contact`
- `One more. Three is the minimum — but you can add as many as you want after setup.`
- `Rahim Ahmed`
- `check_circle`
- `Contact 2`
- `Sumaiya Khan · 01815-234567`
- `Contact 3`
- `Add one more to finish`
- `chevron_right`
- `Contact name`
- `Their mobile (01XXXXXXXXX)`
- `Save & continue`
- `Back`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| Save & continue | button | `btn btn-primary btn-lg` | — | 7 |

**Inputs**

- `type="text" placeholder=" " id="wiz-c2-name"`
- `type="tel" placeholder=" " id="wiz-c2-phone"`

**Layout classes used** (count):

- `slot-num` ×3
- `slot-text` ×3
- `slot-title` ×3
- `slot-sub` ×3
- `seg done` ×2
- `contact-slot filled` ×2
- `input-field` ×2
- `ios-status` ×1
- `right` ×1
- `wizard-progress` ×1
- `seg active` ×1
- `seg` ×1
- `wizard-step-label` ×1
- `wizard-hero` ×1

---

### 7 — S-04c Contact 3

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `Setup ·`
- `Step 2 of 4`
- 🇧🇩 `Setup · ৪ ধাপ`
- `One more`
- `contact`
- `After this, location permission is the last step before Nagar Shield opens up.`
- `Rahim Ahmed`
- `check_circle`
- `Sumaiya Khan`
- `Contact 3`
- `Faisal Iqbal · 01933-456789`
- `verified_user`
- `All three saved.`
- `You can edit or add more contacts any time from Settings → Safety Profile.`
- `Continue to location`
- `Back`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| Continue to location | button | `btn btn-primary btn-lg` | — | 8 |

**Layout classes used** (count):

- `seg done` ×3
- `contact-slot filled` ×3
- `slot-num` ×3
- `slot-text` ×3
- `slot-title` ×3
- `slot-sub` ×3
- `ios-status` ×1
- `right` ×1
- `wizard-progress` ×1
- `seg active` ×1
- `wizard-step-label` ×1
- `wizard-hero` ×1
- `wizard-eyebrow` ×1
- `wizard-body` ×1

---

### 8 — S-05 Location

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `Setup ·`
- `Step 4 of 4 · last`
- `Almost done`
- `Allow`
- `location`
- `while using the app`
- `my_location`
- `lock`
- `What we do with location:`
- `Allow precise location`
- `Continue without location`
- `Back`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| Allow precise location | button | `btn btn-primary btn-lg` | — | 9 |

**Layout classes used** (count):

- `seg done` ×3
- `ios-status` ×1
- `right` ×1
- `wizard-progress` ×1
- `seg active` ×1
- `wizard-step-label` ×1
- `wizard-hero` ×1
- `wizard-eyebrow` ×1
- `location-illustration` ×1
- `ring r1` ×1
- `ring r2` ×1
- `pin` ×1
- `location-reassure` ×1
- `icon` ×1

---

### 9 — S-06 Done

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `check`
- `You're`
- `all set`
- `Your safety profile is saved. Nagar Shield is ready to help — and to call the right people — when you need it.`
- `Phone`
- `Alternate`
- `Emergency contacts`
- `3 saved`
- `Location`
- `Allowed`
- `Open Nagar Shield`
- `Edit my profile`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| Open Nagar Shield | button | `btn btn-primary btn-lg` | — | 14 |

**Layout classes used** (count):

- `summary-row` ×4
- `ios-status` ×1
- `right` ×1
- `wizard-center` ×1
- `summary-card` ×1
- `wizard-sticky` ×1

---

### 11 — Login

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `Nagar Shield`
- 🇧🇩 `শহরে, সদা সতর্ক`
- 🇧🇩 `স্বাগতম ফিরে আসায়`
- 🇧🇩 `আপনার অ্যাকাউন্টে প্রবেশ করুন`
- `mail`
- 🇧🇩 `ফোন বা ইমেইল`
- 🇧🇩 `যেকোনো একটি দিয়ে প্রবেশ করুন`
- `send`
- 🇧🇩 `OTP পাঠান`
- `lock`
- 🇧🇩 `OTP কোড (৬ সংখ্যা)`
- 🇧🇩 `✓ ইমেইলে কোড পাঠানো হয়েছে`
- 🇧🇩 `কোড পুনঃপাঠান (30s)`
- 🇧🇩 `OTP দিয়ে প্রবেশ`
- 🇧🇩 `অ্যাকাউন্ট নেই?`
- 🇧🇩 `সাইন আপ`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| 🇧🇩 send OTP পাঠান | button | `btn btn-secondary btn-lg` | — | — |
| 🇧🇩 OTP দিয়ে প্রবেশ | button | `btn btn-primary btn-lg` | — | 18 |

**Icons**: `mail`, `send`, `lock`

**Inputs**

- `type="text" placeholder=" " id="login-identifier"`
- `type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder=" " id="login-otp"`

**Layout classes used** (count):

- `input-group` ×2
- `ios-status` ×1
- `right` ×1
- `content auth-screen` ×1
- `brand-display` ×1
- `brand-display-logo` ×1
- `brand-display-name` ×1
- `brand-display-tag` ×1
- `auth-hero` ×1
- `input-helper` ×1

---

### 12 — Registration

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `arrow_back`
- `Nagar Shield`
- 🇧🇩 `আপনার অ্যাকাউন্ট তৈরি করুন`
- 🇧🇩 `একসাথে শহরকে নিরাপদ করি`
- 🇧🇩 `পূর্ণ নাম`
- 🇧🇩 `আপনার আসল নাম ব্যবহার করুন`
- `mail`
- 🇧🇩 `ইমেইল (প্রয়োজন)`
- 🇧🇩 `OTP ডিফল্টভাবে ইমেইলে যাবে — বিনামূল্যে`
- `phone`
- 🇧🇩 `ফোন (প্রয়োজন)`
- 🇧🇩 `SMS-এও OTP পাঠান (ঐচ্ছিক, অপারেটর চার্জ প্রযোজ্য)`
- `send`
- 🇧🇩 `OTP পাঠান`
- `lock`
- 🇧🇩 `OTP কোড (৬ সংখ্যা)`
- 🇧🇩 `✓ ইমেইলে কোড পাঠানো হয়েছে`
- 🇧🇩 `যাচাই করুন ও চালিয়ে যান`
- 🇧🇩 `অ্যাকাউন্ট তৈরি করার মাধ্যমে আপনি আমাদের শর্তাবলী মেনে নিচ্ছেন`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| arrow_back | button | `back-btn` | — | 11 |
| 🇧🇩 send OTP পাঠান | button | `btn btn-secondary btn-lg mt-16` | — | — |
| 🇧🇩 যাচাই করুন ও চালিয়ে যান | button | `btn btn-primary btn-lg` | — | 18 |

**Icons**: `arrow_back`, `mail`, `phone`, `send`, `lock`

**Inputs**

- `type="text" placeholder=" "`
- `type="email" placeholder=" "`
- `type="tel" placeholder=" "`
- `type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder=" "`

**Layout classes used** (count):

- `input-group` ×4
- `input-helper` ×2
- `ios-status` ×1
- `right` ×1
- `input-field` ×1

---

### 13 — Forgot Password

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `arrow_back`
- 🇧🇩 `অ্যাকাউন্ট পুনরুদ্ধার`
- 🇧🇩 `পাসওয়ার্ড ভুলে গেছেন?`
- 🇧🇩 `আপনার ইমেইল দিন, আমরা একটি`
- 🇧🇩 `রিসেট লিংক পাঠাবো`
- `mail`
- 🇧🇩 `ফোন বা ইমেইল`
- 🇧🇩 `OTP কোড পাঠান`
- 🇧🇩 `← লগইনে ফিরে যান`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| arrow_back | button | `back-btn` | — | 11 |
| 🇧🇩 OTP কোড পাঠান | button | `btn btn-primary btn-lg mt-16` | — | 11 |

**Icons**: `arrow_back`, `mail`

**Inputs**

- `type="text" placeholder=" "`

**Layout classes used** (count):

- `ios-status` ×1
- `right` ×1
- `app-bar` ×1
- `app-bar-title` ×1
- `input-group` ×1
- `text-center mt-24` ×1

---

### 14 — Home (Dashboard)

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- 🇧🇩 `সুপ্রভাত, রাহুল`
- `wb_sunny`
- 🇧🇩 `রবিবার, ৩০ আগস্ট`
- `more_horiz`
- 🇧🇩 `রা`
- `search`
- 🇧🇩 `দ্রুত অ্যাকশন`
- `photo_camera`
- 🇧🇩 `ক্যাপচার`
- 🇧🇩 `অপরাধ প্রমাণ`
- `notifications_active`
- 🇧🇩 `হেল্প অ্যালার্ট`
- 🇧🇩 `জরুরি সাহায্য (হোম)`
- `my_location`
- 🇧🇩 `লোকেশন শেয়ার`
- 🇧🇩 `৩জন সক্রিয়`
- `monitoring`
- 🇧🇩 `ক্রাইম হিস্ট্রি`
- 🇧🇩 `গত ৩০ দিন`
- `contact_emergency`
- 🇧🇩 `জরুরি কন্টাক্ট`
- 🇧🇩 `৫টি সংরক্ষিত`
- `grid_view`
- 🇧🇩 `আরও`
- 🇧🇩 `সেটিংস, গ্রুপ`
- `Auto-refreshes every 60s`
- `All BD`
- `My division`
- `My city`
- `Mirpur`
- `Dhanmondi`
- `backpack`
- 🇧🇩 `Mirpur · মিরপুর`
- 🇧🇩 `চুরি — Theft`
- `Bag snatching near Shah Ali Plaza`
- `5 min ago`
- `flag`
- 🇧🇩 `✎ বিস্তারিত দেখুন`
- `warning`
- 🇧🇩 `Dhanmondi · ধানমন্ডি`
- 🇧🇩 `আক্রমণ — Assault`
- `Argument escalating near lake`
- `22 min ago`
- `local_fire_department`
- 🇧🇩 `Uttara · উত্তরা`
- 🇧🇩 `আগুন — Fire`
- `Small fire in market area, fire service responding`
- `1 hr ago`
- `medical_services`
- 🇧🇩 `Gulshan · গুলশান`
- 🇧🇩 `চিকিৎসা — Medical`
- `Road accident near Gulshan-2 circle`
- `2 hr ago`
- `diamond`
- 🇧🇩 `Mohammadpur · মোহাম্মদপুর`
- 🇧🇩 `দুর্ঘটনা — Accident`
- `Two-wheeler collision at Town Hall intersection`
- `3 hr ago`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| more_horiz | button | `icon-btn` | — | 15 |
| flag | button | `` | — | — |
| flag | button | `` | — | — |
| flag | button | `` | — | — |
| flag | button | `` | — | — |
| flag | button | `` | — | — |

**Icons**: `more_horiz`, `search`, `photo_camera`, `notifications_active`, `my_location`, `monitoring`, `contact_emergency`, `grid_view`

**Inputs**

- `type="text" placeholder="এলাকা খুঁজুন..."`

**Layout classes used** (count):

- `action-card-label` ×6
- `action-card-sub` ×6
- `action-card-icon purple` ×3
- `ios-status` ×1
- `right` ×1
- `app-bar` ×1
- `greeting-block` ×1
- `date` ×1
- `avatar-sm` ×1
- `content` ×1
- `search-bar` ×1
- `section-title` ×1
- `quick-actions` ×1
- `action-card-icon red` ×1

---

### 15 — More Options

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `arrow_back`
- 🇧🇩 `আরও অপশন`
- 🇧🇩 `সেবা`
- `notifications`
- 🇧🇩 `নোটিফিকেশন`
- 🇧🇩 `৩টি নতুন`
- `arrow_forward_ios`
- `contact_page`
- 🇧🇩 `সংরক্ষিত কন্টাক্ট`
- 🇧🇩 `১২টি`
- `emergency`
- 🇧🇩 `জরুরি সেবা`
- 🇧🇩 `পুলিশ, হাসপাতাল, ফায়ার`
- 🇧🇩 `অ্যাকাউন্ট`
- `tune`
- 🇧🇩 `সেটিংস`
- `help`
- 🇧🇩 `সাহায্য ও সাপোর্ট`
- `info`
- 🇧🇩 `Nagar Shield সম্পর্কে`
- `v1.0.0 · AIUB`
- `logout`
- 🇧🇩 `লগ আউট`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| arrow_back | button | `back-btn` | — | 14 |

**Icons**: `arrow_back`, `notifications`, `contact_page`, `emergency`, `tune`, `help`, `info`

**Layout classes used** (count):

- `list-row-content` ×6
- `list-row-title` ×6
- `list-row` ×5
- `list-row-sub` ×4
- `list-section` ×2
- `list-section-header` ×2
- `list-row-icon red` ×2
- `list-row-icon gray` ×2
- `ios-status` ×1
- `right` ×1
- `app-bar` ×1
- `app-bar-title` ×1
- `content` ×1
- `list-row-icon amber` ×1

---

### 16 — Settings

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `arrow_back`
- 🇧🇩 `সেটিংস`
- 🇧🇩 `রা`
- 🇧🇩 `রাহুল আহমেদ`
- `rahul@example.com`
- 🇧🇩 `এডিট`
- 🇧🇩 `অ্যাকাউন্ট`
- `account_circle`
- 🇧🇩 `প্রোফাইল এডিট`
- `arrow_forward_ios`
- `badge`
- 🇧🇩 `পরিচয় পরিবর্তন (ফোন / ইমেইল)`
- 🇧🇩 `পছন্দ`
- `language`
- 🇧🇩 `ভাষা`
- 🇧🇩 `বাংলা`
- `dark_mode`
- 🇧🇩 `ডার্ক মোড`
- 🇧🇩 `চোখের জন্য আরামদায়ক`
- 🇧🇩 `নিরাপত্তা`
- `sms`
- 🇧🇩 `SMS-এ ও OTP পাঠান`
- 🇧🇩 `ক্যারিয়ার চার্জ প্রযোজ্য হতে পারে`
- 🇧🇩 `সম্পর্কে`
- `info`
- 🇧🇩 `Nagar Shield সম্পর্কে`
- `v1.0.0`
- `star`
- 🇧🇩 `অ্যাপ রেট করুন`
- `ios_share`
- 🇧🇩 `অ্যাপ শেয়ার করুন`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| arrow_back | button | `back-btn` | — | 14 |

**Icons**: `arrow_back`, `account_circle`, `badge`, `language`, `dark_mode`, `sms`, `info`, `star`, `ios_share`

**Toggle/state classes**: `toggle`

**Layout classes used** (count):

- `list-row` ×8
- `list-row-content` ×8
- `list-row-title` ×8
- `list-section` ×4
- `list-section-header` ×4
- `list-row-icon purple` ×3
- `list-row-sub` ×3
- `list-row-icon green` ×2
- `list-row-icon amber` ×2
- `ios-status` ×1
- `right` ×1
- `app-bar` ×1
- `app-bar-title` ×1
- `content` ×1

---

### 17 — Capture (Report Crime)

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `close`
- 🇧🇩 `অপরাধ রিপোর্ট করুন`
- 🇧🇩 `আপনার সাক্ষ্য অন্যদের সুরক্ষিত রাখবে`
- `visibility_off`
- 🇧🇩 `বেনামী রিপোর্ট`
- 🇧🇩 `আপনার পরিচয় সম্পূর্ণ গোপন থাকবে`
- `videocam`
- 🇧🇩 `ভিডিও ক্যাপচার করুন`
- 🇧🇩 `সর্বোচ্চ ৬০ সেকেন্ড`
- `arrow_forward_ios`
- `photo_camera`
- 🇧🇩 `ছবি তুলুন`
- 🇧🇩 `অথবা গ্যালারি থেকে নির্বাচন করুন`
- `attach_file`
- 🇧🇩 `ফাইল আপলোড করুন`
- 🇧🇩 `PDF, DOC — সর্বোচ্চ ১০MB`
- 🇧🇩 `দৃশ্যের বর্ণনা`
- `0 / 140`
- `location_on`
- 🇧🇩 `বসুন্ধরা R/A, ঢাকা`
- 🇧🇩 `অটো-ডিটেক্টেড · ±৫ মিটার`
- 🇧🇩 `পরিবর্তন`
- `send`
- 🇧🇩 `রিপোর্ট পাঠান`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| close | button | `icon-btn` | — | 14 |
| 🇧🇩 send রিপোর্ট পাঠান | button | `btn btn-primary btn-lg` | — | — |

**Icons**: `close`, `visibility_off`, `videocam`, `photo_camera`, `attach_file`, `location_on`, `send`

**Toggle/state classes**: `toggle on`

**Layout classes used** (count):

- `upload-card-icon` ×3
- `upload-card-info` ×3
- `upload-card-title` ×3
- `upload-card-sub` ×3
- `upload-card` ×2
- `ios-status` ×1
- `right` ×1
- `app-bar-title` ×1
- `content` ×1
- `capture-anon` ×1
- `icon-circle` ×1
- `capture-anon-content` ×1
- `capture-anon-label` ×1
- `capture-anon-helper` ×1

---

### 18 — Help Alert

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `emergency`
- 🇧🇩 `জরুরি সাহায্য`
- 🇧🇩 `এক টোকায় সাহায্য পান`
- `local_police`
- 🇧🇩 `পুলিশ`
- 🇧🇩 `নিকটবর্তী থানায় কল`
- `Police`
- 🇧🇩 `৯৯৯`
- `call`
- `local_hospital`
- 🇧🇩 `মেডিকেল`
- 🇧🇩 `নিকটবর্তী হাসপাতালে কল`
- `Medical`
- `local_fire_department`
- 🇧🇩 `ফায়ার সার্ভিস`
- 🇧🇩 `নিকটবর্তী ফায়ার স্টেশনে কল`
- `Fire Service`
- 🇧🇩 `১০২`
- `groups_2`
- 🇧🇩 `বিশ্বস্ত পরিচিত`
- 🇧🇩 `আপনার ৫টি সংরক্ষিত কন্টাক্ট`
- `Personal Contacts`
- 🇧🇩 `৫ জন`
- `more_horiz`
- 🇧🇩 `আরও সাহায্য`
- 🇧🇩 `অন্যান্য জরুরি নম্বর ও সেবা`
- `chevron_right`
- 🇧🇩 `আরও জরুরি নম্বর`
- 🇧🇩 `নারী ও শিশু হেল্পলাইন`
- 🇧🇩 `দুর্যোগ হেল্পলাইন`
- 🇧🇩 `অ্যাম্বুলেন্স`
- 🇧🇩 `বিদ্যুৎ অভিযোগ`
- 🇧🇩 `নিকটবর্তী থানা`
- 🇧🇩 `সবচেয়ে কাছের থানায় কল`
- 🇧🇩 `১০ কিমি-র মধ্যে কোনো থানা না পেলে ৯৯৯-এ রাউট করা হবে।`
- 🇧🇩 `ম্যাপে স্টেশন খুঁজুন`
- 🇧🇩 `হাসপাতাল · ফায়ার · থানা`
- `map`
- 🇧🇩 `নম্বর ভুল? রিপোর্ট করুন →`
- 🇧🇩 `বন্ধ করুন`
- 🇧🇩 `কলগুলি নিকটবর্তী উপলব্ধ সেবায় স্বয়ংক্রিয়ভাবে রাউট করা হয়`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| 🇧🇩 নম্বর ভুল? রিপোর্ট করুন → | a | `` | — | — |
| 🇧🇩 বন্ধ করুন | button | `` | — | — |

**Icons**: `local_police`, `call`, `local_hospital`, `local_fire_department`, `groups_2`

**Layout classes used** (count):

- `help-card-icon` ×4
- `help-card-content` ×4
- `help-card-title` ×4
- `help-card-sub` ×4
- `help-card-en` ×4
- `help-card-right` ×4
- `help-card-phone` ×4
- `help-card-circle` ×4
- `ios-status` ×1
- `right` ×1
- `help-header` ×1

---

### 19 — Location Sharing

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `arrow_back`
- 🇧🇩 `লোকেশন শেয়ার`
- 🇧🇩 `আপনি এখানে`
- `location_on`
- 🇧🇩 `আপনার বর্তমান লোকেশন`
- 🇧🇩 `বাড়ি ১২, রোড ৭, বসুন্ধরা R/A, ঢাকা`
- `23.7806° N, 90.4066° E`
- 🇧🇩 `সবার সাথে শেয়ার করুন`
- 🇧🇩 `আপনার সব জরুরি কন্টাক্ট দেখতে পাবে`
- 🇧🇩 `অথবা নির্দিষ্ট কাউকে`
- 🇧🇩 `মা`
- 🇧🇩 `০১৭১২-৩৪৫৬৭৮`
- 🇧🇩 `সাকিব হোসেন`
- 🇧🇩 `০১৮১৫-৬৫৪৩২১`
- 🇧🇩 `তানভীর`
- 🇧🇩 `০১৯৩৩-২২১১৪৪`
- `ios_share`
- 🇧🇩 `শেয়ার করুন`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| arrow_back | button | `back-btn` | — | 14 |
| 🇧🇩 ios_share শেয়ার করুন | button | `btn btn-primary btn-lg` | — | — |

**Icons**: `arrow_back`, `ios_share`

**Toggle/state classes**: `share-toggle-row`, `share-toggle-content`, `share-toggle-title`, `share-toggle-sub`, `toggle on`

**Layout classes used** (count):

- `contact-row` ×3
- `contact-info` ×3
- `contact-name` ×3
- `contact-phone` ×3
- `ios-status` ×1
- `right` ×1
- `app-bar` ×1
- `app-bar-title` ×1
- `content` ×1
- `map-preview` ×1
- `map-roads` ×1
- `map-pin-label` ×1
- `map-pin-dot` ×1
- `map-pin-pulse` ×1

---

### 20 — Emergency Contacts

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `arrow_back`
- 🇧🇩 `জরুরি কন্টাক্ট`
- `Personal Emergency dials your`
- `★ primary contacts`
- `first.`
- `If no answer, it moves to the next primary, then the rest.`
- 🇧🇩 `পরিবার (২)`
- 🇧🇩 `মা`
- 🇧🇩 `০১৭১২-৩৪৫৬৭৮`
- 🇧🇩 `পরিবার`
- `call`
- 🇧🇩 `বা`
- 🇧🇩 `বাবা`
- 🇧🇩 `০১৭১১-৯৮৭৬৫৪`
- 🇧🇩 `বন্ধু (২)`
- 🇧🇩 `সাকিব হোসেন`
- 🇧🇩 `০১৮১৫-৬৫৪৩২১`
- 🇧🇩 `বন্ধু`
- 🇧🇩 `মি`
- 🇧🇩 `মিথুন`
- 🇧🇩 `০১৯৩৩-২২১১৪৪`
- 🇧🇩 `সহকর্মী (১)`
- 🇧🇩 `তানভীর`
- 🇧🇩 `সহকর্মী`
- `add`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| arrow_back | button | `back-btn` | — | 14 |
| add | button | `fab` | — | — |

**Icons**: `arrow_back`, `call`, `add`

**Layout classes used** (count):

- `contact-row` ×5
- `contact-info` ×5
- `contact-name` ×5
- `contact-phone` ×5
- `contact-action` ×5
- `section-group-title` ×3
- `contact-avatar family` ×2
- `contact-avatar friend` ×2
- `ios-status` ×1
- `right` ×1
- `app-bar` ×1
- `app-bar-title` ×1
- `content` ×1
- `contact-avatar colleague` ×1

---

### 21 — History Overview

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `arrow_back`
- 🇧🇩 `ক্রাইম হিস্ট্রি`
- `location_on`
- 🇧🇩 `বসুন্ধরা R/A, ঢাকা`
- `keyboard_arrow_down`
- 🇧🇩 `ধরন`
- 🇧🇩 `মোট`
- 🇧🇩 `বিতরণ`
- `map`
- 🇧🇩 `ম্যাপ ভিউ`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| arrow_back | button | `back-btn` | — | 14 |

**Icons**: `arrow_back`, `location_on`

**Layout classes used** (count):

- `ios-status` ×1
- `right` ×1
- `app-bar` ×1
- `app-bar-title` ×1
- `content` ×1
- `location-pill` ×1
- `segmented-tabs` ×1
- `segmented-tab active` ×1

---

### 22 — History Distribution

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `arrow_back`
- 🇧🇩 `ক্রাইম হিস্ট্রি`
- `map`
- `Map + list view coming soon`
- `Back to Home`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| arrow_back | button | `back-btn` | — | 14 |
| Back to Home | button | `` | — | 14 |

**Icons**: `arrow_back`

**Layout classes used** (count):

- `ios-status` ×1
- `right` ×1
- `app-bar` ×1
- `app-bar-title` ×1

---

### 23 — Charts (Admin App)

**Copy** (Bangla strings marked 🇧🇩):

- `signal_cellular_alt`
- `wifi`
- `battery_full`
- `close`
- 🇧🇩 `ক্রাইম বিশ্লেষণ`
- `ios_share`
- `analytics`
- `Coming soon — admin app`
- `Back to Home`
- 🇧🇩 `৭ দিন`
- 🇧🇩 `৩০ দিন`
- 🇧🇩 `৬ মাস`
- 🇧🇩 `১ বছর`
- 🇧🇩 `৪৭`
- 🇧🇩 `মোট`
- 🇧🇩 `১.৫`
- 🇧🇩 `গড়/দিন`
- 🇧🇩 `সর্বোচ্চ`
- 🇧🇩 `দৈনিক ক্রাইম প্রবণতা`
- 🇧🇩 `১ সেপ`
- 🇧🇩 `১০ সেপ`
- 🇧🇩 `২০ সেপ`
- 🇧🇩 `৩০ সেপ`
- 🇧🇩 `ক্রাইম ধরন বিশ্লেষণ`
- 🇧🇩 `চুরি`
- 🇧🇩 `৪০`
- 🇧🇩 `৮৫%`
- 🇧🇩 `সম্পত্তি ক্ষতি`
- 🇧🇩 `২৮`
- 🇧🇩 `৬০%`
- 🇧🇩 `অন্যান্য`
- 🇧🇩 `২১`
- 🇧🇩 `৪৫%`

**Controls**

| Label | Tag | Class | Icon | data-nav |
|---|---|---|---|---|
| close | button | `back-btn` | — | 14 |
| ios_share | button | `icon-btn` | — | — |
| Back to Home | button | `` | — | 14 |

**Icons**: `close`, `ios_share`

**Layout classes used** (count):

- `time-chip` ×3
- `stat-card` ×3
- `big-num` ×3
- `label` ×3
- `ios-status` ×1
- `right` ×1
- `app-bar` ×1
- `app-bar-title` ×1
- `time-chips` ×1
- `time-chip active` ×1

---

## Navigation graph

| From | Screen | → data-nav target |
|---|---|---|
| 1 | S-00 Welcome | 2 |
| 1 | S-00 Welcome | 11 |
| 1 | S-00 Welcome | 12 |
| 2 | S-01 Phone | 3 |
| 2 | S-01 Phone | 1 |
| 3 | S-02 Alt Phone | 4 |
| 3 | S-02 Alt Phone | 2 |
| 5 | S-04a Contact 1 | 6 |
| 5 | S-04a Contact 1 | 4 |
| 6 | S-04b Contact 2 | 7 |
| 6 | S-04b Contact 2 | 5 |
| 7 | S-04c Contact 3 | 8 |
| 7 | S-04c Contact 3 | 6 |
| 8 | S-05 Location | 9 |
| 8 | S-05 Location | 7 |
| 9 | S-06 Done | 14 |
| 9 | S-06 Done | 16 |
| 11 | Login | 18 |
| 11 | Login | 12 |
| 12 | Registration | 11 |
| 12 | Registration | 18 |
| 13 | Forgot Password | 11 |
| 14 | Home (Dashboard) | 15 |
| 14 | Home (Dashboard) | 17 |
| 14 | Home (Dashboard) | 18 |
| 14 | Home (Dashboard) | 19 |
| 14 | Home (Dashboard) | 21 |
| 14 | Home (Dashboard) | 20 |
| 15 | More Options | 14 |
| 15 | More Options | 17 |
| 15 | More Options | 11 |
| 16 | Settings | 14 |
| 17 | Capture (Report Crime) | 14 |
| 19 | Location Sharing | 14 |
| 20 | Emergency Contacts | 14 |
| 21 | History Overview | 14 |
| 21 | History Overview | 21 |
| 21 | History Overview | 22 |
| 21 | History Overview | 23 |
| 22 | History Distribution | 14 |
| 23 | Charts (Admin App) | 14 |

Targets not present as a screen (modals / sheets / dead ends):

- `4`

---

## JavaScript behaviour

### Script block 1

```js
let currentScreen = 0;
const screens = document.querySelectorAll('.screen');
// Ordered list of screen ids (string). Includes "21a" sub-screens.
const screenOrder = Array.from(screens).map(s => s.dataset.screen);

function goToScreen(target) {
  // Accept either a string id (e.g. "3", "21a") or a numeric index into screenOrder.
  let id;
  if (typeof target === 'number') {
    if (target < 0 || target >= screenOrder.length) return;
    id = screenOrder[target];
  } else {
    id = String(target);
    if (!screenOrder.includes(id)) return;
  }
  const index = screenOrder.indexOf(id);
  const currentEl = document.querySelector(`.screen[data-screen="${currentScreen}"]`);
  const targetEl = document.querySelector(`.screen[data-screen="${id}"]`);
  if (currentScreen === id) return;

  currentEl.classList.remove('active');
  currentEl.classList.add('exit-left');

  setTimeout(() => currentEl.classList.remove('exit-left'), 350);

  targetEl.classList.add('active');
  currentScreen = id;

  // Update indicator
  document.getElementById('screen-indicator').textContent = targetEl.dataset.name;

  // Update buttons
  document.getElementById('prev-btn').disabled = (index === 0);
  document.getElementById('next-btn').disabled = (index === screenOrder.length - 1);

  // Update screen-map buttons (compare as strings — works for "21a")
  document.querySelectorAll('.screen-map button').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.nav === String(id)) btn.classList.add('active');
  });

  // Scroll to top of new screen
  setTimeout(() => {
    const content = targetEl.querySelector('.content');
    if (content) content.scrollTop = 0;
    targetEl.scrollTop = 0;
  }, 50);
}

function nextScreen() {
  const idx = screenOrder.indexOf(currentScreen);
  if (idx < screenOrder.length - 1) goToScreen(screenOrder[idx + 1]);
}
function prevScreen() {
  const idx = screenOrder.indexOf(currentScreen);
  if (idx > 0) goToScreen(screenOrder[idx - 1]);
}

// In-screen navigation (data-nav attribute on any element)
document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-nav]');
  if (target) {
    const to = target.dataset.nav;
    if (to !== undefined && to !== '') goToScreen(to);
  }
});

// Direct nav buttons
document.querySelectorAll('.screen-map button').forEach(btn => {
  btn.addEventListener('click', () => {
    const to = btn.dataset.nav;
    if (to !== undefined && to !== '') goToScreen(to);
  });
});

// Keyboard navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); nextScreen(); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); prevScreen(); }
});

// SMS-OTP opt-in helpers (FR-AUTH-3, auth-edge-cases.md L72)
// Per-session: the disclosure modal shows the first time the user
// interacts with the toggle. After confirming, sessionStorage records
// sms_disclosure_acked; subsequent clicks flip the toggle directly.
// Real implementation also fires `otp_channel_switched` telemetry here.
const SMS_DISCLOSURE_KEY = 'sms_disclosure_acked';
const SMS_OPTIN_KEY = 'sms_opted_in';

function smsToggleClick() {
  const toggle = document.getElementById('sms-otp-toggle');
  const acked = sessionStorage.getItem(SMS_DISCLOSURE_KEY) === 'true';
  if (acked) {
    // Already acknowledged this session — flip the toggle directly.
    toggle.classList.toggle('on');
    const isOn = toggle.classList.contains('on');
    if (isOn) {
      sessionStorage.setItem(SMS_OPTIN_KEY, 'true');
      const toast = document.getElementById('sms-optin-toast');
      toast.style.display = 'flex';
      setTimeout(() => toast.style.display = 'none', 2400);
    } else {
      sessionStorage.removeItem(SMS_OPTIN_KEY);
    }
  } else {
    // First interaction this session — show the disclosure modal.
    document.getElementById('sms-disclosure-dialog').style.display = 'flex';
  }
}

function smsConfirmOptIn() {
  // User confirmed in the disclosure modal.
  sessionStorage.setItem(SMS_DISCLOSURE_KEY, 'true');
  sessionStorage.setItem(SMS_OPTIN_KEY, 'true');
  // Fire telemetry (logged to console in prototype; real impl posts to backend).
  console.info('[telemetry] otp_channel_switched: sms');
  console.info('[telemetry] disclosure_acknowledged', { surface: 'sms-otp' });
  document.getElementById('sms-disclosure-dialog').style.display = 'none';
  document.getElementById('sms-otp-toggle').classList.add('on');
  const toast = document.getElementById('sms-optin-toast');
  toast.style.display = 'flex';
  setTimeout(() => toast.style.display = 'none', 2400);
}

function smsCancelOptIn() {
  // User cancelled — close modal, do NOT flip the toggle, do NOT persist.
  document.getElementById('sms-disclosure-dialog').style.display = 'none';
  // Ensure the toggle stays off (it may not have been on in the first place).
  document.getElementById('sms-otp-toggle').classList.remove('on');
  sessionStorage.removeItem(SMS_OPTIN_KEY);
  console.info('[telemetry] disclosure_cancelled', { surface: 'sms-otp' });
}

// Help Alert telemetry — called from each help-card click in S18.
// Confirms the tap reached the dialer intent (consent sheet is a future
// epic; this logs the discovery moment so we can measure dial-rate later).
function helpAlertTap(surface, number) {
  console.info('[telemetry] help_alert_tap', { surface, number });
}

// On page load, restore the toggle state if the user opted in earlier
// in the session (e.g. navigated away to Settings and back).
(function restoreSmsOptIn() {
  if (sessionStorage.getItem(SMS_OPTIN_KEY) === 'true') {
    const toggle = document.getElementById('sms-otp-toggle');
    if (toggle) toggle.classList.add('on');
  }
})();

// ---------------------------------------------------------------------------
// Dark-mode toggle (S16 Settings)
// ---------------------------------------------------------------------------
//
// DESIGN.md marks dark as the default panic-moment theme; this toggle lets
// the user opt back to light. Preference persists in localStorage so it
// survives reloads — this is a deliberate UX setting, not a session-start
// disclosure like the SMS-OTP carrier-charge modal.

const THEME_KEY = 'nagar_shield_theme';

function applyTheme(theme) {
  // Reflect on <html data-theme="...">; CSS handles the override block.
  document.documentElement.dataset.theme = theme;
  const toggle = document.getElementById('dark-mode-toggle');
  if (toggle) {
    // Toggle is "on" when in dark mode.
    toggle.classList.toggle('on', theme === 'dark');
    toggle.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  }
}

function toggleDarkMode(el) {
  const current = document.documentElement.dataset.theme || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* private mode */ }
}

// On page load, restore the user's saved preference; default to dark.
(function restoreTheme() {
  let theme = 'dark';
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch (e) { /* private mode: fall back to default */ }
  applyTheme(theme);
})();

// Splash → S-00 Welcome auto-advance after 2.8s
setTimeout(() => {
  if (currentScreen === 0) goToScreen(1);
}, 2800);

// Safety Profile wizard — single-select chip picker (used on Blood Group screen)
document.querySelectorAll('.chip-grid, .blood-group-grid').forEach((grid) => {
  grid.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    grid.querySelectorAll('.chip').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
  });
});

/* ===== Phone Frame Auto-Fit =====
   Sizes the .phone-stage wrapper so it matches the visually
   scaled .phone-frame, keeping the phone fully inside the
   viewport. Layout is horizontal: phone on the left, brand +
   nav + screen map on the right. Phone now uses nearly the
   full viewport height (header was moved to the sidebar). */
(function fitPhone() {
  const stage = document.querySelector('.phone-stage');
  const phone = document.querySelector('.phone-frame');
  const sidebar = document.querySelector('.sidebar-column');
  if (!stage || !phone) return;

  const NATIVE_W = 390;
  const NATIVE_H = 844;
  const SAFETY = 12;

  function compute() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const padX = vw <= 768 ? 16 : 40;
    const padY = vw <= 768 ? 16 : 40;

    const availableW = vw - padX;
    const availableH = vh - padY - SAFETY;

    // Account for the sidebar's width so the phone doesn't push it off-screen.
    const sidebarW = sidebar ? sidebar.getBoundingClientRect().width : 0;
    const containerGap = 32; // matches .app-container gap
    const widthForPhone = availableW - sidebarW - containerGap;
    const scaleW = Math.max(0.3, widthForPhone / NATIVE_W);
    const scaleH = availableH / NATIVE_H;

    // Higher cap so phone grows taller on laptops; floor so it stays usable.
    const scale = Math.min(scaleW, scaleH, 1.6);
    const clamped = Math.max(0.5, scale);

    stage.style.setProperty('--phone-scale', clamped.toFixed(4));
    document.documentElement.style.setProperty('--phone-scale', clamped.toFixed(4));
  }

  compute();
  window.addEventListener('resize', compute, { passive: true });
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(compute).catch(() => {});
  }
  setTimeout(compute, 100);
  setTimeout(compute, 500);
})();
```

### Script block 2

```js
document.addEventListener('click', (e) => {
  const flag = e.target.closest('[data-dialog="flag"]');
  if (flag) { e.preventDefault(); document.getElementById('flag-dialog').style.display='flex'; }
});
```

---

## Inline-style census

Total inline `style="..."` attributes: 388
Of which contain a gradient: 3

Inline styles are **not** covered by the `:root` token block — each one must be copied verbatim into the RN implementation.

| Inline style |
|---|
| `accent-color:var(--violet-600);` |
| `background: linear-gradient(135deg, #10B981, #059669); box-shadow: 0 8px 24px rgba(16,185,129,0.35);` |
| `background:linear-gradient(135deg,var(--green-500),var(--green-600));` |
| `background:var(--grad-primary);color:white;border:none;padding:12px 24px;border-radius:999px;font-size:14px;font-weight:600;cursor:pointer;` |
| `background:var(--grad-primary);color:white;padding:8px 14px;border-radius:999px;font-size:12px;font-weight:600;flex-shrink:0;` |
| `background:var(--purple-100); color:var(--purple-700); padding:4px 10px; border-radius:999px; font-size:11px; font-weight:600;` |
| `background:var(--red-600); color:white; font-size:11px; padding:2px 8px; border-radius:999px; font-weight:700;` |
| `background:var(--surface-white); border-radius:24px 24px 0 0; padding:24px 20px calc(20px + 24px); width:100%; max-width:390px;` |
| `background:var(--surface-white); width:100%; max-width:480px; border-radius:24px 24px 0 0; padding:24px 20px 20px; align-self:flex-end;` |
| `background:var(--surface-white);border:1px solid var(--ink-200);padding:8px 14px;border-radius:999px;font-size:12px;font-weight:600;color:var(--ink-700);flex-shrink:0;` |
| `background:white;` |
| `color: var(--green-600);` |
| `color:var(--green-600);` |
| `color:var(--ink-400);` |
| `color:var(--ink-400); font-size:18px;` |
| `color:var(--red-600); display:flex; align-items:center; gap:6px;` |
| `color:var(--violet-700);` |
| `color:var(--violet-700); cursor:pointer; font-weight:600;` |
| `color:var(--violet-800);` |
| `color:white;` |
| `color:white; font-size:26px; margin-bottom:8px;` |
| `cursor:pointer;` |
| `display:flex; align-items:center; gap:12px; margin-bottom:12px;` |
| `display:flex; align-items:center; gap:12px; margin-bottom:8px;` |
| `display:flex; align-items:center; gap:12px; padding:8px 20px;` |
| `display:flex; align-items:center; gap:6px;` |
| `display:flex; align-items:center; gap:8px; margin-top:14px; font-size:12px; color:var(--ink-500);` |
| `display:flex; align-items:center; gap:8px; margin-top:8px; font-size:12px; color:var(--ink-600);` |
| `display:flex; align-items:center; gap:8px; margin:14px 0 6px;` |
| `display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:32px 24px;` |
| `display:flex; flex-direction:column; gap:6px; margin-bottom:14px;` |
| `display:flex; flex-wrap:wrap; gap:8px; padding:0 4px 16px;` |
| `display:flex; gap:12px; align-items:center;` |
| `display:flex; gap:8px; align-items:center;` |
| `display:flex; justify-content:space-between; margin-top:8px; font-size:10px; color:var(--ink-500);` |
| `display:flex; justify-content:space-between; padding:8px 0;` |
| `display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid var(--ink-50);` |
| `display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--ink-50);border-radius:12px;cursor:pointer;font-size:14px;` |
| `display:flex;flex-direction:column;gap:8px;` |
| `display:flex;flex-direction:column;gap:8px;margin-bottom:16px;` |
| `display:flex;gap:8px;overflow-x:auto;padding:0 20px 12px;scrollbar-width:none;` |
| `display:flex;justify-content:space-between;align-items:center;padding:14px 16px;background:var(--ink-50);border-radius:12px;` |
| `display:inline-flex; align-items:center; gap:8px;` |
| `display:none;` |
| `display:none; margin-top:16px;` |
| `display:none; position:absolute; inset:0; background:rgba(0,0,0,0.55); z-index:200; align-items:flex-end; justify-content:center;` |
| `display:none; position:fixed; bottom:96px; left:50%; transform:translateX(-50%); background:var(--ink-950); color:white; padding:12px 20px; border-radius:999px; font-size:14px; font-weight:600; align-items:center; gap:8px; z-index:400; box-shadow:0 12px 28px rgba(0,0,0,0.28);` |
| `display:none; position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:250; align-items:flex-end; justify-content:center;` |
| `display:none; position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:260; align-items:flex-end; justify-content:center;` |
| `display:none; position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:300; align-items:flex-end; justify-content:center;` |
| `display:none; position:fixed; left:50%; bottom:96px; transform:translateX(-50%); background:var(--ink-900); color:white; padding:12px 20px; border-radius:999px; font-size:13px; font-weight:500; z-index:400; box-shadow:0 8px 24px rgba(0,0,0,0.25);` |
| `flex:1;` |
| `flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center;` |
| `flex:1; height:1px; background:var(--ink-100);` |
| `flex:1; height:1px; background:var(--ink-200);` |
| `flex:1; min-width:0;` |
| `font-size:10px;color:var(--ink-400);font-style:italic;margin-top:4px;line-height:1.4;` |
| `font-size:11px; color:var(--ink-500);` |
| `font-size:11px; color:var(--ink-500); letter-spacing:0.08em; text-transform:uppercase;` |
| `font-size:11px; color:var(--ink-500); letter-spacing:0.08em; text-transform:uppercase; font-weight:600;` |
| `font-size:11px; color:var(--ink-500); line-height:1.5;` |
| `font-size:11px;color:var(--ink-500);` |
| `font-size:11px;color:var(--ink-500);font-weight:600;` |
| `font-size:11px;color:var(--ink-500);margin-top:6px;` |
| `font-size:11px;color:var(--violet-700);font-weight:600;margin-top:6px;cursor:pointer;` |
| `font-size:12px;` |
| `font-size:12px; color:var(--ink-500);` |
| `font-size:12px; color:var(--ink-500); line-height:1.5; margin:0 0 16px;` |
| `font-size:12px; color:var(--ink-500); margin-top:4px;` |
| `font-size:12px; color:var(--ink-500); margin:0 4px 12px; line-height:1.5;` |
| `font-size:12px; line-height:1.5; color:var(--ink-700);` |
| `font-size:12px;color:var(--ink-500);margin-top:2px;` |
| `font-size:13px; color:var(--ink-700);` |
| `font-size:13px; color:var(--ink-700); line-height:1.5; margin:0 0 14px;` |
| `font-size:13px; color:var(--ink-700); line-height:1.7;` |
| `font-size:13px; font-weight:600; color:var(--ink-950);` |
| `font-size:13px; font-weight:600; color:var(--ink-950); margin-bottom:12px;` |
| `font-size:13px; font-weight:600; color:var(--ink-950); margin-bottom:16px;` |
| `font-size:13px; font-weight:600; color:var(--ink-950); margin-bottom:8px;` |
| `font-size:13px;color:var(--ink-500);margin-bottom:16px;` |
| `font-size:13px;color:var(--ink-600);line-height:1.4;` |
| `font-size:14px;` |
| `font-size:14px; color:var(--ink-600);` |
| `font-size:14px; color:var(--ink-600); line-height:1.5; max-width:280px; margin:0 0 24px;` |
| `font-size:14px; color:var(--ink-600); text-align:center; margin-bottom:40px; line-height:1.5;` |
| `font-size:14px; color:var(--ink-700); line-height:1.6; margin:4px 0 16px;` |
| `font-size:14px; color:var(--ink-700); line-height:1.6; margin:8px 0 4px;` |
| `font-size:14px; font-weight:700; color:var(--ink-950); margin:6px 4px 10px;` |
| `font-size:15px; font-weight:600; color:var(--ink-950); margin-bottom:2px;` |
| `font-size:15px;font-weight:700;color:var(--ink-950);` |
| `font-size:15px;font-weight:700;color:var(--ink-950);margin:2px 0 4px;` |
| `font-size:16px;` |
| `font-size:16px; color:var(--violet-600);` |
| `font-size:18px;` |
| `font-size:18px; color:var(--violet-700); margin-top:1px;` |
| `font-size:18px; font-weight:700; color:var(--ink-950);` |
| `font-size:18px;font-weight:700;color:var(--ink-950);margin-bottom:16px;` |
| `font-size:18px;font-weight:700;color:var(--ink-950);margin-bottom:4px;` |
| `font-size:20px;` |
| `font-size:20px; color:var(--amber-600); font-variation-settings:'FILL' 1;` |
| `font-size:20px; font-weight:700; color:var(--ink-950); margin:0 0 8px;` |
| `font-size:22px;` |
| `font-size:24px;` |
| `font-size:24px; font-weight:600; color:var(--ink-950); margin-bottom:8px; text-align:center;` |
| `font-size:32px;` |
| `font-size:42px;` |
| `font-size:46px;` |
| `font-size:48px;` |
| `font-weight:600;font-size:14px;` |
| `font-weight:700; color:var(--purple-700);` |
| `height:40px;` |
| `height:60px;` |
| `height:80px;` |
| `margin-bottom:24px;` |
| `margin-left:auto; color:var(--ink-400);` |
| `margin-right:4px;` |
| `margin-top:0;` |
| `margin-top:10px; font-size:13px; color:var(--ink-500);` |
| `margin-top:14px; padding:0 4px; font-size:11px; color:var(--ink-500); text-align:right;` |
| `margin-top:14px; width:100%; height:52px; background:var(--grad-primary); color:white; border:none; border-radius:14px; font-weight:600; font-size:15px; cursor:pointer;` |
| `margin-top:16px;width:100%;height:48px;background:var(--violet-50);color:var(--violet-700);border:none;border-radius:14px;font-weight:600;font-size:15px;` |
| `margin-top:18px;` |
| `margin-top:18px; padding:14px; border-radius:var(--r-lg); background:var(--violet-50); border:1px solid var(--violet-200); display:flex; gap:10px; align-items:flex-start;` |
| `margin-top:24px;` |
| `margin-top:40px; margin-bottom:24px;` |
| `margin-top:8px; width:100%; height:44px; background:transparent; color:var(--ink-500); border:none; font-weight:500; font-size:14px; cursor:pointer;` |
| `margin-top:8px; width:100%; height:52px; background:var(--grad-primary); color:white; border:none; border-radius:14px; font-weight:600; font-size:15px; cursor:pointer;` |
| `margin-top:8px;width:100%;height:44px;background:transparent;color:var(--ink-500);border:none;font-weight:500;font-size:14px;` |
| `margin: 0 20px 8px; display:flex; align-items:center; gap:6px; font-size:11px; color:var(--ink-500); font-weight:600;` |
| `margin:0 20px 10px;padding:14px 16px;background:var(--surface-white);border:1px solid var(--ink-100);border-left:4px solid #5D4037;border-radius:14px;display:flex;gap:12px;box-shadow:var(--shadow-card);position:relative;` |
| `margin:0 20px 10px;padding:14px 16px;background:var(--surface-white);border:1px solid var(--ink-100);border-left:4px solid #7B1FA2;border-radius:14px;display:flex;gap:12px;box-shadow:var(--shadow-card);position:relative;` |
| `margin:0 20px 10px;padding:14px 16px;background:var(--surface-white);border:1px solid var(--ink-100);border-left:4px solid #C2185B;border-radius:14px;display:flex;gap:12px;box-shadow:var(--shadow-card);position:relative;` |
| `margin:0 20px 10px;padding:14px 16px;background:var(--surface-white);border:1px solid var(--ink-100);border-left:4px solid #D97706;border-radius:14px;display:flex;gap:12px;box-shadow:var(--shadow-card);position:relative;` |
| `margin:0 20px 10px;padding:14px 16px;background:var(--surface-white);border:1px solid var(--ink-100);border-left:4px solid #DC2626;border-radius:14px;display:flex;gap:12px;box-shadow:var(--shadow-card);position:relative;` |
| `margin:0 20px;` |
| `margin:0 20px; background:white; border-radius:16px; padding:20px; border:1px solid var(--ink-100);` |
| `margin:16px 20px; background:white; border-radius:16px; padding:16px; border:1px solid var(--ink-100);` |
| `margin:8px 20px; padding:18px 20px; background:var(--surface-white); border:1.5px dashed var(--ink-300); border-radius:18px; display:flex; align-items:center; gap:14px; cursor:pointer; color:var(--ink-700);` |
| `padding-top:0;` |
| `padding-top:8px;` |
| `padding: 0 24px;` |
| `padding:10px 14px; background:var(--ink-50); color:var(--ink-800); border-radius:999px; font-size:13px; font-weight:600; cursor:pointer; border:1.5px solid transparent;` |
| `padding:14px 16px; margin-bottom:16px;` |
| `padding:14px 20px; text-align:center; color:var(--ink-500); font-size:13px; line-height:1.5;` |
| `padding:16px 20px;` |
| `padding:16px 24px; text-align:center;` |
| `padding:40px 24px; display:flex; flex-direction:column; align-items:center;` |
| `padding:6px 4px 14px; font-size:13px; color:var(--ink-500); line-height:1.5;` |
| `padding:8px 0;` |
| `position:relative;` |
| `text-align:center;` |
| `text-align:center; padding:8px 24px 16px; font-size:13px; color:var(--ink-500); line-height:1.5;` |
| `text-align:right; font-size:12px; color:var(--ink-500); margin-top:4px;` |
| `text-align:right; margin-bottom:16px;` |
| `width:100%; height:52px; background:var(--grad-primary); color:white; border:none; border-radius:14px; font-weight:600; font-size:15px; cursor:pointer;` |
| `width:100%; max-width:340px;` |
| `width:100%; padding:12px 14px; border:1.5px solid var(--surface-outline); border-radius:12px; font-family:inherit; font-size:14px; resize:vertical; background:var(--surface-white); color:var(--ink-950); box-sizing:border-box;` |
| `width:100%;height:52px;background:var(--grad-primary);color:white;border:none;border-radius:14px;font-weight:600;font-size:15px;` |
| `width:100%;min-height:60px;padding:12px 14px;border:1.5px solid var(--ink-200);border-radius:12px;font-family:inherit;font-size:14px;resize:none;outline:none;background:var(--surface-white);color:var(--ink-950);margin-bottom:16px;` |
| `width:30px; height:6px; background:var(--amber-600); border-radius:3px;` |
| `width:40px;` |
| `width:40px;height:40px;border-radius:50%;background:rgba(123,31,162,0.15);color:#7B1FA2;display:flex;align-items:center;justify-content:center;flex-shrink:0;` |
| `width:40px;height:40px;border-radius:50%;background:rgba(194,24,91,0.15);color:#C2185B;display:flex;align-items:center;justify-content:center;flex-shrink:0;` |
| `width:40px;height:40px;border-radius:50%;background:rgba(217,119,6,0.15);color:#D97706;display:flex;align-items:center;justify-content:center;flex-shrink:0;` |
| `width:40px;height:40px;border-radius:50%;background:rgba(220,38,38,0.15);color:#DC2626;display:flex;align-items:center;justify-content:center;flex-shrink:0;` |
| `width:40px;height:40px;border-radius:50%;background:rgba(93,64,55,0.15);color:#5D4037;display:flex;align-items:center;justify-content:center;flex-shrink:0;` |
| `width:40px;height:4px;background:var(--ink-200);border-radius:2px;margin:0 auto 14px;` |
| `width:40px;height:4px;background:var(--ink-200);border-radius:2px;margin:0 auto 16px;` |
| `width:40px;height:4px;background:var(--ink-200);border-radius:2px;margin:0 auto 20px;` |
| `width:42px; height:6px; background:var(--red-500); border-radius:3px;` |
| `width:48px;height:48px;background:transparent;border:none;color:var(--ink-500);border-radius:50%;cursor:pointer;align-self:flex-start;display:flex;align-items:center;justify-content:center;` |
| `width:48px;height:48px;border-radius:14px;background:var(--ink-100);color:var(--ink-700);display:flex;align-items:center;justify-content:center;` |
| `width:60px; height:6px; background:var(--purple-500); border-radius:3px;` |
| `width:64px;height:64px;border-radius:12px;background:linear-gradient(135deg,#7C3AED,#A78BFA);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:white;font-size:24px;` |
| `width:6px;height:6px;border-radius:50%;background:var(--red-500);box-shadow:0 0 0 0 rgba(239,68,68,0.4);animation:pulse-red 1.5s infinite;` |
| `width:88px;height:88px;border-radius:50%;background:rgba(124,58,237,0.12);color:var(--violet-700);display:flex;align-items:center;justify-content:center;margin-bottom:20px;` |
