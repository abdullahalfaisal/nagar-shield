/**
 * The console's user-facing strings.
 *
 * The admin is an **internal** tool, so it does not start a second i18n system
 * — but every string is still declared in **both** locales here, with Bangla
 * first, and the shared mobile bundle stays the citizen-facing surface. The
 * console's copy is deliberately short: a moderator reads a queue, not prose.
 */

export type AdminLocale = 'bn' | 'en'

export interface AdminCopy {
  appName: string
  appTagline: string
  navQueue: string
  navUsers: string
  navAudit: string
  signOut: string

  loginTitle: string
  loginSubtitle: string
  loginEmail: string
  loginPassword: string
  loginSubmit: string
  loginSubmitting: string
  loginBackToQueue: string

  accessOnlyTitle: string
  accessOnlyBody: string

  queueTitle: string
  queueSubtitle: string
  queueEmptyTitle: string
  queueEmptyBody: string
  queueLoadMore: string
  queueEnd: string
  queueLoading: string
  queueUploader: string
  queueGroupAll: string
  queueGroupAuthorAutoHide: string
  queueGroupEmptyTitle: string
  queueGroupEmptyBody: string
  queueBadgeAuthorAutoHide: string
  queueBadgeBoth: string
  queueAuthorFlagCount: string
  queueOwnFlagCount: string
  queueAuthorAutoHideExplanation: string

  detailTitle: string
  detailMedia: string
  detailNoMedia: string
  detailMediaUnavailable: string
  detailMediaRetry: string
  detailArea: string
  detailCategory: string
  detailUncategorised: string
  detailDescription: string
  detailCapturedAt: string
  detailFlags: string
  detailFlagReporter: string
  detailUploader: string
  detailUploaderId: string
  detailUploaderPhone: string
  detailUploaderEmail: string
  detailUploaderRole: string
  detailUploaderState: string
  detailStateActive: string
  detailStateDisabled: string
  detailPriorActions: string
  detailAutoHideBanner: string
  detailNoPriorActions: string

  decisionHeading: string
  decisionRestore: string
  decisionRemove: string
  decisionRemoveWarning: string
  decisionNote: string
  decisionNotePlaceholder: string
  decisionNoteRequired: string
  decisionSubmit: string
  decisionSubmitting: string
  decisionConfirmRemove: string

  usersTitle: string
  usersSubtitle: string
  usersSearchLabel: string
  usersSearchPlaceholder: string
  usersSearchSubmit: string
  usersEmptyTitle: string
  usersEmptyBody: string
  usersReportCount: string
  usersDisable: string
  usersDisableHeading: string
  usersDisableReason: string
  usersDisableReasonPlaceholder: string
  usersDisableSubmit: string
  usersDisableSubmitting: string
  usersDisableForbidden: string
  usersDisabledBadge: string

  auditTitle: string
  auditSubtitle: string
  auditFilterDecision: string
  auditFilterAll: string
  auditColumnTarget: string
  auditColumnModerator: string
  auditColumnDecision: string
  auditColumnNote: string
  auditColumnTimestamp: string
  auditDecisionRestore: string
  auditDecisionRemove: string
  auditDecisionDisableUser: string
  auditDecisionUnknown: string
  auditEmptyTitle: string
  auditEmptyBody: string
  auditLoadMore: string
  auditEnd: string
  auditModeratorDeleted: string
  auditReportUnavailable: string

  errorGeneric: string
  errorForbidden: string
  errorAuthRequired: string
  errorValidation: string
  errorConflict: string
  errorNotFound: string
}

