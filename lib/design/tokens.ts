/*
 * The redesign’s tokens. GENERATED from design/tokens.json by
 * scripts/generate-design-tokens.js (`npm run tokens`): do not edit by hand.
 * `__tests__/designTokensGenerated.test.ts` fails if this drifts from the JSON.
 *
 * `lib/theme.ts` (EMBER, TYPE, SPACE) is what today’s screens still use; each
 * moves to these as its screen is redesigned.
 */

/** Colour, DESIGN-BRIEF §4. Dark only. `textOnGradient` is white on `GRADIENT.fill`; `textOnOrangeFlat` is ink on `brandOrange` (white on it is 3.50:1). */
export const COLOR = {
  ink: '#0D0C0C',
  surfaceSunken: '#1A1818',
  surface: '#242121',
  surfaceRaised: '#2E2A2A',
  textPrimary: '#FFFFFF',
  textSecondary: '#B3AEAD',
  textTertiary: '#9A9594',
  textPlaceholder: '#8F949D',
  hairline: 'rgba(255,255,255,0.10)',
  hairlineStrong: 'rgba(255,255,255,0.16)',
  inputBorder: 'rgba(255,255,255,0.38)',
  focusRing: '#FFFFFF',
  scrim: 'rgba(13,12,12,0.60)',
  backdrop: 'rgba(0,0,0,0.60)',
  brandOrange: '#F05423',
  brandRose: '#BE5C71',
  brandViolet: '#925DA9',
  brandVioletText: '#A47BBF',
  gradientFillStart: '#D83F0F',
  gradientFillMid: '#BB556B',
  gradientFillEnd: '#925DA9',
  orbOrangeAlpha: 0.36,
  orbVioletAlpha: 0.28,
  orbRoseAlpha: 0.2,
  orbFeedScale: 0.5,
  grainAlpha: 0.05,
  live: '#30D158',
  warning: '#FFBC5C',
  destructive: '#FF5A4F',
  destructiveFill: '#D92D20',
  liveTint: 'rgba(48,209,88,0.16)',
  warningTint: 'rgba(255,188,92,0.16)',
  destructiveTint: 'rgba(255,90,79,0.16)',
  selectionFill: '#FFFFFF',
  selectionInk: '#0D0C0C',
  selectionInkSecondary: 'rgba(13,12,12,0.60)',
  selectionEmberFill: '#552D21',
  selectionEmberGlyph: '#FF8A5C',
  selectionRoseFill: '#4C3036',
  selectionRoseGlyph: '#EB8EA1',
  selectionVioletFill: '#433247',
  selectionVioletGlyph: '#B58FD0',
  tabCapsule: 'rgba(255,255,255,0.22)',
  switchOffTrack: '#959090',
  chipFillOnGlass: 'rgba(255,255,255,0.08)',
  bgPage: '#0D0C0C',
  surfaceCard: '#242121',
  surfaceWell: '#1A1818',
  surfaceMenu: '#2E2A2A',
  textBody: '#FFFFFF',
  textDetail: '#B3AEAD',
  textHelper: '#9A9594',
  textOnGradient: '#FFFFFF',
  textOnSelection: '#0D0C0C',
  textOnOrangeFlat: '#0D0C0C',
  divider: 'rgba(255,255,255,0.10)',
  dividerOnPhoto: 'rgba(255,255,255,0.16)',
  link: '#FFFFFF',
  linkHover: '#B3AEAD',
} as const

/** The two gradients, 135° top-left → bottom-right (§4.3). `brand` for the mark and graphics, `fill` for any surface with white text on it. Drawn only by `<GradientFill>`. */
export const GRADIENT = {
  brand: {
    angle: 135,
    colors: ['#F05423', '#BE5C71', '#925DA9'],
    locations: [0, 0.5, 1],
  },
  fill: {
    angle: 135,
    colors: ['#D83F0F', '#BB556B', '#925DA9'],
    locations: [0, 0.5, 1],
  },
} as const

