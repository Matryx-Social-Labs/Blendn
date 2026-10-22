import { Image } from 'expo-image'
import { useEffect, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated'

import { Icon } from '../ui/Icon'
import { COLOR, EASING, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE, STAGGER } from '../../lib/design/tokens'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import { tint } from '../../lib/theme'
import { Avatar } from './Avatar'
import { Button } from './Button'
import { Creature, creatureFor } from './Creature'
import { CrewEmblem } from './CrewEmblem'
import { monoCaption } from './MonoFamily'
import { Sheet } from './Sheet'
import { CONTROL_FONT_CAP, font, useBoldText, useIncreaseContrast } from './shared'

/**
 * The only confirmed action in crews (guidelines/components/RevealSheet.html,
 * Flow 10 · 10.9): "Reveal Nebula to this Blend?", the primary naming the
 * outcome (never destructive styling), and exactly who will see what: a first
 * name and one photo, to the people in this Blend and nobody else. A solo
 * member gets the "yourself" form.
 *
 * Nothing plays on the sheet (the primary's press haptic is skipped: the
 * reveal's `H.success` follows on the server's answer, with the caller's
 * "Revealed" toast). Read title, body, then "Reveal Nebula" and "Not now".
 */
export function RevealSheet({
  visible,
  onClose,
  crew,
  audience,
  onReveal,
  revealing = false,
}: {
  visible: boolean
  onClose: () => void
  /** The crew's name; null for a solo member revealing themselves. */
  crew: string | null
  /**
   * How many people are in this Blend. Left out of the sentence when the count is not the room's
   * (the server drops anyone with show-online off), because a reveal cannot be undone.
   */
  audience?: number
  onReveal: () => void
  revealing?: boolean
}) {
  const bold = useBoldText()
  const reach = `to the ${audience === undefined ? '' : `${audience} `}people in this Blend — and nobody else. Not the Room, not your DMs, not another Blend.`
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      icon="eye"
      title={crew ? `Reveal ${crew} to this Blend?` : 'Reveal yourself to this Blend?'}
      body={
        crew
          ? `Everyone from ${crew} in this Blend who hasn’t chosen to stay anonymous will be shown by first name and one photo ${reach}`
          : `You’ll be shown by first name and one photo ${reach}`
      }
      actions={[
        { label: crew ? `Reveal ${crew}` : 'Reveal me', kind: 'primary', onPress: onReveal, loading: revealing, pressHaptic: false },
        { label: 'Not now', kind: 'tertiary', onPress: onClose },
      ]}
    >
      <View style={styles.lock}>
        <Icon name="lock" size={ICON.inline} />
        <Text style={[font('meta', bold), styles.ink]}>You can’t undo a reveal.</Text>
      </View>
    </Sheet>
  )
}

/** A side's tiles: 36, a 10 pt corner once a photo; the side's face at 56. */
const TILE = SIZE.control - SPACE.md
const TILE_CORNER = RADIUS.thumb + SPACE.xxs
const FACE = 56
const PILL = SIZE.tag
const PILL_EDGE = 0.14
/** flow10b.js `blendRoom` side: radius 20, padding 10 12, tiles 6 apart. */
// design-exception: the Blend side row's radius 20 sits between rowInCard (16) and sheet (24)
const SIDE_RADIUS = 20
// design-exception: the side row pads 10 vertically, off the SPACE scale
const SIDE_PAD = 10
// design-exception: the side row's tiles sit 6 apart, off the SPACE scale
const TILE_GAP = 6

export type RevealPerson = { pseudonym: string; /** Set once they've revealed. */ photo?: string | null }
export type RevealSideOf = { kind: 'crew'; name: string; emblemSeed: string } | { kind: 'person'; name: string; pseudonym: string }

/**
 * One side of a Blend, the collage (Flow 10 · 10.9): the emblem (or the solo
 * member's creature), the name, and a tile per person. Before a reveal, their
 * creatures ("4 on tonight's names"); after the server answers, the revealed
 * cross-fade to their photos and the rest fold into one neutral "+N" tile
 * ("3 revealed · 1 keeps it private"). Revealed first, then private: the order
 * never says who chose what (give `people` in alphabetical order).
 *
 * Your side carries "Reveal my crew" (or "Reveal me"), which opens the sheet;
 * once revealed it reads "Revealed". Each disc cross-fades to its photo in
 * place over `base`, 40 ms apart, no flip, no confetti (the Flow 10
 * prototype); under Reduce Motion the photos swap in. No haptic here: the
 * one who revealed gets `H.success` with the caller's toast (Delta R3-0, C7).
 */