const bn: AdminCopy = {
  appName: 'নগর শিল্ড',
  appTagline: 'মডারেশন কনসোল',
  navQueue: 'কিউ',
  navUsers: 'ব্যবহারকারী',
  navAudit: 'অ্যাকশন লগ',
  signOut: 'সাইন আউট',

  loginTitle: 'মডারেটর সাইন ইন',
  loginSubtitle: 'শুধুমাত্র মডারেটর অ্যাকাউন্টে অ্যাক্সেস আছে।',
  loginEmail: 'ইমেইল',
  loginPassword: 'পাসওয়ার্ড',
  loginSubmit: 'সাইন ইন',
  loginSubmitting: 'সাইন ইন হচ্ছে…',
  loginBackToQueue: 'কিউ-তে ফিরে যান',

  accessOnlyTitle: 'শুধুমাত্র মডারেটর অ্যাক্সেস',
  accessOnlyBody: 'এই অ্যাকাউন্টের মডারেশন অনুমতি নেই।',

  queueTitle: 'পর্যালোচনার অপেক্ষায়',
  queueSubtitle: 'ফ্ল্যাগ হওয়া রিপোর্ট',
  queueEmptyTitle: 'কিউ খালি',
  queueEmptyBody: 'এই মুহূর্তে পর্যালোচনার জন্য কোনো রিপোর্ট নেই।',
  queueLoadMore: 'আরও দেখুন',
  queueEnd: 'সব রিপোর্ট দেখানো হয়েছে',
  queueLoading: 'কিউ লোড হচ্ছে…',
  queueUploader: 'লেখক',
  queueGroupAll: 'সব অপেক্ষমাণ',
  queueGroupAuthorAutoHide: 'লেখকের নিয়মে লুকানো',
  queueGroupEmptyTitle: 'এই দলে কোনো রিপোর্ট নেই',
  queueGroupEmptyBody: 'লেখকের নিয়মে লুকানো কোনো রিপোর্ট এই মুহূর্তে নেই।',
  queueBadgeAuthorAutoHide: 'লেখক-স্বয়ংক্রিয় লুকানো',
  queueBadgeBoth: 'লেখকের নিয়ম ও ৩ ফ্ল্যাগ',
  queueAuthorFlagCount: 'লেখকের ২৪ ঘণ্টার ফ্ল্যাগ: {{count}}',
  queueOwnFlagCount: 'নিজের ফ্ল্যাগ: {{count}}',
  queueAuthorAutoHideExplanation:
    'এই রিপোর্টটি নিজের ফ্ল্যাগের সংখ্যার কারণে নয়, বরং লেখকের ২৪ ঘণ্টায় ৫টি বা তার বেশি রিপোর্ট ফ্ল্যাগ হওয়ায় স্বয়ংক্রিয়ভাবে লুকানো হয়েছে।',

  detailTitle: 'রিপোর্ট পর্যালোচনা',
  detailMedia: 'মিডিয়া',
  detailNoMedia: 'কোনো মিডিয়া নেই',
  detailMediaUnavailable: 'মিডিয়াটি দেখা যাচ্ছে না',
  detailMediaRetry: 'আবার চেষ্টা করুন',
  detailArea: 'এলাকা',
  detailCategory: 'ক্যাটাগরি',
  detailUncategorised: 'শ্রেণিবদ্ধ নয়',
  detailDescription: 'বিবরণ',
  detailCapturedAt: 'ক্যাপচারের সময়',
  detailFlags: 'ফ্ল্যাগের কারণ',
  detailFlagReporter: 'ফ্ল্যাগ করেছেন',
  detailUploader: 'আপলোডকারীর পরিচয়',
  detailUploaderId: 'প্রোফাইল আইডি',
  detailUploaderPhone: 'ফোন',
  detailUploaderEmail: 'ইমেইল',
  detailUploaderRole: 'ভূমিকা',
  detailUploaderState: 'অ্যাকাউন্টের অবস্থা',
  detailStateActive: 'সক্রিয়',
  detailStateDisabled: 'নিষ্ক্রিয়',
  detailPriorActions: 'আগের সিদ্ধান্ত',
  detailAutoHideBanner:
    'এই রিপোর্টটি লেখকের নিয়মে লুকানো হয়েছে — ২৪ ঘণ্টায় ৫টি ফ্ল্যাগ হওয়ায়।',
  detailNoPriorActions: 'এই রিপোর্টে আগের কোনো সিদ্ধান্ত নেই।',

  decisionHeading: 'সিদ্ধান্ত',
  decisionRestore: 'ফিরিয়ে আনুন',
  decisionRemove: 'সরান',
  decisionRemoveWarning: 'সরানো স্থায়ী — রিপোর্টটি আর কখনো সাধারণ ফিডে দেখাবে না।',
  decisionNote: 'নোট',
  decisionNotePlaceholder: 'কেন এই সিদ্ধান্ত নিলেন লিখুন',
  decisionNoteRequired: 'সিদ্ধান্তের নোট আবশ্যক',
  decisionSubmit: 'সিদ্ধান্ত জমা দিন',
  decisionSubmitting: 'জমা দেওয়া হচ্ছে…',
  decisionConfirmRemove: 'স্থায়ীভাবে সরান',

  usersTitle: 'ব্যবহারকারী',
  usersSubtitle: 'ফোন, ইমেইল বা প্রোফাইল আইডি দিয়ে খুঁজুন',
  usersSearchLabel: 'খুঁজুন',
  usersSearchPlaceholder: '+8801••••••• বা ইমেইল বা UUID',
  usersSearchSubmit: 'খুঁজুন',
  usersEmptyTitle: 'কোনো অ্যাকাউন্ট পাওয়া যায়নি',
  usersEmptyBody: 'ফোন, ইমেইল বা প্রোফাইল আইডি দিয়ে হুবহু মিলিয়ে খুঁজুন।',
  usersReportCount: '{{count}}টি রিপোর্ট',
  usersDisable: 'নিষ্ক্রিয় করুন',
  usersDisableHeading: 'অ্যাকাউন্ট নিষ্ক্রিয় করুন',
  usersDisableReason: 'কারণ',
  usersDisableReasonPlaceholder: 'কেন এই অ্যাকাউন্ট নিষ্ক্রিয় করছেন লিখুন',
  usersDisableSubmit: 'নিষ্ক্রিয় করুন',
  usersDisableSubmitting: 'নিষ্ক্রিয় করা হচ্ছে…',
  usersDisableForbidden: 'একজন মডারেটরকে নিষ্ক্রিয় করা যায় না।',
  usersDisabledBadge: 'নিষ্ক্রিয়',

  auditTitle: 'মডারেশন অ্যাকশন লগ',
  auditSubtitle: 'প্রতিটি সিদ্ধান্তের অপরিবর্তনীয় রেকর্ড',
  auditFilterDecision: 'সিদ্ধান্ত',
  auditFilterAll: 'সব',
  auditColumnTarget: 'লক্ষ্য',
  auditColumnModerator: 'মডারেটর',
  auditColumnDecision: 'সিদ্ধান্ত',
  auditColumnNote: 'নোট',
  auditColumnTimestamp: 'সময়',
  auditDecisionRestore: 'ফিরিয়ে আনা',
  auditDecisionRemove: 'সরানো',
  auditDecisionDisableUser: 'ব্যবহারকারী নিষ্ক্রিয়',
  auditDecisionUnknown: 'অজানা',
  auditEmptyTitle: 'কোনো মডারেশন সিদ্ধান্ত রেকর্ড করা হয়নি',
  auditEmptyBody: 'সিদ্ধান্ত নেওয়ার পর এখানে দেখা যাবে।',
  auditLoadMore: 'আরও দেখুন',
  auditEnd: 'সব রেকর্ড দেখানো হয়েছে',
  auditModeratorDeleted: 'মডারেটর অ্যাকাউন্ট মুছে ফেলা হয়েছে',
  auditReportUnavailable: 'রিপোর্ট আর নেই',

  errorGeneric: 'কিছু একটা সমস্যা হয়েছে।',
  errorForbidden: 'আপনার এই কাজটি করার অনুমতি নেই।',
  errorAuthRequired: 'আবার সাইন ইন করুন।',
  errorValidation: 'কিছু তথ্য সঠিক নয়।',
  errorConflict: 'এটি বর্তমান অবস্থার সাথে সঙ্ঘাত করছে।',
  errorNotFound: 'যা খুঁজছেন তা পাওয়া যায়নি।',
}

