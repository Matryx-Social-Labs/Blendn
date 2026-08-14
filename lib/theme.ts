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
  input: 32,
  card: 32,
  pill: 9999,
} as const

/** Every input and the primary button are this tall. Well over the 44pt floor. */
export const EMBER_CONTROL_HEIGHT = 64

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
  bodyMedium: 'Manrope_500Medium',
  bodySemiBold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
} as const

/**
 * The onboarding type scale, measured off the frames.
 *
 * Whole styles rather than loose sizes: every one of these pairs a family with
 * a size, a line height and — for three of them — letter spacing that is not
 * optional. `display` at 56pt with default tracking is a visibly different
 * screen from the design.
 */
export const EMBER_TYPE = {
  /** "The basics". One per screen, and it is the screen's whole identity. */
  display: {
    fontFamily: EMBER_FONTS.displayExtraBold,
    fontSize: 56,
    lineHeight: 56,
    letterSpacing: -2.8,
    color: EMBER.textPrimary,
  },
  /** The sentence under the display line. */
  subtitle: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textSecondary,
  },
  /** "FIRST NAME". Uppercased in the string, not by `textTransform`. */
  fieldLabel: {
    fontFamily: EMBER_FONTS.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 1.4,
    color: EMBER.textSecondary,
  },
  input: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 16,
    color: EMBER.textPrimary,
  },
  /** The DD / MM / YYYY boxes, a step up so three short values stay legible. */
  inputCentered: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 18,
    color: EMBER.textPrimary,
    textAlign: 'center' as const,
  },
  helper: {
    fontFamily: EMBER_FONTS.bodyRegular,
    fontSize: 12,
    lineHeight: 16,
    color: EMBER.textTertiary,
  },
  chip: {
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 16,
    lineHeight: 24,
  },
  button: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 18,
    lineHeight: 28,
    letterSpacing: -0.45,
    color: EMBER.onGradient,
  },
  /** "CURATION PHASE". 9.6pt only works because the tracking is 2.88. */
  eyebrow: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 9.6,
    lineHeight: 14.4,
    letterSpacing: 2.88,
    color: EMBER.accent,
  },
  /** The "30%" beside the progress bar. */
  progress: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 16,
    lineHeight: 24,
    color: EMBER.textSecondary,
  },
} as const
