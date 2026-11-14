import { Showcase } from '@/shared/ui/Showcase'

/**
 * The design-system showcase.
 *
 * The visual acceptance surface for story `003-mobile-design-system`: one
 * route rendering every primitive, with a light/dark toggle so a primitive
 * that only reads in one theme is visible immediately.
 *
 * It lives outside the `(app)` group on purpose. The showcase is how a
 * designer or a reviewer checks the primitives, and requiring a signed-in
 * account to look at a button would defeat that. It fetches nothing and
 * touches no account state.
 */
export default function ShowcaseScreen() {
  return <Showcase />
}
