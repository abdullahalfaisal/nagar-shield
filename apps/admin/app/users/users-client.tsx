'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCopy, DEFAULT_ADMIN_LOCALE } from '@/lib/copy'
import { toAppError, type AccountRow } from '@/lib/api'
import {
  disableErrorMessage,
  useAccountList,
  useAccountSearch,
  useDisableAccount,
  useEnableAccount,
  useRestoreDeletedAccount,
} from '@/lib/queries'
import { formatTimestampShort, maskEmail, maskPhone } from '@/lib/format'
import { AdminShell, EmptyState, ErrorBanner, PageHeader, SkeletonList } from '@/app/admin-shell'
import { ConfirmAction } from '@/app/confirm-action'

/**
 * Every account, with a Disable button on each citizen row.
 *
 * The list masks phone and email. The search box is an exact match on a phone,
 * an email or an account ID, and its results show the full contact details.
 */
export function UsersClient() {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const router = useRouter()

  const list = useAccountList()
  const { isLoading, isFetchingNextPage, hasNextPage } = list

  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  // The search runs on submit, not on every keystroke: it is an exact match, so
  // a half-typed phone number would never match anyway.
  const search = useAccountSearch(query)

  useEffect(() => {
    if (list.error && toAppError(list.error).code === 'AUTH_REQUIRED') {
      router.replace('/login')
    }
  }, [list.error, router])

  async function runSearch() {
    setSearchError(null)

    if (query.trim().length === 0) {
      setSearched(false)
      return
    }

    setSearching(true)
    try {
      await search.refetch()
      setSearched(true)
    } catch (caught) {
      setSearchError(
        toAppError(caught).code === 'FORBIDDEN' ? copy.errorForbidden : copy.errorGeneric,
      )
    } finally {
      setSearching(false)
    }
  }

  function clearSearch() {
    setQuery('')
    setSearched(false)
    setSearchError(null)
  }

  const listError = list.error
    ? toAppError(list.error).code === 'FORBIDDEN'
      ? copy.errorForbidden
      : copy.errorGeneric
    : null

  const showingSearch = searched && query.trim().length > 0
  const accounts: AccountRow[] = showingSearch
    ? (search.data ?? [])
    : (list.data?.pages ?? []).flatMap((page) => page.items)

  return (
    <AdminShell active="users">
      <div className="page">
        <PageHeader title={copy.usersTitle} subtitle={copy.usersSubtitle} />

        <div className="stack">
          <ErrorBanner message={searchError ?? listError} />

          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault()
              void runSearch()
            }}
          >
            <input
              id="user-search"
              className="input selectAuto"
              type="search"
              aria-label={copy.usersSearchLabel}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.usersSearchPlaceholder}
            />
            <button type="submit" className="button buttonPrimary" disabled={searching}>
              {copy.usersSearchSubmit}
            </button>
            {showingSearch ? (
              <button type="button" className="button buttonSecondary" onClick={clearSearch}>
                {copy.decisionCancel}
              </button>
            ) : null}
          </form>

          {isLoading && !showingSearch ? <SkeletonList /> : null}

          {showingSearch && accounts.length === 0 ? (
            <EmptyState title={copy.usersEmptyTitle} body={copy.usersEmptyBody} />
          ) : null}

          {accounts.length > 0 ? (
            <div className="card cardFlush">
              <table className="table">
                <thead>
                  <tr>
                    <th>{copy.usersColumnName}</th>
                    <th>{copy.usersColumnContact}</th>
                    <th>{copy.usersColumnRole}</th>
                    <th>{copy.usersColumnReports}</th>
                    <th>{copy.usersColumnStatus}</th>
                    <th>{copy.usersColumnJoined}</th>
                    <th>{copy.usersColumnAction}</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <UserRow key={account.id} account={account} masked={!showingSearch} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {!showingSearch && accounts.length > 0 ? (
            hasNextPage ? (
              <button
                type="button"
                className="button buttonSecondary buttonStart"
                onClick={() => void list.fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? copy.queueLoading : copy.queueLoadMore}
              </button>
            ) : (
              <p className="muted">{copy.queueEnd}</p>
            )
          ) : null}
        </div>
      </div>
    </AdminShell>
  )
}

/**
 * One account row. A moderator row has no Disable button: a moderator cannot
 * disable another moderator, and the server refuses it anyway.
 */
function UserRow({ account, masked }: { account: AccountRow; masked: boolean }) {
  const copy = getCopy(DEFAULT_ADMIN_LOCALE)
  const disable = useDisableAccount()
  const enable = useEnableAccount()
  const restore = useRestoreDeletedAccount()

  const isModerator = account.role === 'moderator'
  const isDisabled = Boolean(account.disabledAt)
  const isDeleted = Boolean(account.deletedAt)
  const failure = disable.error ?? enable.error ?? restore.error
  const error = failure ? disableErrorMessage(toAppError(failure).code) : null

  async function onDisable() {
    disable.reset()
    try {
      await disable.mutateAsync({ userId: account.id, note: copy.usersDefaultNote })
    } catch {
      // The error is read from the mutation and shown under the button.
    }
  }

  async function onEnable() {
    enable.reset()
    try {
      await enable.mutateAsync({ userId: account.id, note: copy.usersDefaultEnableNote })
    } catch {
      // The error is read from the mutation and shown under the button.
    }
  }

  async function onRestore() {
    restore.reset()
    try {
      await restore.mutateAsync({ userId: account.id, note: copy.usersDefaultRestoreNote })
    } catch {
      // The error is read from the mutation and shown under the button.
    }
  }

  const phone = masked ? maskPhone(account.phone) : (account.phone ?? '—')
  const email = masked ? maskEmail(account.email) : (account.email ?? '—')

  return (
    <tr>
      <td className="itemTitle">{account.fullName ?? '—'}</td>
      <td>
        <div>{phone}</div>
        <div className="muted">{email}</div>
        {!masked ? <div className="muted">{account.id}</div> : null}
      </td>
      <td>{account.role}</td>
      <td>{account.reportCount}</td>
      <td>
        {isDeleted ? (
          <span className="chip chipWarning">{copy.usersStatusDeleted}</span>
        ) : isDisabled ? (
          <span className="chip chipDanger">{copy.usersDisabledBadge}</span>
        ) : (
          <span className="chip">{copy.usersStatusActive}</span>
        )}
      </td>
      <td className="nowrap">{formatTimestampShort(account.createdAt)}</td>
      <td>
        {isModerator ? (
          '—'
        ) : isDeleted ? (
          <ConfirmAction
            label={copy.usersRestore}
            question={copy.usersRestoreConfirm}
            yesLabel={copy.usersRestoreYes}
            busy={restore.isPending}
            error={error}
            onConfirm={onRestore}
          />
        ) : isDisabled ? (
          <ConfirmAction
            label={copy.usersEnable}
            question={copy.usersEnableConfirm}
            yesLabel={copy.usersEnableYes}
            busy={enable.isPending}
            error={error}
            onConfirm={onEnable}
          />
        ) : (
          <ConfirmAction
            label={copy.usersDisable}
            question={copy.usersDisableConfirm}
            yesLabel={copy.usersDisableSubmit}
            busy={disable.isPending}
            error={error}
            onConfirm={onDisable}
          />
        )}
      </td>
    </tr>
  )
}
