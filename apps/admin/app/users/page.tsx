import { ModeratorGate } from '@/app/moderator-gate';
import { UsersClient } from '@/app/users/users-client';

/**
 * The account lookup route.
 *
 * A server component that gates the console: the caller's role is read from
 * the cookie-backed session **before** the client bundle mounts, so a
 * non-moderator gets the access-only state and no account is ever searched.
 *
 * The screen itself lives in `users-client.tsx`.
 */
export default function UsersPage() {
  return (
    <ModeratorGate>
      <UsersClient />
    </ModeratorGate>
  );
}
