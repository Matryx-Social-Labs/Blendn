/*
 * The fonts to load, in one place.
 *
 * Separate from `lib/theme.ts` because this file imports the font packages and
 * `theme.ts` is pure data that twenty-six files pull in; there is no reason for
 * a screen that wants a hex value to drag two font packages behind it.
 *
 * The failure this shape prevents is silent. A `fontFamily` that names a family
 * nobody loaded does not throw and does not warn — it renders in the system
 * font, which on a dark screen at a glance looks like a slightly different
 * weight rather than like a bug. `__tests__/fonts.test.ts` compares the names
 * in `EMBER_TYPE` against the keys here, so a typo fails a test instead of
 * shipping.
 */

import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope'
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans'

/**
 * Passed straight to `useFonts` in `app/_layout.tsx`.
 *
 * Every weight is loaded explicitly rather than relying on `fontWeight`,
 * because a custom font on Android ignores `fontWeight` entirely: asking for
 * Manrope at `'600'` gives semibold on iOS and regular on Android from
 * identical code. The weight is part of the family name.
 */
export const EMBER_FONT_MODULES = {
  PlusJakartaSans_400Regular,
  /*
   * Added for Connection Success (`1141:5403`) and the Banter's empty state,
   * both of which were written against it before it was loaded — and an
   * unloaded family does not throw, it silently renders the system font. Two
   * screens were quietly not in the product's typeface.
   */
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} as const
