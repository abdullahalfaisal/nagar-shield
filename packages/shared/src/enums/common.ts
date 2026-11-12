/**
 * Public author projection. `anonymous` is the default (FR-CAPTURE-3).
 * The server ALWAYS retains `author_id` regardless of this value (FR-DATA-3).
 */
export const PUBLIC_VISIBILITIES = ['anonymous', 'identified'] as const;

export type PublicVisibility = (typeof PUBLIC_VISIBILITIES)[number];

export const PUBLIC_VISIBILITY_SET: ReadonlySet<string> = new Set(PUBLIC_VISIBILITIES);

export const DEFAULT_PUBLIC_VISIBILITY: PublicVisibility = 'anonymous';

/** Account roles. A single `moderator` role with full access at MVP (FR-MOD-4). */
export const ROLES = ['citizen', 'moderator'] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_SET: ReadonlySet<string> = new Set(ROLES);

/** Supported locales. Bangla + English only (C-8). */
export const LOCALES = ['bn', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const LOCALE_SET: ReadonlySet<string> = new Set(LOCALES);

/** Default locale — Bangla is the product's primary language. */
export const DEFAULT_LOCALE: Locale = 'bn';

/** Theme modes. Dark is the prototype's default (`restoreTheme()`). */
export const THEMES = ['light', 'dark'] as const;

export type Theme = (typeof THEMES)[number];

export const THEME_SET: ReadonlySet<string> = new Set(THEMES);

export const DEFAULT_THEME: Theme = 'dark';

/** Media types accepted by Capture (FR-CAPTURE-1). */
export const MEDIA_TYPES = ['photo', 'video', 'file'] as const;

export type MediaType = (typeof MEDIA_TYPES)[number];

export const MEDIA_TYPE_SET: ReadonlySet<string> = new Set(MEDIA_TYPES);

/** Station types in the curated Dhaka dataset (C-2). */
export const STATION_TYPES = ['police', 'hospital', 'fire'] as const;

export type StationType = (typeof STATION_TYPES)[number];

export const STATION_TYPE_SET: ReadonlySet<string> = new Set(STATION_TYPES);

/** Entry kinds a wrong-number report can reference (FR-SEEK-6). */
export const WRONG_NUMBER_ENTRY_TYPES = ['station', 'hotline'] as const;

export type WrongNumberEntryType = (typeof WRONG_NUMBER_ENTRY_TYPES)[number];

export const WRONG_NUMBER_ENTRY_TYPE_SET: ReadonlySet<string> = new Set(
  WRONG_NUMBER_ENTRY_TYPES,
);

/** How a location snapshot reached the recipient (FR-LOC-4). */
export const SHARE_CHANNELS = ['app', 'os_share_sheet'] as const;

export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export const SHARE_CHANNEL_SET: ReadonlySet<string> = new Set(SHARE_CHANNELS);

/**
 * Location share mode. Only `snapshot` is used at MVP (FR-LOC-3 / FR-NG-7);
 * the column is the Phase-2 streaming hook.
 */
export const LOCATION_SHARE_MODES = ['snapshot'] as const;

export type LocationShareMode = (typeof LOCATION_SHARE_MODES)[number];

/** Emergency contact groups — drives the avatar gradient in the prototype. */
export const CONTACT_GROUPS = ['family', 'friend', 'colleague', 'other'] as const;

export type ContactGroup = (typeof CONTACT_GROUPS)[number];

export const CONTACT_GROUP_SET: ReadonlySet<string> = new Set(CONTACT_GROUPS);
