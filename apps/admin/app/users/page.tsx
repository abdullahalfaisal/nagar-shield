'use client';

import { useCallback, useState } from 'react';
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy';
import {
  disableAccount,
  getBrowserClient,
  searchAccounts,
  toAppError,
  type AccountRow,
} from '@/lib/api';
import { AdminShell, EmptyState, ErrorBanner, PageHeader } from '@/app/admin-shell';

/**
 * The account lookup and the disable action.
 *
 * The search is an **exact** match on the phone, the email, or the profile id.
 * It is not a user directory — a moderator searches for one account they need
 * to act on, and the route never lists accounts in bulk.
 *
 * The per-user report count is moderation context about **one** account. It is
 * not an aggregate: there is no total-crime counter, no distribution, and no
 * chart anywhere on this route (FR-NG-3 / FR-NG-4 / ADR-010).
 */

export default function UsersPage() {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE);

  const [query, setQuery] = useState('');
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runSearch = useCallback(async () => {
    setError(null);

    if (query.trim().length === 0) {
      setAccounts([]);
      setSearched(true);
      return;
    }

    setSearching(true);

    try {
      const results = await searchAccounts(getBrowserClient(), query);
      setAccounts(results);
      setSearched(true);
    } catch (caught) {
      const appError = toAppError(caught);
      setError(appError.code === 'FORBIDDEN' ? copy.errorForbidden : copy.errorGeneric);
    } finally {
      setSearching(false);
    }
  }, [copy.errorForbidden, copy.errorGeneric, query]);

  return (
    <AdminShell active="users" role="moderator">
      <div className="page">
        <PageHeader title={copy.usersTitle} subtitle={copy.usersSubtitle} />

        <div className="stack">
          <ErrorBanner message={error} />

          <form
            className="card row"
            style={{ padding: 16, gap: 12, alignItems: 'flex-end' }}
            onSubmit={(event) => {
              event.preventDefault();
              void runSearch();
            }}
          >
            <div style={{ flex: 1 }}>
              <label className="fieldLabel" htmlFor="user-search">
                {copy.usersSearchLabel}
              </label>
              <input
                id="user-search"
                className="input"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={copy.usersSearchPlaceholder}
              />
            </div>
            <button type="submit" className="button buttonPrimary" disabled={searching}>
              {copy.usersSearchSubmit}
            </button>
          </form>

          {searched && accounts.length === 0 ? (
            <EmptyState title={copy.usersEmptyTitle} body={copy.usersEmptyBody} />
          ) : null}

          {accounts.map((account) => (
            <AccountCard key={account.id} account={account} onDisabled={runSearch} />
          ))}
        </div>
      </div>
    </AdminShell>
  );
}

/**
 * One account row, with its disable control.
 *
 * A moderator account is shown **without** a disable control: a moderator
 * cannot disable another moderator at MVP, and the server refuses the request
 * with `FORBIDDEN` anyway. Hiding it is a convenience — the server is the
 * guarantee.
 */
function AccountCard({
  account,
  onDisabled,
}: {
  account: AccountRow;
  onDisabled: () => Promise<void>;
}) {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE);

  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isModerator = account.role === 'moderator';
  const isDisabled = Boolean(account.disabledAt);
  const trimmedNote = note.trim();

  async function handleDisable(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (trimmedNote.length === 0) {
      setError(copy.decisionNoteRequired);
      return;
    }

    setSubmitting(true);

    try {
      await disableAccount(getBrowserClient(), { userId: account.id, note: trimmedNote });
      setNote('');
      await onDisabled();
    } catch (caught) {
      const appError = toAppError(caught);
      if (appError.code === 'VALIDATION_FAILED') {
        setError(copy.decisionNoteRequired);
      } else if (appError.code === 'FORBIDDEN') {
        setError(copy.usersDisableForbidden);
      } else if (appError.code === 'CONFLICT') {
        setError(copy.errorConflict);
      } else if (appError.code === 'AUTH_DISABLED') {
        setError(copy.errorForbidden);
      } else if (appError.code === 'AUTH_REQUIRED') {
        setError(copy.errorAuthRequired);
      } else {
        setError(copy.errorGeneric);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card" style={{ padding: 20 }}>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-950)' }}>
            {account.fullName ?? account.phone ?? account.id}
          </h2>
          <p className="muted" style={{ marginTop: 4 }}>
            {account.phone ?? '—'} · {account.email ?? '—'}
          </p>
          <p className="muted" style={{ marginTop: 4 }}>
            {account.id}
          </p>
          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <span className="chip chipMuted">{account.role}</span>
            <span className="chip">
              {copy.usersReportCount.replace('{{count}}', String(account.reportCount))}
            </span>
            {isDisabled ? <span className="chip chipDanger">{copy.usersDisabledBadge}</span> : null}
          </div>
        </div>
      </div>

      {isModerator ? (
        <div className="banner" role="note" style={{ marginTop: 16 }}>
          {copy.usersDisableForbidden}
        </div>
      ) : isDisabled ? (
        <p className="muted" style={{ marginTop: 16 }}>
          {copy.usersDisabledBadge}
        </p>
      ) : (
        <form className="stackGapSm" style={{ marginTop: 16 }} onSubmit={handleDisable}>
          <ErrorBanner message={error} />

          <div>
            <label className="fieldLabel" htmlFor={`disable-note-${account.id}`}>
              {copy.usersDisableReason}
            </label>
            <textarea
              id={`disable-note-${account.id}`}
              className="textarea"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={copy.usersDisableReasonPlaceholder}
              maxLength={2000}
            />
          </div>

          <button
            type="submit"
            className="button buttonDanger"
            disabled={submitting || trimmedNote.length === 0}
          >
            {submitting ? copy.usersDisableSubmitting : copy.usersDisableSubmit}
          </button>
        </form>
      )}
    </section>
  );
}
