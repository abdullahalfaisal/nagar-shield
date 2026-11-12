import { redirect } from 'next/navigation';

/**
 * The console's entry point.
 *
 * The queue is the landing surface — a moderator's first screen is the list of
 * reports waiting for review.
 */
export default function IndexPage() {
  redirect('/queue');
}
