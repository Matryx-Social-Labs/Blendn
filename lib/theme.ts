/*
 * Shared visual tokens for Blendn's UI foundation.
 *
 * Two palettes live here on purpose. `APP_COLORS` is what twenty-six files
 * render today; `EMBER` below is the Liquid Ember palette from the Figma
 * *🕓 Updates* canvas, which onboarding is built against and the rest migrates
 * onto screen by screen.
 *
 * Not a rename, and not a second source of truth by accident. Repointing
 * `APP_COLORS.backgroundBase` from black to `#0F0E0E` would restyle every
 * screen in the app in one commit, with nobody having looked at any of them —
 * and the two palettes genuinely differ in more than shade: Ember has a
 * gradient as its primary action, dark text on top of it, and a warm
 * near-black rather than true black. They coexist until the last screen moves,
 * and then `APP_COLORS` goes.
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
  /** Page background. Warm near-black — not `#000`, which reads blue beside the gradient. */
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
  /** Helper text under a field. Deliberately dimmer than `textSecondary`. */
  textTertiary: '#787574',
  /** Placeholder inside an input. Cool grey, so an empty field cannot be mistaken for a filled one. */
  textPlaceholder: '#6B7280',

  /**
   * The primary action is a gradient, not a colour, so it cannot be a single
   * token. `gradientFrom`/`gradientTo` at `GRADIENT_ANGLE`; the two `on*`
   * values are the dark text that sits on top of it.
   */
  gradientFrom: '#FF906D',
  gradientTo: '#FF6D8D',
  /** Text on a gradient button. Dark on warm — white on this gradient fails contrast. */
  onGradient: '#5B1600',
  /** Text on a selected gradient chip. Darker again: the chip is smaller type. */
  onGradientChip: '#2D0700',
  /** The gradient's warm end as a flat colour, for eyebrow text and icons. */
  accent: '#FF906D',

  /** Hairline dividers and control outlines. */
  separator: 'rgba(255,255,255,0.1)',
  /** Destructive actions and errors. */
  destructive: '#FF453A',
  success: '#30D158',
} as const

/**
 * 135°, and it has to be expressed twice.
 *
 * `expo-linear-gradient` takes start/end points in unit space rather than an
 * angle, and 135° in CSS runs top-left to bottom-right — which is `{x:0,y:0}`
 * to `{x:1,y:1}`, not the `{x:0,y:1}` a vertical default would give.
 */
export const EMBER_GRADIENT = {
  colors: [EMBER.gradientFrom, EMBER.gradientTo] as const,
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
} as const

/**
 * The two blurred blobs behind every onboarding screen.
 *
 * 5% opacity under a 50–60px blur: at full strength this is a colour wash, and
 * at this strength it is the faint warmth the flat `#0F0E0E` would otherwise
 * lack. Positions are per-screen; only the colours and radii are shared.
 */
export const EMBER_ATMOSPHERE = {
  warm: { color: 'rgba(255,144,109,0.05)', blur: 60 },
  cool: { color: 'rgba(255,109,141,0.05)', blur: 50 },
} as const

/** The glow under the primary button and the progress fill. */
export const EMBER_GLOW = {
  button: {
    shadowColor: EMBER.gradientFrom,
    shadowOpacity: 0.2,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  progress: {
    shadowColor: EMBER.gradientFrom,
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
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
  input: 32,
  card: 32,
  pill: 9999,
} as const

/** Every input and the primary button are this tall. Same as `CONTROL.lg`. */
export const EMBER_CONTROL_HEIGHT = 56

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
 * The old per-frame names, pointed at the scale above.
 *
 * Kept so the 60-odd files that spread `EMBER_TYPE.x` move onto the scale in the
 * same commit without a rename across all of them. New code uses `TYPE` or
 * `<Text variant>`; these go once nothing reads them.
 */
export const EMBER_TYPE = {
  actionPrimary: { ...TYPE.button, color: EMBER.onGradient },
  actionSecondary: TYPE.button,
  display: TYPE.display,
  subtitle: { ...TYPE.body, color: EMBER.textSecondary },
  fieldLabel: TYPE.label,
  input: TYPE.body,
  inputCentered: { ...TYPE.body, textAlign: 'center' as const },
  helper: { ...TYPE.meta, color: EMBER.textTertiary },
  chip: TYPE.bodyStrong,
  button: { ...TYPE.button, color: EMBER.onGradient },
  eyebrow: { ...TYPE.label, color: EMBER.accent },
  progress: { ...TYPE.label, color: EMBER.textSecondary },
  screenTitle: TYPE.display,
  sectionHeading: TYPE.heading,
  link: { ...TYPE.label, color: EMBER.accent },
  cardEyebrow: TYPE.label,
  cardValue: TYPE.body,
  cardTitleLarge: TYPE.title,
  cardTitle: TYPE.title,
  meta: TYPE.meta,
  cardBody: { ...TYPE.body, color: EMBER.textSecondary },
  tag: TYPE.label,
  categoryPill: TYPE.bodyStrong,
} as const
