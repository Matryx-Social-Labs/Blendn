import { StyleSheet, View } from 'react-native'
import Svg, { Circle, Path } from 'react-native-svg'

import { CREATURE_PALETTES, ICON, PALETTE_GLYPH, RADIUS, SPACE } from '../../lib/design/tokens'
import { fnv1a, nounOf } from '../../lib/pseudonymAvatar'

/*
 * The creature set (ROUND3 B7, "Faces"): the bespoke outlined animals that
 * replace the stock ones on a pseudonym's disc. Ported from the design
 * export's guidelines/creatures/creatures.js (`window.BNC`) path for path:
 * 24×24, stroke 1.5, round caps and joins, no fill.
 * `__tests__/dsCreatures.test.tsx` holds the three tables to the design's
 * bytes, so an edit here is a design change, made there first.
 */
export const CREATURE_GLYPHS = {
  fox: 'M4 4.5 8.5 9.5h7L20 4.5l-1 8.5c-.6 4-3.3 7-7 7s-6.4-3-7-7Z M9.5 12.5h.01M14.5 12.5h.01 M11 16.5h2l-1 1.4Z',
  wolf: 'M5 4l4 5h6l4-5-.5 9c-.5 4-3.5 7-6.5 7s-6-3-6.5-7Z M9.5 12h.01M14.5 12h.01 M12 15.5v1.5 M10.5 18.5c.8.7 2.2.7 3 0',
  coyote: 'M5 5l4 4.5h6L19 5l-.5 8c-.4 3.5-3 6-6.5 6S6 16.5 5.5 13Z M9.5 12h.01M14.5 12h.01 M12 15v2l-1.5 1.5M12 17l1.5 1.5',
  panda: 'M12 6.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M6.5 4.5a2.4 2.4 0 1 0 0 .01M17.5 4.5a2.4 2.4 0 1 0 0 .01 M9.3 12.2a1.7 2 0 1 0 0 .01M14.7 12.2a1.7 2 0 1 0 0 .01 M11.2 16h1.6',
  bear: 'M12 6a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z M6 5.5a2.5 2.5 0 1 0 0 .01M18 5.5a2.5 2.5 0 1 0 0 .01 M9.5 11.5h.01M14.5 11.5h.01 M12 14.5a2 1.5 0 1 0 0 .01',
  koala: 'M12 7a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z M4.5 9a3 3 0 1 0 0 .01M19.5 9a3 3 0 1 0 0 .01 M9.5 12h.01M14.5 12h.01 M12 14a1.4 2.4 0 1 0 0 .01',
  owl: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Z M9 11a2.3 2.3 0 1 0 0 .01M15 11a2.3 2.3 0 1 0 0 .01 M11 14l1 1.8 1-1.8 M6.5 6.5 8 4.2M17.5 6.5 16 4.2',
  tiger: 'M12 5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15Z M6 6.5a2 2 0 1 0 0 .01M18 6.5a2 2 0 1 0 0 .01 M9.5 11.5h.01M14.5 11.5h.01 M12 14l-1.2 1.5h2.4Z M8.5 7.5 9.5 10M15.5 7.5 14.5 10M12 5v2.5',
  lion: 'M12 7a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z M12 3.5a9 9 0 1 0 0 17.5 M9.8 11.5h.01M14.2 11.5h.01 M12 14l-1 1.3h2Z M10.5 16.5c.8.6 2.2.6 3 0',
  panther: 'M5 6l4 4h6l4-4-1 9c-.6 3.5-3 5.5-6 5.5s-5.4-2-6-5.5Z M9.5 12h.01M14.5 12h.01 M12 15l-1 1.2h2Z',
  lynx: 'M6 4l3 5.5h6L18 4l-.5 9.5c-.4 3-2.6 5.5-5.5 5.5s-5.1-2.5-5.5-5.5Z M9.5 12h.01M14.5 12h.01 M12 14.5l-1 1.2h2Z M6 4 4.5 2.5M18 4l1.5-1.5',
  cheetah: 'M12 5.5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M6.5 6a2 2 0 1 0 0 .01M17.5 6a2 2 0 1 0 0 .01 M9.5 11h.01M14.5 11h.01 M9.5 11l-1 3M14.5 11l1 3 M12 14l-1 1.2h2Z',
  dolphin: 'M12 4c4 0 7 3 7 7 0 3-2 5-4 6l-3 3-3-3c-2-1-4-3-4-6 0-4 3-7 7-7Z M9.5 10.5h.01M14.5 10.5h.01 M9.5 14c1.5 1.2 3.5 1.2 5 0 M12 4V2',
  whale: 'M4 12a8 7 0 0 1 16 0c0 4-3.5 7-8 7s-8-3-8-7Z M8.5 11h.01M15.5 11h.01 M8 15c2 1.5 6 1.5 8 0 M12 5V3M10.5 3h3',
  pufferfish: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M9.5 11h.01M14.5 11h.01 M10.5 15a1.5 1 0 1 0 3 0 M12 5V2.5M6.5 7.5 5 5.5M17.5 7.5 19 5.5M5 12H2.5M19 12h2.5M6.5 16.5 5 18.5M17.5 16.5l1.5 2',
  octopus: 'M12 4a6 6 0 0 0-6 6v3h12v-3a6 6 0 0 0-6-6Z M9.5 9.5h.01M14.5 9.5h.01 M6 13c-1 3-1 5 1 7M9 13c-.5 3 0 5 1 7M15 13c.5 3 0 5-1 7M18 13c1 3 1 5-1 7',
  penguin: 'M12 3a7 7 0 0 0-7 7v7a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4v-7a7 7 0 0 0-7-7Z M9.5 8.5h.01M14.5 8.5h.01 M12 10l-1.5 1.5h3Z M8.5 13a3.5 7 0 0 0 7 0',
  flamingo: 'M14 4a4 4 0 0 0-4 4v2c0 2 1 3 2 4v7 M14 4a4 4 0 0 1 4 4c0 2-1.5 3-3 3 M14 4 9 6 M15.5 7.5h.01 M12 14c-3 0-5-2-5-5',
  swan: 'M15 5a3 3 0 0 0-3 3v3c0 2 1 3 1 5 M15 5a3 3 0 0 1 3 3c0 1.5-1 2-2 2 M15 5l-4 1 M16 7.5h.01 M5 14c2 3 5 5 9 5s6-2 6-4H5Z',
  parrot: 'M12 3a6 6 0 0 0-6 6v4c0 3 2 5 4 5l2 3 2-3c2 0 4-2 4-5V9a6 6 0 0 0-6-6Z M12 3l4 2-4 2 M9.5 9h.01M14.5 9h.01 M9 13c1.5 1 4.5 1 6 0',
  toucan: 'M11 4a5.5 5.5 0 0 0-5.5 5.5v5.5a4 4 0 0 0 4 4h3a4 4 0 0 0 4-4V9.5A5.5 5.5 0 0 0 11 4Z M11 4l9 3-3 3-6-1 M8.5 9h.01',
  eagle: 'M12 4a6 6 0 0 0-6 6v4a6 6 0 0 0 12 0v-4a6 6 0 0 0-6-6Z M8.5 9l2 1.5M15.5 9l-2 1.5 M9.5 11h.01M14.5 11h.01 M12 12.5l-1.5 1.5 1.5 2.5 1.5-2.5Z',
  dove: 'M12 5a6 6 0 0 0-6 6v4a5 5 0 0 0 10 0v-4a6 6 0 0 0-4-6Z M10 10h.01M14 10h.01 M12 12l-1 1.2h2Z M6 11c-3 1-4 3-3 5 1-1 2-1 3-1',
  bird: 'M12 5a6 6 0 0 0-6 6v3a6 6 0 0 0 12 0v-3a6 6 0 0 0-6-6Z M9.5 10h.01M14.5 10h.01 M12 12l-1.2 1.2h2.4Z M8 5 6 3M16 5l2-2',
  stag: 'M9 9a3 7 0 0 0 6 0 M9 9c-1 4-.5 9 3 11 3.5-2 4-7 3-11 M9 9V4l-2 2M9 6l-2-1M15 9V4l2 2M15 6l2-1 M10.5 12h.01M13.5 12h.01 M12 15.5l-.8 1h1.6Z',
  gazelle: 'M9 10a3 6 0 0 0 6 0 M9 10c-1 3-.5 7 3 10 3.5-3 4-7 3-10 M9 10c-2-2-3-5-2-8M15 10c2-2 3-5 2-8 M10.5 12.5h.01M13.5 12.5h.01 M12 16l-.8 1h1.6Z',
  snake: 'M12 6a6 6 0 0 0-6 6c0 2 1 3 2 4s2 1 3 1h2c1 0 2 0 3-1s2-2 2-4a6 6 0 0 0-6-6Z M9.5 11h.01M14.5 11h.01 M12 14v2.5M12 16.5l-1 1.5M12 16.5l1 1.5 M9 4.5 10.5 7M15 4.5 13.5 7',
  otter: 'M12 6a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M6 6.5a2 2 0 1 0 0 .01M18 6.5a2 2 0 1 0 0 .01 M9.5 11.5h.01M14.5 11.5h.01 M12 14a2 1.5 0 1 0 0 .01 M8 17c1 .5 2 .5 3 0M13 17c1 .5 2 .5 3 0',
  badger: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M12 5v14 M8.5 8c1 2.5 1 5.5 0 8M15.5 8c-1 2.5-1 5.5 0 8 M9.5 11.5h.01M14.5 11.5h.01 M12 14.5a1.5 1 0 1 0 0 .01',
  bison: 'M12 6a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M6 10c-2 0-3.5-1.5-3.5-4 2 0 3.5 1.5 3.5 4M18 10c2 0 3.5-1.5 3.5-4-2 0-3.5 1.5-3.5 4 M12 4c-1.5 0-3 1-3 2.5h6C15 5 13.5 4 12 4Z M9.5 12h.01M14.5 12h.01 M10 16a2 1.5 0 0 0 4 0',
  gecko: 'M12 4a5 5 0 0 0-5 5v6a5 5 0 0 0 10 0V9a5 5 0 0 0-5-5Z M9.5 8.5a1 1 0 1 0 0 .01M14.5 8.5a1 1 0 1 0 0 .01 M9 12c2 1 4 1 6 0 M12 20v2 M7 15l-3 2M17 15l3 2M7 10 4 9M17 10l3-1',
  lemur: 'M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z M6 5.5a2 2 0 1 0 0 .01M18 5.5a2 2 0 1 0 0 .01 M9 11a2.5 2.5 0 1 0 0 .01M15 11a2.5 2.5 0 1 0 0 .01 M12 14.5l-1 1.2h2Z',
  horse: 'M9 9a3 7 0 0 0 6 0 M9 9c-1 4-.5 9 3 11 3.5-2 4-7 3-11 M9 9V5l2 1M15 9V5l-2 1 M12 4v5 M10.5 12.5h.01M13.5 12.5h.01 M11 16.5a1 1 0 0 0 2 0',
  unicorn: 'M9 10a3 7 0 0 0 6 0 M9 10c-1 4-.5 9 3 10 3.5-1 4-6 3-10 M9 10V6l2 1M15 10V6l-2 1 M12 7 10.5 1.5 13.5 1.5Z M12 7v3 M10.5 13h.01M13.5 13h.01 M11 17a1 1 0 0 0 2 0',
  hedgehog: 'M12 8a6 6 0 0 0-6 6v2h12v-2a6 6 0 0 0-6-6Z M9.5 12.5h.01M14.5 12.5h.01 M12 16a1 1 0 1 0 0 .01 M12 8V5M8.5 9 6.5 6.5M15.5 9l2-2.5M6.5 12 3.5 11M17.5 12l3-1 M10 16v2M14 16v2',
  butterfly: 'M12 6v12 M12 9c-1-3-4-5-7-4-1 2 0 5 2 6-2 1-3 4-2 6 3 1 6-1 7-4 M12 9c1-3 4-5 7-4 1 2 0 5-2 6 2 1 3 4 2 6-3 1-6-1-7-4 M12 6 10 3.5M12 6l2-2.5',
  bee: 'M12 7a5 7 0 1 0 0 14 5 7 0 0 0 0-14Z M7.6 11.5h8.8M7.6 15h8.8 M9 7.5 7 4M15 7.5l2-3.5 M7 11c-3-1-4.5 1-3.5 3S7 15 7 15M17 11c3-1 4.5 1 3.5 3S17 15 17 15',
  turtle: 'M12 6a7 5 0 0 0-7 5v3h14v-3a7 5 0 0 0-7-5Z M5 14l-2 3M19 14l2 3M8 14v3M16 14v3 M12 6V4a2 2 0 0 1 2 2 M8.5 11h7M10.5 8v6M13.5 8v6',
} as const

