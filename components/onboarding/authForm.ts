import { Image } from 'react-native'

import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, SPACE, TYPE } from '../../lib/theme'

/**
 * Width over height of a bundled image, from the bundler rather than a
 * literal: re-exporting the art cannot silently distort the layout. `fallback`
 * only when the bundler cannot say.
 */
export function assetAspect(mod: number, fallback: number): number {
  const s = Image.resolveAssetSource(mod)
  return s?.width && s?.height ? s.width / s.height : fallback
}

// The same lockup as the entry screen, so the brand does not change colour
// between the two taps of signing in (this was the all-white `lockup-white`).
export const AUTH_LOCKUP = require('../../assets/logo/lockup-hero.png')
const LOCKUP_HEIGHT = 40

/**
 * The form sign-in and forgot-password share, so the second screen of that
 * form looks like the first rather than like a different app.
 *
 * The lockup is a fixed height with the width derived from the file. Not
 * `width: '<pct>%'` plus `aspectRatio` — that combination rendered it several
 * times too large on device, overflowing the screen, because a percentage
 * width resolving against a percentage-width parent inside a flex column did
 * not match the arithmetic. A number for the height removes the ambiguity.
 */
export const AUTH_FORM_STYLES = {
  container: { flex: 1, backgroundColor: 'transparent' },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: GUTTER, paddingBottom: SPACE.xxl, gap: SPACE.lg },
  back: { alignSelf: 'flex-start', paddingVertical: SPACE.sm, marginLeft: -SPACE.xs },
  lockup: {
    height: LOCKUP_HEIGHT,
    width: LOCKUP_HEIGHT * assetAspect(AUTH_LOCKUP, 674 / 202),
    maxWidth: '80%',
    alignSelf: 'center',
    marginTop: SPACE.sm,
    marginBottom: SPACE.md,
  },
  field: { gap: SPACE.sm },
  label: TYPE.label,
  input: {
    height: CONTROL.lg,
    backgroundColor: EMBER.surface,
    borderRadius: EMBER_RADIUS.pill,
    paddingHorizontal: SPACE.xl,
    ...TYPE.body,
  },
  error: { ...TYPE.meta, color: EMBER.destructive },
  primary: { marginTop: SPACE.sm },
  linkButton: { alignItems: 'center', paddingVertical: SPACE.md },
  // A text action, so it reads as one: primary, not the grey of a caption.
  link: { ...TYPE.label, color: EMBER.textPrimary },
} as const
