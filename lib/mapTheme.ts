/**
 * Every colour and size the home map draws with, in one place (step 2c).
 *
 * PROVISIONAL. The owner approved this look on 2026-10-09 and will redesign
 * the whole app from a Claude Design link; a map redesign is meant to be an
 * edit to this file alone. Nothing else under `lib/` or `components/` holds a
 * map colour, height, radius, timing or light setting.
 *
 * Colours are checked against the brand tokens (`colors.css`, lifted from
 * Blendn-Admin `app/globals.css`). A value that is not a token says why.
 * The look itself is `.context/plans/3d-map-research.md` §4.2.
 */

/** The brand tokens the map uses, by their `colors.css` names. */
const TOKEN = {
  brandOrange: '#F05423', // --brand-orange
  brandRose: '#BE5C71', // --brand-rose
  appAccent: '#FF906D', // --app-accent
  appPage: '#0F0E0E', // --app-page
} as const

/**
 * Brand purple (--brand-purple #8F49AA) is 3.4:1 on the map's ground, ~3:1
 * beside a building: too weak to carry a surface. This lighter step of it is
 * 5.3:1 (research §3.4). Not a token.
 */
const PURPLE_LIGHT = '#B07CC6'

/** Not a token: a hotter step between orange and accent that reads as light on the dark ground (6.8:1). */
const EMBER_GLOW = '#FF6A3D'

export const MAP_THEME = {
  /**
   * The basemap. None of these are tokens: they are the map's own neutrals,
   * kept dark and unsaturated so the only saturated colour on it is ours.
   */
  base: {
    /** A step above --app-page so the page and the map read as two surfaces (the app's `EMBER.surfaceMedia`). */
    ground: '#141313',
    park: '#18201A',
    water: '#0E1620',
    roadMinor: '#232121',
    roadMajor: '#2E2B2A',
    roadMotorway: '#3A3533',
    label: '#8A8584',
    labelHalo: TOKEN.appPage,
  },

  /**
   * Every building that is not lit. Opaque (translucent extrusions show
   * through each other), and a warm grey that gets lighter with height so
   * walls clear the ground after shading. Not tokens: the city is meant to
   * recede (research §0.2).
   */
  city: {
    minZoom: 14,
    /** `[height in metres, colour]`, interpolated linearly. */
    ramp: [
      [5, '#36312E'],
      [60, '#5C534C'],
    ],
  },

  /**
   * One light for every extrusion. `anchor: map`, because the default
   * (`viewport`) shades walls wrongly at any bearing but 0 and 180 in the
   * native SDK we ship (maplibre-native#4658). Warm white, not a token: it is a
   * light, not a surface, and a tint lifts the darkest walls a little.
   */
  light: {
    anchor: 'map',
    position: [1.2, 20, 35],
    color: '#FFF4EC',
    intensity: 0.35,
  },

  /** A building drawn lit, over the city's own copy of it. */
  lit: {
    /** Stylised minimum (owner, 2026-10-09): 90% of the tiles' buildings are a 5 m slab. */
    minHeightM: 15,
    /** Drawn this much wider and taller than the city's building, so the two never share a face (no flicker). */
    outsetM: 0.5,
    raiseM: 0.75,
    /** The top share of the height drawn in the crown colour. */
    crownShare: 0.25,
  },

  event: {
    walls: TOKEN.brandOrange,
    crown: TOKEN.appAccent,
    glow: EMBER_GLOW,
  },

  venue: {
    walls: TOKEN.brandRose,
    crown: PURPLE_LIGHT,
    glow: TOKEN.brandRose,
  },

  /** A pin with no building under it: a slim pillar on the public pin. */
  beacon: {
    radiusM: 6,
    sides: 16,
    heightM: 50,
    /** Solid bands stacked up the pillar (an extrusion has no gradient of its own). */
    bands: 6,
    /** Bottom to top. */
    event: [TOKEN.brandOrange, TOKEN.brandRose, PURPLE_LIGHT],
    venue: [TOKEN.brandRose, PURPLE_LIGHT],
  },

  /** A soft circle flat on the ground under a live event or a beacon. Never sized by anything but this. */
  glow: {
    radiusM: 60,
    /** Metres become pixels at this latitude (Bengaluru); within 10% for any Indian city. */
    referenceLatitude: 13,
    /** A beacon's glow, still. */
    still: 0.3,
    /** A live event's glow breathes between these over one period, through paint transitions. */
    pulseLow: 0.15,
    pulseHigh: 0.35,
    periodMs: 1600,
    /** Reduced motion, or the screen out of view: no breathing. */
    steady: 0.3,
  },

  /** Below the buildings' zoom, a pin is a dot (and a venue's glow steps with its bucket). */
  pin: {
    dotRadiusPx: 6,
    dotStroke: TOKEN.appPage,
    dotStrokePx: 2,
    glowPxPerStep: 12,
    glowOpacity: 0.5,
    event: { live: EMBER_GLOW, later: TOKEN.brandOrange },
    venue: { live: PURPLE_LIGHT, later: TOKEN.brandRose },
  },

  /** The name above a lit roof. Only the nearest few on screen get one. */
  chip: {
    max: 4,
    /** Clear of the roof by this much. */
    gapPx: 6,
    /** A long name ends in an ellipsis here rather than covering the street. */
    maxWidthPx: 200,
  },
} as const

export type MapTheme = typeof MAP_THEME