export type CreatureGlyph = keyof typeof CREATURE_GLYPHS

/**
 * Server noun → glyph: `NOUN_CHARACTERS` in lib/pseudonymAvatar.ts with each
 * emoji swapped for its drawn creature, then the nouns of the design's old
 * Lucide map (no server noun among them; the design keeps them for its
 * fixtures).
 */
export const CREATURE_NOUNS: Readonly<Record<string, CreatureGlyph>> = {
  panda: 'panda', dragon: 'snake', hydra: 'snake', falcon: 'eagle', eagle: 'eagle', hawk: 'eagle',
  griffin: 'eagle', tiger: 'tiger', wolf: 'wolf', coyote: 'coyote', dolphin: 'dolphin',
  panther: 'panther', jaguar: 'panther', cheetah: 'cheetah', lynx: 'lynx', owl: 'owl', fox: 'fox',
  bear: 'bear', lion: 'lion', stag: 'stag', moose: 'stag', gazelle: 'gazelle', cobra: 'snake',
  viper: 'snake', swan: 'swan', otter: 'otter', badger: 'badger', bison: 'bison', gecko: 'gecko',
  dove: 'dove', parrot: 'parrot', toucan: 'toucan', penguin: 'penguin', koala: 'koala',
  lemur: 'lemur', mustang: 'horse', stallion: 'horse', pegasus: 'horse', unicorn: 'unicorn',
  kraken: 'octopus', moth: 'butterfly', raven: 'bird', crane: 'bird', heron: 'bird', robin: 'bird',
  finch: 'bird', wren: 'bird', lark: 'bird', pelican: 'bird', puffin: 'bird', kite: 'bird',
  koel: 'bird',
  cat: 'lynx', leopard: 'cheetah', dog: 'wolf', rabbit: 'gazelle', hare: 'gazelle',
  deer: 'stag', crow: 'bird', sparrow: 'bird', snail: 'hedgehog', tortoise: 'turtle',
  frog: 'gecko', fish: 'pufferfish', squirrel: 'lemur', mouse: 'hedgehog', rat: 'hedgehog',
  beetle: 'bee', worm: 'snake', bug: 'bee',
}

