/** The console's user-facing strings. */

export type AdminLocale = 'en'

export interface AdminCopy {
  appName: string
  appTagline: string
  navGroupModeration: string
  navGroupHelp: string
  navGroupPeople: string
  navGroupRecords: string
  navQueue: string
  navFeed: string
  navDeclined: string
  navNumbers: string
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
  queueColumnActions: string
  queueColumnTime: string
  queueColumnCategory: string
  queueColumnArea: string
  queueColumnDescription: string
  queueColumnFlags: string
  queueColumnReason: string
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
  decisionApprove: string
  decisionDecline: string
  decisionApproveHint: string
  decisionDeclineHint: string
  decisionDeclineConfirm: string
  decisionDeclineYes: string
  decisionCancel: string
  decisionNoteOptional: string
  decisionDefaultApprove: string
  decisionDefaultDecline: string
  decisionRestore: string
  decisionRemove: string
  decisionRemoveWarning: string
  decisionNote: string
  decisionNotePlaceholder: string
  decisionNoteRequired: string
  decisionSubmit: string
  decisionSubmitting: string
  decisionConfirmRemove: string

  feedTitle: string
  feedSubtitle: string
  feedEmptyTitle: string
  feedEmptyBody: string
  feedStatusShown: string
  feedStatusHidden: string
  feedColumnStatus: string
  feedShow: string
  feedDefaultShowNote: string
  feedHide: string
  feedHideConfirm: string
  feedHideYes: string
  feedDefaultNote: string
  usersColumnName: string
  usersColumnContact: string
  usersColumnRole: string
  usersColumnReports: string
  usersColumnStatus: string
  usersColumnJoined: string
  usersColumnAction: string
  usersStatusActive: string
  usersDisableConfirm: string
  usersDefaultNote: string
  usersEnable: string
  usersEnableConfirm: string
  usersEnableYes: string
  usersDefaultEnableNote: string
  usersStatusDeleted: string
  usersRestore: string
  usersRestoreConfirm: string
  usersRestoreYes: string
  usersDefaultRestoreNote: string
  declinedTitle: string
  declinedSubtitle: string
  declinedEmptyTitle: string
  declinedEmptyBody: string
  declinedColumnTime: string
  declinedUndo: string
  declinedUndoConfirm: string
  declinedUndoYes: string
  declinedDefaultNote: string
  numbersTitle: string
  numbersSubtitle: string
  numbersEmptyTitle: string
  numbersEmptyBody: string
  numbersFilterPending: string
  numbersFilterReviewed: string
  numbersFilterRejected: string
  numbersFilterAll: string
  numbersColumnEntry: string
  numbersColumnReason: string
  numbersColumnStatus: string
  numbersHotline: string
  numbersStation: string
  numbersUnknownEntry: string
  numbersAnonymous: string
  numbersMarkFixed: string
  numbersDismiss: string
  numbersReopen: string
  numbersStatusPending: string
  numbersStatusReviewed: string
  numbersStatusRejected: string
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
  auditDecisionHide: string
  auditDecisionEnableUser: string
  auditDecisionRestoreAccount: string
  auditDecisionUndoRemove: string
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

const en: AdminCopy = {
  appName: 'Nagar Shield',
  appTagline: 'Moderation console',
  navGroupModeration: 'Moderation',
  navGroupHelp: 'Help numbers',
  navGroupPeople: 'People',
  navGroupRecords: 'Records',
  navQueue: 'Review queue',
  navFeed: 'Public feed',
  navDeclined: 'Declined',
  navNumbers: 'Wrong numbers',
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

  queueTitle: 'Review queue',
  queueSubtitle: 'Reports hidden after being flagged',
  queueEmptyTitle: 'Nothing to review',
  queueEmptyBody: 'Flagged reports will appear here.',
  queueLoadMore: 'Load more',
  queueEnd: 'End of list',
  queueLoading: 'Loading…',
  queueUploader: 'Uploader',
  queueColumnActions: 'Action',
  queueColumnTime: 'Reported',
  queueColumnCategory: 'Category',
  queueColumnArea: 'Area',
  queueColumnDescription: 'Description',
  queueColumnFlags: 'Flags',
  queueColumnReason: 'Hidden because',
  queueGroupAll: 'All',
  queueGroupAuthorAutoHide: 'Author flagged',
  queueGroupEmptyTitle: 'Nothing here',
  queueGroupEmptyBody: 'No reports are hidden because of their author.',
  queueBadgeAuthorAutoHide: 'Author flagged',
  queueBadgeBoth: '3 flags and author',
  queueAuthorFlagCount: "Author's flags in 24 h: {{count}}",
  queueOwnFlagCount: '{{count}}',
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
  decisionApprove: 'Approve',
  decisionDecline: 'Decline',
  decisionApproveHint: 'Approve puts the report back in the public feed.',
  decisionDeclineHint: 'Decline removes the report for good.',
  decisionDeclineConfirm: 'Remove this report for good?',
  decisionDeclineYes: 'Yes, decline',
  decisionCancel: 'Cancel',
  decisionNoteOptional: 'Note (optional)',
  decisionDefaultApprove: 'Approved by moderator',
  decisionDefaultDecline: 'Declined by moderator',
  decisionRestore: 'Restore',
  decisionRemove: 'Remove',
  decisionRemoveWarning: 'Removal is permanent — the report never returns to the public feed.',
  decisionNote: 'Note',
  decisionNotePlaceholder: 'Why you are making this decision',
  decisionNoteRequired: 'A note is required for every decision',
  decisionSubmit: 'Submit decision',
  decisionSubmitting: 'Submitting…',
  decisionConfirmRemove: 'Remove permanently',

  feedTitle: 'Public feed',
  feedSubtitle: 'Hide a report from the public, or show it again',
  feedEmptyTitle: 'No reports in the feed',
  feedEmptyBody: 'Published reports will appear here.',
  feedStatusShown: 'Shown',
  feedStatusHidden: 'Hidden',
  feedColumnStatus: 'Status',
  feedShow: 'Show',
  feedDefaultShowNote: 'Shown by moderator',
  feedHide: 'Hide',
  feedHideConfirm: 'Hide this report from the public feed?',
  feedHideYes: 'Yes, hide',
  feedDefaultNote: 'Hidden by moderator',
  usersColumnName: 'Name',
  usersColumnContact: 'Contact',
  usersColumnRole: 'Role',
  usersColumnReports: 'Reports',
  usersColumnStatus: 'Status',
  usersColumnJoined: 'Joined',
  usersColumnAction: 'Action',
  usersStatusActive: 'Active',
  usersDisableConfirm: 'Disable this account?',
  usersDefaultNote: 'Disabled by moderator',
  usersEnable: 'Enable',
  usersEnableConfirm: 'Let this account sign in and post again?',
  usersEnableYes: 'Yes, enable',
  usersDefaultEnableNote: 'Enabled by moderator',
  usersStatusDeleted: 'Deleted',
  usersRestore: 'Restore',
  usersRestoreConfirm: 'Restore this deleted account?',
  usersRestoreYes: 'Yes, restore',
  usersDefaultRestoreNote: 'Restored by moderator',
  declinedTitle: 'Declined reports',
  declinedSubtitle: 'Declined in the last 7 days. Undo puts a report back in the review queue.',
  declinedEmptyTitle: 'Nothing declined recently',
  declinedEmptyBody: 'Reports you decline will appear here for 7 days.',
  declinedColumnTime: 'Declined',
  declinedUndo: 'Undo',
  declinedUndoConfirm: 'Put this report back in the review queue?',
  declinedUndoYes: 'Yes, undo',
  declinedDefaultNote: 'Decline undone by moderator',
  numbersTitle: 'Wrong numbers',
  numbersSubtitle: 'People report hotline and station numbers that look wrong.',
  numbersEmptyTitle: 'No reports',
  numbersEmptyBody: 'Wrong-number reports will appear here.',
  numbersFilterPending: 'Pending',
  numbersFilterReviewed: 'Fixed',
  numbersFilterRejected: 'Dismissed',
  numbersFilterAll: 'All',
  numbersColumnEntry: 'Number',
  numbersColumnReason: 'Reason',
  numbersColumnStatus: 'Status',
  numbersHotline: 'Hotline',
  numbersStation: 'Station',
  numbersUnknownEntry: 'Unknown entry',
  numbersAnonymous: 'Anonymous',
  numbersMarkFixed: 'Mark fixed',
  numbersDismiss: 'Dismiss',
  numbersReopen: 'Reopen',
  numbersStatusPending: 'Pending',
  numbersStatusReviewed: 'Fixed',
  numbersStatusRejected: 'Dismissed',
  usersTitle: 'Users',
  usersSubtitle: 'Everyone with an account. Search to see full contact details.',
  usersSearchLabel: 'Search',
  usersSearchPlaceholder: 'Exact phone, email or ID',
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
  auditDecisionHide: 'Hidden',
  auditDecisionEnableUser: 'User enabled',
  auditDecisionRestoreAccount: 'Account restored',
  auditDecisionUndoRemove: 'Decline undone',
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

const BUNDLES: Record<AdminLocale, AdminCopy> = { en }

export function getCopy(locale: AdminLocale): AdminCopy {
  return BUNDLES[locale]
}

export const DEFAULT_ADMIN_LOCALE: AdminLocale = 'en'
