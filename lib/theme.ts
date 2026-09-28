/*
 * Shared visual tokens for Blendn's UI foundation.
 *
 * `EMBER` and the scales below (`SPACE`, `TYPE`, `ICON`, `CONTROL`,
 * `EMBER_RADIUS`) are what every screen uses — see docs/DESIGN_SYSTEM.md.
 * The `APP_*` block is the retired iOS-blue palette; no screen reads it and
 * `scripts/check-design-tokens.js` keeps it that way. `APP_MOTION` is still
 * live (durations and easings).
 */
export const APP_COLORS = {
  backgroundBase: '#000000',
  backgroundElevated: '#1C1C1E',
  backgroundCard: '#2C2C2E',
  separator: 'rgba(255,255,255,0.14)',
  textPrimary: '#FFFFFF',
  textSecondary: '#EBEBF599',
  textTertiary: '#EBEBF54D',
  accent: '#0A84FF',
  accentPressed: '#0060DF',
  destructive: '#FF3B30',
  success: '#34C759',
} as const

export const APP_SPACING = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const

export const APP_RADIUS = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
} as const

export const APP_SIZE = {
  touchTarget: 44,
  iconSm: 16,
  iconMd: 20,
  iconLg: 24,
} as const

export const APP_ELEVATION = {
  low: {
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  medium: {
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  high: {
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
} as const

export const APP_MOTION = {
  duration: {
    instant: 90,
    fast: 160,
    normal: 220,
    slow: 300,
  },
  easing: {
    entrance: [0.16, 1, 0.3, 1] as const,
    exit: [0.4, 0, 1, 1] as const,
    standard: [0.2, 0, 0, 1] as const,
  },
} as const

export const APP_CTA = {
  primary: {
    background: APP_COLORS.accent,
    text: APP_COLORS.textPrimary,
    pressed: APP_COLORS.accentPressed,
    disabled: 'rgba(10,132,255,0.4)',
  },
  secondary: {
    background: APP_COLORS.backgroundElevated,
    text: APP_COLORS.textPrimary,
    border: APP_COLORS.separator,
    pressed: APP_COLORS.backgroundCard,
    disabled: 'rgba(255,255,255,0.08)',
  },
  destructive: {
    background: APP_COLORS.destructive,
    text: APP_COLORS.textPrimary,
    pressed: '#D12D24',
    disabled: 'rgba(255,59,48,0.45)',
  },
} as const

/* -------------------------------------------------------------------------- */
/* Liquid Ember                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The Liquid Ember palette, straight off the Figma *🕓 Updates* canvas.
 *
 * Hex values rather than a semantic-only layer, because the design names its
 * surfaces by role and the roles are what the screens ask for. Anything used
 * more than once is here; anything used once stays inline at the call site.
 */
export const EMBER = {
  /** Page background. Warm near-black — not `#000`, which reads blue beside the accent. */
  bg: '#0F0E0E',
  /** Inputs and the large content cards. */
  surface: '#272525',
  /** Unselected chips and the progress track — one step darker than `surface`. */
  surfaceSunken: '#211F1F',
  /** The media well behind the "curation phase" anchor. Darker than the page. */
  surfaceMedia: '#141313',

  textPrimary: '#FFFFFF',
  /** Body copy, field labels, the progress percentage. */
  textSecondary: '#AEAAAA',
  /**
   * Helper text under a field. Deliberately dimmer than `textSecondary`, and
   * still AA (4.5:1) on `bg`, `surfaceSunken` and `surface` — it was `#787574`,
   * 3.3:1 on `surface`, which is where most helper text sits.
   * `__tests__/themeContrast.test.ts` holds it there.
   */
  textTertiary: '#928E8D',
  /**
   * Placeholder inside an input. Cool grey, so an empty field cannot be
   * mistaken for a filled one; AA on `surface`, the input fill (was `#6B7280`, 3.2:1).
   */
  textPlaceholder: '#8A8F99',

  /**
   * The primary action, flat — one per screen (docs/DESIGN_SYSTEM.md). No
   * gradient, no glow: the Figma frames drew it as a #FF906D → #FF6D8D
   * gradient; the app draws the warm end alone.
   */
  accent: '#FF906D',
  /** Text on `accent`. Dark on warm — white on this orange fails contrast. */
  onGradient: '#5B1600',

  /** Hairline dividers and control outlines. */
  separator: 'rgba(255,255,255,0.1)',
  /** Skeleton placeholder blocks. */
  skeleton: 'rgba(255,255,255,0.12)',
  /** Destructive actions and errors. */
  destructive: '#FF453A',
  success: '#30D158',
  /** Caution states (an event filling up, a stale connection). */
  warning: '#FFBC5C',
  /** The one cool hue: the alternate glyph in a pair of amenity tiles. */
  violet: '#F79EFF',

  /** Page colour at 60%: pills and buttons sitting on a photo. */
  scrim: 'rgba(15,14,14,0.6)',
  /** Page colour at 0%: the far end of a photo → page fade. */
  bgClear: 'rgba(15,14,14,0)',
  /** Behind a modal, sheet or lightbox. */
  backdrop: 'rgba(0,0,0,0.6)',
} as const

/**
 * A token colour at a given opacity, for tints behind a status (a success
 * toast, an offline banner). `tint(EMBER.destructive, 0.16)`.
 */
export function tint(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1, 7), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/**
 * Every `<Switch>` in the app: `<Switch {...SWITCH_COLORS} value={…} />`.
 *
 * On is `success`, not `accent`: a switch is a setting, not the screen's
 * primary action, and the accent is reserved for that (docs/DESIGN_SYSTEM.md).
 */
export const SWITCH_COLORS = {
  // Off is `textTertiary`, not a surface: switches sit on `surface` and
  // `surfaceSunken` cards, and a surface-coloured track vanishes on both.
  trackColor: { false: EMBER.textTertiary, true: EMBER.success },
  thumbColor: EMBER.textPrimary,
  ios_backgroundColor: EMBER.textTertiary,
} as const

/**
 * Ember's own radii. `APP_RADIUS` tops out at 24 and Ember's inputs are 32 —
 * a pill at 64px tall, which is the whole look.
 */
export const EMBER_RADIUS = {
  /** Small tiles, thumbnails, badges. */
  sm: 8,
  /** Rows, list cells, message bubbles. */
  md: 16,
  /** Sheets and grouped panels. */
  lg: 24,
  card: 32,
  pill: 9999,
} as const

/* -------------------------------------------------------------------------- */
/* Type                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The two font families, by the names `useFonts` registers them under.
 *
 * Weight comes from the *family*, not from `fontWeight`. Custom fonts on
 * Android ignore `fontWeight` entirely — it silently renders regular — so
 * asking for Manrope at `fontWeight: '600'` gives you semibold on iOS and
 * regular on Android, from identical code. Every weight is loaded and named.
 */
export const EMBER_FONTS = {
  displayExtraBold: 'PlusJakartaSans_800ExtraBold',
  displayBold: 'PlusJakartaSans_700Bold',
  bodyRegular: 'Manrope_400Regular',
  bodySemiBold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
} as const

/* -------------------------------------------------------------------------- */
/* Design system — the only sizes a screen may use                             */
/* -------------------------------------------------------------------------- */

/*
 * One scale for every screen. See `docs/DESIGN_SYSTEM.md`.
 *
 * These replace the per-frame values measured off Figma `1141:*`: the frames set
 * nearly everything at 16pt with a 48pt title, which left no hierarchy between a
 * section heading, a card's details and body copy, and every screen had grown
 * its own in-between values on top (24 font sizes, 15 paddings). The departures
 * from the frames are logged in `docs/PULSE.md`.
 *
 * `scripts/check-design-tokens.js` (run by `npm test`) fails on a raw
 * `fontSize`, or a padding/margin/gap off `SPACE`, in `app/` and `components/`.
 */

/** Spacing scale. Padding, margin and gap come from here and nowhere else. */
export const SPACE = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const

/** Left and right margin of every screen. Everything on a screen lines up to it. */
export const GUTTER = SPACE.xl

/** Icon sizes: inline with text, inside a control, and navigation. */
export const ICON = {
  sm: 16,
  md: 20,
  lg: 24,
} as const

/**
 * Control heights.
 *
 * `lg` for the primary action and form inputs, `md` for search fields, chips
 * and pill buttons that share a row, `sm` for tags and badges. Things in one row
 * share one height.
 */
export const CONTROL = {
  lg: 56,
  md: 48,
  sm: 32,
  /** Unread-count badge pinned to an icon's corner. */
  badge: 18,
} as const

/**
 * Opacity for a control's two dimmed states, the same on every control.
 *
 * `pressed` is the feedback while a finger is down; `disabled` is "not yet"
 * (a form not finished), dimmed rather than greyed so it does not read as
 * broken. Before this the app used 0.4, 0.45, 0.5, 0.6, 0.7 and 0.86.
 */
export const OPACITY = {
  pressed: 0.85,
  disabled: 0.45,
} as const

/**
 * The type scale. Nine roles; a screen picks a role, never a size.
 *
 * Plus Jakarta Sans for headings and actions, Manrope for reading. Weight comes
 * from the family (see `EMBER_FONTS`), never from `fontWeight`.
 *
 * - `display`    one per screen: "The Pulse", "The basics"
 * - `title`      card and sheet titles
 * - `heading`    section headings: "Featured", "Upcoming"
 * - `button`     button and action labels
 * - `body`       reading text and inputs
 * - `bodyStrong` emphasised body: names, chip labels, list row titles
 * - `meta`       secondary details: date, venue, timestamps, helper text
 * - `label`      small caps: tags, field labels, eyebrows, text actions
 * - `caption`    the smallest text: tab labels, badges, counts
 */
export const TYPE = {
  display: {
    fontFamily: EMBER_FONTS.displayExtraBold,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -1,
    color: EMBER.textPrimary,
  },
  title: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.4,
    color: EMBER.textPrimary,
  },
  heading: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.2,
    color: EMBER.textPrimary,
  },
  button: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textPrimary,
  },
  body: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textPrimary,
  },
  bodyStrong: {
    fontFamily: EMBER_FONTS.bodySemiBold,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textPrimary,
  },
  meta: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 13,
    lineHeight: 18,
    color: EMBER.textSecondary,
  },
  label: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.2,
    color: EMBER.textSecondary,
  },
  caption: {
    fontFamily: EMBER_FONTS.bodySemiBold,
    fontSize: 11,
    lineHeight: 14,
    color: EMBER.textSecondary,
  },
} as const

export type TypeRole = keyof typeof TYPE

/**
 * How far each role may grow with the phone's text size (Dynamic Type / Font
 * scale), for `<Text variant>`.
 *
 * - `display`, `title`: 1.2. Already large and one to a line; a 34pt title at
 *   3x wraps a screen name into four lines of nothing else.
 * - `button`, `label`, `caption`: 1.3. They live in fixed-height boxes — a
 *   56pt button, a tab label, a badge — and React Native clips a glyph to its
 *   box rather than growing the box. 1.3 is the largest step that still fits.
 * - `heading`, `body`, `bodyStrong`, `meta`: 2. Reading text in containers
 *   that grow, which is where larger type is for.
 *
 * A call site with a fixed box of its own passes a tighter
 * `maxFontSizeMultiplier`; the prop wins.
 */
export const MAX_FONT_SCALE: Record<TypeRole, number> = {
  display: 1.2,
  title: 1.2,
  heading: 2,
  button: 1.3,
  body: 2,
  bodyStrong: 2,
  meta: 2,
  label: 1.3,
  caption: 1.3,
}