/** Material tiers (§5): glass (iOS 26+), blur (iOS 16.4–25), solid (Android Tier B, Reduce Transparency). Drawn only by `<Material>`. */
export const MATERIAL = {
  glassBlur: 20,
  glassTintText: 'rgba(13,12,12,0.80)',
  glassTintToast: 'rgba(13,12,12,0.80)',
  glassTintMedia: 'rgba(13,12,12,0.25)',
  glassTintBar: 'rgba(13,12,12,0.80)',
  glassTintSheet: 'rgba(13,12,12,0.80)',
  glassTintIcon: 'rgba(13,12,12,0.45)',
  glassDimMedia: 0.45,
  glassSpecular: 'rgba(255,255,255,0.18)',
  blurMaterial: 'rgba(26,24,24,0.72)',
  blurTintBar: 'rgba(13,12,12,0.86)',
  blurTintSheet: 'rgba(13,12,12,0.94)',
  blurRadius: 24,
  solidBar: 'rgba(26,24,24,0.94)',
  solidControl: '#242121',
  solidSheet: '#242121',
  solidTopHairline: 'rgba(255,255,255,0.10)',
  solidNoiseAlpha: 0.03,
  scrimPill: 'rgba(13,12,12,0.60)',
  scrimPillReduceTransparency: 'rgba(13,12,12,0.85)',
  fillOnGlass: 'rgba(255,255,255,0.08)',
  hairlineIncreaseContrast: 'rgba(255,255,255,0.50)',
  glassEdge: {
    width: 0.5,
    color: 'rgba(255,255,255,0.10)',
  },
  solidInnerHighlight: {
    colors: ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0)'],
    height: 12,
  },
  glowCheckIn: [
    {
      radius: 16,
      color: 'rgba(240,84,35,0.55)',
    },
    {
      radius: 28,
      color: 'rgba(190,92,113,0.40)',
    },
  ],
} as const

/** Registered font names by family and weight (`lib/fonts.ts` loads them). Weight lives in the name: Android ignores `fontWeight` on custom fonts. */
export const FONT_FAMILY = {
  brand: {
    400: 'Satoshi_400Regular',
    500: 'Satoshi_500Medium',
    700: 'Satoshi_700Bold',
    900: 'Satoshi_900Black',
  },
  mono: {
    500: 'GeistMono_500Medium',
    700: 'GeistMono_700Bold',
  },
} as const