/** For a noun that is not a creature ("Comet"): the client's 16-glyph cast, in its order. */
export const CREATURE_CAST: readonly CreatureGlyph[] = [
  'fox', 'panda', 'owl', 'octopus', 'lion', 'bee', 'butterfly', 'turtle', 'parrot', 'wolf', 'dolphin', 'flamingo', 'koala', 'unicorn', 'pufferfish', 'hedgehog',
]

/**
 * The design's `BNC.glyph`: a glyph's own name draws it, a mapped noun its
 * creature, anything else a cast member by FNV-1a of the noun — so every
 * "… Comet" is the same creature, as every "… Panda" is a panda.
 */
function creatureGlyph(nounOrGlyph: string): CreatureGlyph {
  const k = nounOrGlyph.toLowerCase()
  // `Object.hasOwn`, not the design's `G[k]`: "constructor" is not a creature.
  if (Object.hasOwn(CREATURE_GLYPHS, k)) return k as CreatureGlyph
  if (Object.hasOwn(CREATURE_NOUNS, k)) return CREATURE_NOUNS[k]
  return CREATURE_CAST[Math.abs(fnv1a(k)) % CREATURE_CAST.length]
}

/**
 * A pseudonym's creature and palette: the noun picks the creature, the whole
 * pseudonym the palette (the same 8-way hash `pseudonymAvatar` picks its hue
 * with), so one person is one disc everywhere under that name and a different
 * one at the next event.
 *
 * Feed it what `pseudonymAvatar` takes, the `markSeed` — never a user id.
 * Spread it into `<Creature>`.
 */
