/**
 * Every colour, size, timing and camera setting the home map draws with, in
 * one place (step 2c).
 *
 * PROVISIONAL. The owner approved the look of prototype v2 on 2026-10-09
 * (`.context/prototypes/3d-map/`, research §4.2), and the brighter, labelled
 * night basemap (variant B) on 2026-10-15, and will redesign the whole
 * app from a Claude Design link; a map redesign is meant to be an edit to this
 * file alone. Nothing else under `lib/` or `components/` holds a map colour,
 * height, radius, timing or light setting (`__tests__/mapLit.test.ts`).
 *
 * Colours are checked against the brand tokens (`colors.css`, lifted from
 * Blendn-Admin `app/globals.css`). App tokens come from `lib/theme.ts`, so they
 * have one source; the brand tokens the app theme does not carry are below.
 * A value that is not a token says why.
 */
import { EMBER, SPACE } from './theme'

/** Brand tokens `lib/theme.ts` does not carry, by their `colors.css` names. */
const TOKEN = {
  brandOrange: '#F05423', // --brand-orange
  brandRose: '#BE5C71', // --brand-rose
  emberEnd: '#FF6D8D', // the far end of --gradient-ember
} as const

/**
 * A lighter, pinker step of brand purple (--brand-purple #8F49AA is 3.4:1 on
 * the map's ground, too weak to carry a roof). The prototype's venue roof.
 * Not a token.
 */
const ORCHID = '#D277C4'

/** Not a token: a hotter step between orange and accent that reads as light on the dark ground. */
const EMBER_GLOW = '#FF6A3D'

/** Not a token: the map's lightest neutral, for names of places and the credit. 6.9:1 on the label halo. */
const PLACE_GREY = '#9A98AA'