const en: AdminCopy = {
  appName: 'Nagar Shield',
  appTagline: 'Moderation console',
  navQueue: 'Queue',
  navUsers: 'Users',
  navAudit: 'Action log',
  signOut: 'Sign out',

  loginTitle: 'Moderator sign in',
  loginSubtitle: 'Moderator accounts only.',
  loginEmail: 'Email',
  loginPassword: 'Password',
  loginSubmit: 'Sign in',
  loginSubmitting: 'Signing in…',
  loginBackToQueue: 'Back to the queue',

  accessOnlyTitle: 'Moderator access only',
  accessOnlyBody: 'This account has no moderation permission.',

  queueTitle: 'Waiting for review',
  queueSubtitle: 'Flagged reports',
  queueEmptyTitle: 'The queue is clear',
  queueEmptyBody: 'No report is waiting for review right now.',
  queueLoadMore: 'Load more',
  queueEnd: 'Every report is shown',
  queueLoading: 'Loading the queue…',
  queueUploader: 'Uploader',
  queueGroupAll: 'All pending',
  queueGroupAuthorAutoHide: 'Author auto-hidden',
  queueGroupEmptyTitle: 'Nothing in this group',
  queueGroupEmptyBody: 'No report is currently hidden by the author rule.',
  queueBadgeAuthorAutoHide: 'Author auto-hidden',
  queueBadgeBoth: 'Author rule and 3 flags',
  queueAuthorFlagCount: "Author's flags in 24 h: {{count}}",
  queueOwnFlagCount: 'Own flags: {{count}}',
  queueAuthorAutoHideExplanation:
    'This report was hidden automatically because its author had 5 or more reports flagged in the last 24 hours — not because the report itself reached 3 flags.',

  detailTitle: 'Report review',
  detailMedia: 'Media',
  detailNoMedia: 'No media attached',
  detailMediaUnavailable: 'Media unavailable',
  detailMediaRetry: 'Try again',
  detailArea: 'Area',
  detailCategory: 'Category',
  detailUncategorised: 'Uncategorised',
  detailDescription: 'Description',
  detailCapturedAt: 'Captured at',
  detailFlags: 'Flag reasons',
  detailFlagReporter: 'Flagged by',
  detailUploader: 'Uploader identity',
  detailUploaderId: 'Profile id',
  detailUploaderPhone: 'Phone',
  detailUploaderEmail: 'Email',
  detailUploaderRole: 'Role',
  detailUploaderState: 'Account state',
  detailStateActive: 'Active',
  detailStateDisabled: 'Disabled',
  detailPriorActions: 'Earlier decisions',
  detailAutoHideBanner:
    'This report was hidden by the author rule — 5 flagged reports from its author in 24 hours.',
  detailNoPriorActions: 'No earlier decision on this report.',

  decisionHeading: 'Decision',
  decisionRestore: 'Restore',
  decisionRemove: 'Remove',
  decisionRemoveWarning: 'Removal is permanent — the report never returns to the public feed.',
  decisionNote: 'Note',
  decisionNotePlaceholder: 'Why you are making this decision',
  decisionNoteRequired: 'A note is required for every decision',
  decisionSubmit: 'Submit decision',
  decisionSubmitting: 'Submitting…',
  decisionConfirmRemove: 'Remove permanently',

  usersTitle: 'Users',
  usersSubtitle: 'Search by phone, email, or profile id',
  usersSearchLabel: 'Search',
  usersSearchPlaceholder: '+8801•••••••, an email, or a UUID',
  usersSearchSubmit: 'Search',
  usersEmptyTitle: 'No account matched',
  usersEmptyBody: 'Search by an exact phone, email, or profile id.',
  usersReportCount: '{{count}} reports',
  usersDisable: 'Disable account',
  usersDisableHeading: 'Disable the account',
  usersDisableReason: 'Reason',
  usersDisableReasonPlaceholder: 'Why you are disabling this account',
  usersDisableSubmit: 'Disable',
  usersDisableSubmitting: 'Disabling…',
  usersDisableForbidden: 'A moderator cannot be disabled.',
  usersDisabledBadge: 'Disabled',

  auditTitle: 'Moderation action log',
  auditSubtitle: 'An immutable record of every decision',
  auditFilterDecision: 'Decision',
  auditFilterAll: 'All',
  auditColumnTarget: 'Target',
  auditColumnModerator: 'Moderator',
  auditColumnDecision: 'Decision',
  auditColumnNote: 'Note',
  auditColumnTimestamp: 'Time',
  auditDecisionRestore: 'Restored',
  auditDecisionRemove: 'Removed',
  auditDecisionDisableUser: 'User disabled',
  auditDecisionUnknown: 'Unknown',
  auditEmptyTitle: 'No moderation decisions recorded yet',
  auditEmptyBody: 'A decision appears here as soon as it is made.',
  auditLoadMore: 'Load more',
  auditEnd: 'Every record is shown',
  auditModeratorDeleted: 'Moderator account deleted',
  auditReportUnavailable: 'Report no longer available',

  errorGeneric: 'Something went wrong.',
  errorForbidden: 'You do not have permission to do that.',
  errorAuthRequired: 'Please sign in again.',
  errorValidation: 'Some details were not valid.',
  errorConflict: 'That conflicts with the current state.',
  errorNotFound: 'We could not find that.',
}

const BUNDLES: Record<AdminLocale, AdminCopy> = { bn, en }

export function getCopy(locale: AdminLocale): AdminCopy {
  return BUNDLES[locale]
}

/** The console's default locale. Bangla is the product's primary language. */
export const DEFAULT_ADMIN_LOCALE: AdminLocale = 'bn'
