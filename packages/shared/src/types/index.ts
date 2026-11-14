import type {
  ContactGroup,
  FlagReason,
  Locale,
  MediaType,
  ModerationDecision,
  ModerationStatus,
  PublicVisibility,
  ReportCategory,
  Role,
  ShareChannel,
  StationType,
  Theme,
} from '../enums';
import type { AreaHierarchyInput } from '../schemas';

/**
 * Reverse-geocode result. W-3: Dhaka-local table first, online geocode is
 * backup.
 *
 * **The schema is the source of truth** and this interface is derived from
 * it, so the type and the runtime parser cannot disagree.
 *
 * The dependency runs `schemas/` → **not** → `types/`, because the Edge
 * Functions mirror copies `schemas/` but **not** `types/`: the Edge Runtime
 * mounts only the `supabase/` directory, so a mirrored module cannot import
 * a module that was not mirrored. The other way round is fine — `types/`
 * may import from `schemas/`, which is.
 */
export type AreaHierarchy = AreaHierarchyInput;

export interface Profile {
  id: string;
  phone: string;
  email: string;
  fullName: string | null;
  role: Role;
  locale: Locale;
  theme: Theme;
  biometricOptIn: boolean;
  disabledAt: string | null;
  deletedAt: string | null;
  createdAt: string;
}

export interface EmergencyContact {
  id: string;
  userId: string;
  name: string;
  phone: string;
  isPrimary: boolean;
  groupName: ContactGroup;
  sortOrder: number;
  createdAt: string;
}

/**
 * A report as returned to the **author**. `authorId` is present here because
 * the author can see their own reports.
 */
export interface OwnedReport {
  id: string;
  authorId: string;
  publicVisibility: PublicVisibility;
  category: ReportCategory | null;
  description: string | null;
  lat: number;
  lng: number;
  areaHierarchy: AreaHierarchy | null;
  capturedAt: string;
  moderationStatus: ModerationStatus;
  createdAt: string;
  media: ReportMedia[];
}

/**
 * A report as returned to the **public feed**. `authorId` is deliberately
 * absent from the type — the public projection omits the column entirely
 * (FR-DATA-3, FR-NG-5). A nulled column would still be named `author_id`
 * and would fail the negative privacy test.
 */
export interface PublicReport {
  id: string;
  category: ReportCategory | null;
  description: string | null;
  areaHierarchy: AreaHierarchy | null;
  capturedAt: string;
  moderationStatus: ModerationStatus;
  /** Present only when the author chose `identified`. */
  authorDisplayName: string | null;
  hasMedia: boolean;
  mediaCount: number;
}

export interface ReportMedia {
  id: string;
  reportId: string;
  storagePath: string;
  mediaType: MediaType;
  byteSize: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

/** A flag as shown to a moderator (server-side only — never public). */
export interface ReportFlag {
  id: string;
  reportId: string;
  flaggerId: string;
  reason: FlagReason;
  createdAt: string;
}

/** A moderation decision — append-only audit trail (FR-MOD-3). */
export interface ModerationAction {
  id: string;
  reportId: string | null;
  moderatorId: string;
  targetUserId: string | null;
  decision: ModerationDecision;
  note: string;
  createdAt: string;
}

/** One row in the moderator queue. Includes the uploader — server-side only. */
export interface ModerationQueueItem {
  report: OwnedReport;
  flags: ReportFlag[];
  author: {
    id: string;
    displayName: string | null;
    email: string;
    phone: string;
    /** Flag count against this author across the last 24 hours. */
    flagsLast24h: number;
  };
  hideReason: 'flag_threshold' | 'author_auto_hide' | 'both' | 'manual';
}

export interface Station {
  id: string;
  stationType: StationType;
  name: string;
  nameBn: string | null;
  phone: string;
  lat: number;
  lng: number;
  address: string | null;
  distanceKm: number | null;
}

export interface Hotline {
  id: string;
  name: string;
  nameBn: string | null;
  phone: string;
  category: string;
  description: string | null;
  sortOrder: number;
}

export interface LocationShare {
  id: string;
  senderId: string;
  recipientContactId: string | null;
  lat: number;
  lng: number;
  accuracyM: number | null;
  mode: 'snapshot';
  shareChannel: ShareChannel;
  sharedAt: string;
}

/** Cursor-paginated result envelope. */
export interface Paginated<T> {
  items: T[];
  nextCursor: string | null;
}