export function creatureFor(pseudonym: string): { glyph: CreatureGlyph; palette: number } {
  const seed = pseudonym.trim() || 'anonymous'
  return {
    glyph: creatureGlyph(nounOf(seed) ?? seed),
    palette: Math.abs(fnv1a(seed)) % CREATURE_PALETTES.length,
  }
}

/** The lower half of the disc; turned -45° it is the 135° split's second colour. */
const SECOND_HALF = 'M0 24A24 24 0 0 0 48 24Z'

/**
 * A pseudonym's disc: two colours split at 135°, the creature in white at
 * half the disc. `size` 24–112 (48 by default); `ring` is the 2pt cut-out ring
 * for a disc on a photo, outside the box as the design's box-shadow is.
 *
 * Decorative: the pseudonym beside it ("Cosmic Panda") is what is read out.
 *
 * ponytail: no Increase Contrast hairline yet, as in <Material>; it comes with
 * the one hook both need.
 */
export function Creature({
  glyph,
  palette,
  size = 48,
  ring,
}: {
  glyph: CreatureGlyph
  /** 0–7, from `creatureFor`. */
  palette: number
  size?: number
  ring?: string
}) {
  const [a, b] = CREATURE_PALETTES[palette % CREATURE_PALETTES.length]
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* A 48 box, so the glyph's 24 at its centre is half the disc and its stroke scales with it. */}
      <Svg width={size} height={size} viewBox="0 0 48 48">
        <Circle cx={24} cy={24} r={24} fill={a} />
        <Path d={SECOND_HALF} fill={b} transform="rotate(-45 24 24)" />
        <Path
          d={CREATURE_GLYPHS[glyph]}
          transform="translate(12 12)"
          fill="none"
          stroke={PALETTE_GLYPH.creature}
          strokeWidth={ICON.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      {ring ? <View testID="creature-ring" style={[styles.ring, { borderColor: ring }]} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    top: -SPACE.badgeRing,
    left: -SPACE.badgeRing,
    right: -SPACE.badgeRing,
    bottom: -SPACE.badgeRing,
    borderWidth: SPACE.badgeRing,
    borderRadius: RADIUS.capsule,
  },
})