export const MAP_THEME = {
  camera: {
    /** Where the map opens (and where "my location" goes back to): close enough that a lit building and a beacon read as 3D, tilted so they stand up. */
    zoom: 16,
    pitch: 55,
    /** Farther than this from where the map is, a move is to another city: no flight, a jump under a fade (design kit motion #41). */
    acrossCityKm: 30,
    /** Within a city, the camera eases this long. */
    easeMs: 600,
    /** Across cities, the map's ground fades off the jump this long. */
    fadeMs: 200,
  },

  /**
   * The basemap: variant B of the contrast prototype (owner, 2026-10-15;
   * `.context/prototypes/map-contrast/REPORT.md`). None of these are tokens:
   * they are the map's own neutrals, dark and cool, so the only warm, saturated
   * colour on the map is ours. The streets read as lines you can follow (every
   * road 2:1 or more on the ground); water and park are hue steps, not light ones.
   */
  base: {
    ground: '#14131C',
    park: '#152A1E',
    water: '#132C47',
    roadMinor: '#4B4A56',
    roadMajor: '#585764',
    /** Major roads below the buildings' zoom: 2.4:1, so they do not compete with the pin dots there. */
    roadMajorFar: '#53525F',
    /** Under secondary roads and up, a pixel each side, from the buildings' zoom. */
    roadMajorCasing: '#605F6C',
    roadMotorway: '#5D5C69',
    /** Road and street names: 5.3:1 on the halo (4.5:1 is the floor). */
    label: '#868495',
    labelHalo: '#0E0D15',
  },

  /** Names beyond the roads: streets at walking zoom, water, neighbourhoods and places. */
  labels: {
    /** Street names (minor, service and pedestrian streets) from this zoom. */
    streetMinZoom: 15,
    /** Neighbourhood, suburb, town and city names. 6.9:1 on the halo. */
    place: PLACE_GREY,
    /** River and lake names, in italic. 5.3:1 on the halo. */
    water: '#6A89AD',
  },

  /**
   * Every building that is not lit. Opaque (translucent extrusions show
   * through each other); a cool dark grey that gets a step lighter with height
   * so depth survives, and still clears the ground once the light shades it
   * (research §0.2). Not tokens: the city is meant to recede.
   */
  city: {
    minZoom: 14,
    /** `[height in metres, colour]`, interpolated linearly. */
    ramp: [
      [0, '#1F1E27'],
      [15, '#26252F'],
      [40, '#2F2E39'],
      [90, '#3A3944'],
    ],
  },

  /**
   * One light for every extrusion. `anchor: map`, because the default
   * (`viewport`) shades walls wrongly at any bearing but 0 and 180 in the
   * native SDK we ship (maplibre-native#4658). A cool moonlight from the
   * south-west, so walls separate from roofs. Not a token: a light, not a surface.
   */
  light: {
    anchor: 'map',
    position: [1.2, 20, 35],
    color: '#E2E5FF',
    intensity: 0.45,
  },

  /** A building drawn lit, over the city's own copy of it. */
  lit: {
    /** Stylised minimum (owner, 2026-10-09): 90% of OpenFreeMap's buildings are a 5 m slab. */
    minHeightM: 15,
    /** Drawn this much wider and taller than the city's building, so the two never share a face (no flicker). */
    outsetM: 0.5,
    raiseM: 0.75,
    /** The top share of the height drawn in the crown colour; at a tilt the roof is most of what shows. */
    crownShare: 0.25,
    /** Solid bands the walls are stacked from, dark at the foot to the brand colour under the crown. */
    wallBands: 4,
    /** At most this many pins are lit, the nearest to the centre of the view. */
    max: 12,
  },

  event: {
    /** Foot to top. The foot is not a token: a darker step of brand orange, so the wall reads as lit from above. */
    walls: ['#A8330F', TOKEN.brandOrange],
    crown: EMBER.accent,
    /** A building in our tiles is one colour; live, it is a brighter step of the accent. Not a token. */
    liveCrown: '#FFB394',
    glow: EMBER_GLOW,
  },

  venue: {
    /** Foot to top. The foot is not a token: a darker step of brand rose. */
    walls: ['#7A3A52', TOKEN.brandRose],
    crown: ORCHID,
    /** Live, a brighter step of orchid. Not a token. */
    liveCrown: '#E9A6DE',
    glow: TOKEN.brandRose,
  },

  /** A pin with no building under it: a pillar on the public pin. Never a ring: a ring reads as a boundary. */
  beacon: {
    radiusM: 10,
    sides: 16,
    heightM: 70,
    /** Solid bands stacked up the pillar (an extrusion has no gradient of its own). */
    bands: 8,
    /** Foot to top: ember → rose → orchid, venues rose → orchid. */
    event: [EMBER_GLOW, TOKEN.emberEnd, ORCHID],
    venue: [TOKEN.brandRose, ORCHID],
  },

  /**
   * A soft circle flat on the ground under every lit place. Always this size
   * around the public pin, never sized by anything a place carries.
   */
  glow: {
    radiusM: 70,
    /** Metres become pixels at this latitude (Bengaluru); within 10% for any Indian city. */
    referenceLatitude: 13,
    /** Past this zoom the glow stops growing on screen: a huge blur is all overdraw. */
    maxZoom: 18,
    /** A lit building's glow, still. */
    still: 0.3,
    /** A beacon's glow, still: a pillar is thin, its foot carries it. */
    beacon: 0.5,
    /** A live event's glow breathes between these, through paint transitions. */
    pulseLow: 0.15,
    pulseHigh: 0.35,
    periodMs: 1600,
    /** It breathes this long after the view or the places change, then holds steady (WCAG 2.2.2; the map stops redrawing). */
    breatheForMs: 5000,
    /** Reduced motion, out of view, or done breathing. */
    steady: 0.3,
  },

  /** Below the buildings' zoom, a pin is a dot (and a venue's glow steps with its bucket). */
  pin: {
    dotRadiusPx: 6,
    dotStroke: EMBER.bg,
    dotStrokePx: 2,
    glowPxPerStep: 12,
    glowOpacity: 0.5,
    event: { live: EMBER_GLOW, later: TOKEN.brandOrange },
    venue: { live: ORCHID, later: TOKEN.brandRose },
  },

  /** The name above a lit roof. Only the nearest few on screen get one. */
  chip: {
    max: 4,
    /** Clear of the roof by this much. */
    gapPx: 6,
    /** A long name ends in an ellipsis here rather than covering the street. */
    maxWidthPx: 200,
    /** The smallest target a finger can hit (44 pt). */
    minTouchPx: 44,
  },

  /**
   * The corner credit (OSMF attribution guidelines): there as the map opens,
   * gone on the first gesture or after `showForMs`; About › Map data keeps it.
   */
  credit: {
    /** 6.5:1 on the ground. */
    color: PLACE_GREY,
    opacity: 0.9,
    showForMs: 5000,
    fadeMs: 400,
  },

  /** "My location": a round control riding a gap above the drawer, fading out past half. PLACEHOLDER (SCRUM-667). */
  locate: {
    /** Round, and the smallest target a finger can hit. */
    sizePx: 44,
    /** Clear of the drawer's top edge by this much. */
    gapPx: SPACE.md,
  },
} as const

export type MapTheme = typeof MAP_THEME
