/**
 * The one raised-surface look for the redesigned screens.
 *
 * Every white surface on Home — the settings button, the search bar, the
 * shortcut tiles and the report cards — lifts off the background by the same
 * soft, violet-tinted shadow, so none of them looks heavier than its neighbour.
 * The red help banner is the one exception: it carries its own red glow on
 * purpose.
 *
 * The geometry that goes with it, kept as literals in each `StyleSheet` (the
 * tap-target gate reads literals):
 *   - surfaces: corner radius 18
 *   - icon wells: 44 × 44, corner radius 14
 *   - gutters 20, inner padding 16, gaps 12, space between blocks 16
 */
export const surfaceShadow = {
  shadowColor: '#1E0B47',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const
