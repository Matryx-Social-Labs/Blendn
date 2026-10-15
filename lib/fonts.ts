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
 * in `TYPE` against the keys here, so a typo fails a test instead of
 * shipping.
 */

import {
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope'
import {
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
  /*
   * Added for Connection Success (`1141:5403`) and the Banter's empty state,
   * both of which were written against it before it was loaded — and an
   * unloaded family does not throw, it silently renders the system font. Two
   * screens were quietly not in the product's typeface.
   */
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  Manrope_400Regular,
  Manrope_600SemiBold,
  Manrope_700Bold,
  /*
   * The redesign's families (lib/design/tokens.ts `FONT_FAMILY`), loaded now so
   * screens can move to them one at a time.
   *
   * Satoshi is the unmodified Fontshare OTF, required from a gitignored folder:
   * the ITF licence lets the app embed it but not this public repo publish it.
   * A build without the four files fails to bundle, by name, rather than
   * shipping the system font — docs/RELEASING.md, "Satoshi", says where they
   * come from. Geist Mono is OFL, from its npm package — the two files by
   * path: the package's index requires all eighteen weights, and every one
   * would ship in the app.
   */
  Satoshi_400Regular: require('../assets/fonts/satoshi/Satoshi-Regular.otf'),
  Satoshi_500Medium: require('../assets/fonts/satoshi/Satoshi-Medium.otf'),
  Satoshi_700Bold: require('../assets/fonts/satoshi/Satoshi-Bold.otf'),
  Satoshi_900Black: require('../assets/fonts/satoshi/Satoshi-Black.otf'),
  GeistMono_500Medium: require('@expo-google-fonts/geist-mono/500Medium/GeistMono_500Medium.ttf'),
  GeistMono_700Bold: require('@expo-google-fonts/geist-mono/700Bold/GeistMono_700Bold.ttf'),
} as const