export function RevealSide({
  side,
  people,
  mine = false,
  status: statusText,
  count,
  onReveal,
  testID,
}: {
  side: RevealSideOf
  people: RevealPerson[]
  mine?: boolean
  /**
   * How many people the status speaks of, when more than `people` holds (your side shows you alone: "4 on tonight’s
   * names"). Before anyone has revealed, the rest are drawn as one "+n" tile, so the row is never one tile for four people.
   */
  count?: number
  /**
   * Your own side, when the server has not sent your crew's counts: it never
   * says who kept private, so the line is what is known ("4 on tonight’s names",
   * "Revealed"), not a count worked out from `people`.
   */
  status?: string
  onReveal?: () => void
  testID?: string
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const revealed = people.filter((p) => p.photo)
  const kept = people.length - revealed.length
  const status =
    statusText ??
    (revealed.length
      ? `${revealed.length} revealed · ${kept} keep${kept === 1 ? 's' : ''} it private`
      : `${people.length} on tonight’s names`)
  const tiles = revealed.length ? revealed : people
  return (
    <View testID={testID} style={styles.side}>
      {side.kind === 'crew' ? <CrewEmblem seed={side.emblemSeed} size={FACE} /> : <Avatar kind="creature" pseudonym={side.pseudonym} size={FACE} />}
      <View style={styles.fill}>
        {/* Two Texts, one line each: a long name truncates on its own line and never pushes the status out (audit D3). */}
        <View accessible accessibilityLabel={`${side.name}, ${status}`} style={styles.words}>
          <Text numberOfLines={1} style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.ink]}>
            {side.name}
          </Text>
          <Text numberOfLines={1} style={[font('meta', bold), { color: contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>
            {status}
          </Text>
        </View>
        <View style={styles.tilesRow}>
          <View style={styles.tiles}>
            {tiles.map((p, i) => (
              <Tile key={p.pseudonym} person={p} order={i} testID={testID && `${testID}-tile-${i}`} />
            ))}
            {revealed.length && kept ? (
              <View style={[styles.tile, styles.kept]}>
                <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[monoCaption(bold), { color: COLOR.textSecondary }]}>{`+${kept}`}</Text>
              </View>
            ) : null}
            {!revealed.length && count !== undefined && count > tiles.length ? (
              <View testID={testID && `${testID}-more`} style={[styles.tile, styles.kept]}>
                <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[monoCaption(bold), { color: COLOR.textSecondary }]}>{`+${count - tiles.length}`}</Text>
              </View>
            ) : null}
          </View>
          {mine && revealed.length ? (
            <View style={[styles.pill, styles.revealed, styles.action]}>
              <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold, FONT_FAMILY.brand[700]), { color: COLOR.textSecondary }]}>
                Revealed
              </Text>
            </View>
          ) : mine && onReveal ? (
            <View style={styles.action}>
              <Button kind="lit" size="sm" label={side.kind === 'crew' ? 'Reveal my crew' : 'Reveal me'} onPress={onReveal} />
            </View>
          ) : null}
        </View>
      </View>
    </View>
  )
}

/** A person's tile: the creature, and their photo fading in over it once they reveal. */
function Tile({ person, order, testID }: { person: RevealPerson; order: number; testID?: string }) {
  const reduceMotion = useReducedMotion()
  const shown = useSharedValue(person.photo ? 1 : 0)
  // Only a change of photo animates: a tile that moves (its `order`) keeps what it shows.
  const photo = useRef(person.photo)
  useEffect(() => {
    if (photo.current === person.photo) return
    photo.current = person.photo
    // A photo that has not decoded yet waits at 0 for `onLoad` (below); only taking one away is immediate.
    if (!person.photo) shown.set(0)
  }, [person.photo, shown])
  // The tween starts when the image has loaded, so a cold cache never fades to an empty tile and then pops the photo in.
  const loaded = () => {
    if (shown.get() === 1) return
    if (reduceMotion) shown.set(1)
    else shown.set(withDelay(order * STAGGER.loose, withTiming(1, { duration: motionTokens(reduceMotion).duration.base, easing: Easing.bezier(...EASING.standard) })))
  }
  const photoStyle = useAnimatedStyle(() => ({ opacity: shown.get() }))
  return (
    <View testID={testID} style={styles.tile} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Creature {...creatureFor(person.pseudonym)} size={TILE} />
      {person.photo ? (
        <Animated.View style={[StyleSheet.absoluteFill, styles.photo, photoStyle]}>
          <Image source={{ uri: person.photo }} onLoad={loaded} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
        </Animated.View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  lock: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  ink: { color: COLOR.textPrimary },
  side: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SIDE_PAD,
    paddingHorizontal: SPACE.md,
    borderRadius: SIDE_RADIUS,
    backgroundColor: COLOR.surface,
  },
  fill: { flex: 1, gap: TILE_GAP },
  words: { gap: SPACE.xxs },
  // The tiles wrap among themselves; the Reveal button / Revealed pill rides the same row at the far edge.
  tilesRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  action: { marginLeft: 'auto' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP, flexShrink: 1 },
  tile: { width: TILE, height: TILE },
  photo: { borderRadius: TILE_CORNER, overflow: 'hidden' },
  kept: { borderRadius: TILE_CORNER, backgroundColor: COLOR.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  pill: { height: PILL, paddingHorizontal: SPACE.md, borderRadius: RADIUS.capsule, justifyContent: 'center' },
  revealed: { borderWidth: 1, borderColor: tint(COLOR.textPrimary, PILL_EDGE) },
})