/** Type roles (§6): Satoshi for words, Geist Mono for labels and numbers. */
export const TYPE = {
  moment: {
    fontFamily: 'Satoshi_900Black',
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.3,
  },
  display: {
    fontFamily: 'Satoshi_700Bold',
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.7,
  },
  title: {
    fontFamily: 'Satoshi_700Bold',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  heading: {
    fontFamily: 'Satoshi_700Bold',
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  button: {
    fontFamily: 'Satoshi_700Bold',
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: 0,
  },
  body: {
    fontFamily: 'Satoshi_400Regular',
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: 0,
  },
  bodyStrong: {
    fontFamily: 'Satoshi_500Medium',
    fontSize: 17,
    lineHeight: 24,
    letterSpacing: 0,
  },
  meta: {
    fontFamily: 'Satoshi_400Regular',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 0,
  },
  caption: {
    fontFamily: 'Satoshi_500Medium',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.1,
  },
  label: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  numericDisplay: {
    fontFamily: 'GeistMono_700Bold',
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1,
  },
} as const

/** How far each role may grow with the phone’s text size. */
export const MAX_FONT_SCALE = {
  moment: 1.3,
  display: 2,
  title: 2,
  heading: 2,
  button: 2,
  body: 2,
  bodyStrong: 2,
  meta: 2,
  caption: 1.3,
  label: 2,
  numericDisplay: 1.5,
} as const

export const NUMERIC = {
  fontFamily: 'GeistMono_500Medium',
  fontVariant: ['tabular-nums'],
} as const

export const TYPE_FLOOR = 12 as const

export const SPACE = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  gutter: 24,
  sectionGap: 32,
  headingGap: 16,
  listGap: 12,
  tabBarInset: 16,
  tabBarBottomGapAndroid: 12,
  badgeRing: 2,
} as const

export const RADIUS = {
  tabBar: 32,
  disc: 28,
  button: 28,
  circleButton: 22,
  circleButtonAndroid: 24,
  card: 32,
  mediaInCard: 24,
  rowInCard: 16,
  thumb: 8,
  sheet: 24,
  dialogAndroid: 28,
  capsule: 999,
  pressedAndroid: 12,
} as const

export const SIZE = {
  primary: 56,
  input: 56,
  control: 48,
  tag: 32,
  badge: 18,
  tabBar: 64,
  disc: 56,
  circleButton: 44,
  circleButtonAndroid: 48,
  topBarAndroid: 64,
  targetIos: 44,
  targetAndroid: 48,
} as const

export const ICON = {
  inline: 16,
  control: 20,
  nav: 24,
  stroke: 1.5,
  strokeActive: 2.25,
  strokeAt16: 1,
  strokeAt20: 1.25,
} as const

/** The seven springs (§9.2), mass 1, one table for both platforms. */
export const SPRING = {
  press: {
    stiffness: 1542,
    damping: 78.5,
    mass: 1,
  },
  snap: {
    stiffness: 439,
    damping: 36.9,
    mass: 1,
  },
  settle: {
    stiffness: 224,
    damping: 29.9,
    mass: 1,
  },
  travel: {
    stiffness: 158,
    damping: 25.1,
    mass: 1,
  },
  fling: {
    stiffness: 247,
    damping: 25.1,
    mass: 1,
  },
  pop: {
    stiffness: 195,
    damping: 19.5,
    mass: 1,
  },
  celebrate: {
    stiffness: 110,
    damping: 13.6,
    mass: 1,
  },
} as const

/** Durations in ms. `hold` keeps its speed under Reduce Motion: the hold’s speed is information. The export’s `hold-staff` is dropped: ROUND3 G3 removed the staff hold (staff type the door pass’s rotating code). */
export const DURATION = {
  instant: 0,
  press: 100,
  quick: 160,
  base: 220,
  medium: 320,
  long: 520,
  moment: 1000,
  ambientA: 9000,
  ambientB: 11600,
  hold: 900,
  toastDwell: 5000,
  toastDwellAction: 10000,
  spinnerPeriod: 900,
  loaderMorph: 320,
} as const

/** Cubic-bezier control points, for `Easing.bezier(...)`. */
export const EASING = {
  standard: [0.2, 0, 0, 1],
  entrance: [0.16, 1, 0.3, 1],
  exit: [0.4, 0, 1, 1],
  gentle: [0.33, 1, 0.68, 1],
  snapOut: [0.23, 1, 0.32, 1],
  sheet: [0.32, 0.72, 0, 1],
  linear: [0, 0, 1, 1],
  sendVertical: [0.2, 0.01, 0.28, 0.91],
} as const

export const STAGGER = {
  tight: 18,
  base: 28,
  loose: 40,
  windowMax: 200,
  itemsMax: 8,
} as const

/** The glyph verbs’ numbers (Glyph.tsx): the pop’s start scale, the hop in pt, the spin and tilt in degrees, the flicker’s dips and steps (fractions of `DURATION.medium`). */
export const GLYPH = {
  popFrom: 0.85,
  hop: 4,
  spin: 180,
  tilt: 14,
  flickerDips: [0.35, 0.6],
  flickerSteps: [0.25, 0.1875, 0.25, 0.3125],
} as const

export const PRESS = {
  scale: 0.97,
  scaleDisc: 0.9,
} as const

export const RISE = {
  list: 8,
  modal: 24,
  message: 12,
} as const

export const ORBS = {
  drift: 40,
  scaleMin: 0.96,
  scaleMax: 1.04,
} as const

export const SHAKE = {
  distance: 8,
  duration: 320,
} as const

/** The Reduce Motion values, kept apart so nothing reads them as the defaults (ROUND3 B1). Read through `motionTokens(reduceMotion)` in `lib/motion.ts`. */
export const REDUCE_MOTION = {
  duration: {
    quick: 160,
    base: 200,
    medium: 320,
    long: 200,
  },
  rise: {
    list: 0,
    modal: 0,
    message: 0,
  },
  orbs: {
    drift: 0,
    scaleMin: 1,
    scaleMax: 1,
  },
  shake: {
    distance: 0,
  },
} as const

export const CREATURE_PALETTES = [
  ['#3A2A3E', '#5A3328'],
  ['#2E3A33', '#4A2E3A'],
  ['#3A3328', '#2C2F42'],
  ['#422B2B', '#2F3A2C'],
  ['#2B3838', '#3A2A3E'],
  ['#3E3024', '#2E3A33'],
  ['#332A40', '#422B2B'],
  ['#2F3A2C', '#4A3A2E'],
] as const

export const VENUE_PLATES = {
  brewery: ['#3A2A24', '#5A3328'],
  gardenBar: ['#2E3A33', '#3A4A2E'],
  bar: ['#3A3328', '#4A3A2E'],
  club: ['#2C2F42', '#3A2A3E'],
  liveMusic: ['#422B2B', '#3A2A3E'],
  cafe: ['#4A3A2E', '#3A2A24'],
} as const

export const PALETTE_GLYPH = {
  creature: '#FFFFFF',
  plate: 'rgba(255,255,255,0.70)',
} as const
