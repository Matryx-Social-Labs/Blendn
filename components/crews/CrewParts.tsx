import { Ionicons, MaterialIcons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import React, { memo } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text as RNText, View } from 'react-native'

import {
  CONSENT_AGREE,
  CONSENT_LINE,
  KEEP_ANONYMOUS_HELPER,
  KEEP_ANONYMOUS_LABEL,
  hereNowLine,
  sideView,
  sizeLine,
  type BlendPerson,
  type BlendSide,
  type ConsentState,
  type CrewCard,
} from '../../lib/crews'
import type { FriendPerson } from '../../lib/friends'
import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { CONTROL, EMBER, EMBER_RADIUS, ICON, OPACITY, SPACE } from '../../lib/theme'
import { Face } from '../blendn/Face'
import { PersonRow } from '../friends/PersonRow'
import { EmberButton, EmberToggle } from '../onboarding/EmberControls'
import { Text } from '../ui/Text'

/**
 * A crew's face that is not a face: generated from the crew's emblem seed,
 * the way a person's mark comes from their pseudonym. Square-cornered, so a
 * crew never reads as one person.
 */
export const CrewEmblem = memo(function CrewEmblem({ seed, size }: { seed: string; size: number }) {
  const mark = pseudonymAvatar(seed)
  return (
    <LinearGradient
      colors={mark.colors}
      style={[styles.emblem, { width: size, height: size }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {/* Emoji sized to the tile: it is a picture, not text. */}
      <RNText allowFontScaling={false} style={{ fontSize: Math.round(size * 0.46), lineHeight: Math.round(size * 0.6) }}>
        {mark.character}
      </RNText>
    </LinearGradient>
  )
})

/**
 * The join-time consent, beside every way into a crew (create and accept).
 *
 * The line is always on screen — never behind a "more" (CR-CU01) — and the
 * agreement is a tap the person makes; it starts unticked. The anonymity
 * switch sits under it so the way out of the consent is read with it.
 */
export function ConsentFields({ value, onChange }: { value: ConsentState; onChange: (next: ConsentState) => void }) {
  return (
    <View style={styles.consent}>
      <Text variant="bodyStrong">{CONSENT_LINE}</Text>
      <Pressable
        onPress={() => onChange({ ...value, consented: !value.consented })}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: value.consented }}
        accessibilityLabel={`${CONSENT_AGREE}. ${CONSENT_LINE}`}
        style={({ pressed }) => [styles.agree, pressed && styles.pressed]}
      >
        <Ionicons
          name={value.consented ? 'checkbox' : 'square-outline'}
          size={ICON.lg}
          color={value.consented ? EMBER.textPrimary : EMBER.textSecondary}
        />
        <Text variant="body">{CONSENT_AGREE}</Text>
      </Pressable>
      <EmberToggle
        label={KEEP_ANONYMOUS_LABEL}
        helper={KEEP_ANONYMOUS_HELPER}
        value={value.keepMeAnonymous}
        onValueChange={(keepMeAnonymous) => onChange({ ...value, keepMeAnonymous })}
      />
    </View>
  )
}

/**
 * A friend you can tick to invite. Real names: these are your friends.
 * Announced as a checkbox with its state (M13), the row being the target.
 */
export function FriendPickRow({
  person,
  picked,
  onToggle,
}: {
  person: FriendPerson
  picked: boolean
  onToggle: () => void
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: picked }}
      accessibilityLabel={`Ask ${person.name}`}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <PersonRow
          person={person}
          detail={picked ? 'Will be asked' : undefined}
          trailing={
            <Ionicons
              name={picked ? 'checkmark-circle' : 'ellipse-outline'}
              size={ICON.lg}
              color={picked ? EMBER.textPrimary : EMBER.textTertiary}
            />
          }
        />
      </View>
    </Pressable>
  )
}

/**
 * A crew here now, as a card in the Grid's Crews view.
 *
 * **Counts, never people.** The server sends no name, photo or pseudonym of
 * anybody on a crew card (a list of pseudonyms beside a crew that later
 * reveals would single out the ones who stayed anonymous), so the card is the
 * emblem, the name, "Crew of N", how many are here, its tags and its bio.
 * The people appear inside a Blend.
 */
export function CrewCardView({
  card,
  liking,
  onLike,
  onMore,
}: {
  card: CrewCard
  liking: boolean
  onLike: () => void
  onMore: () => void
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <CrewEmblem seed={card.emblemSeed} size={CONTROL.lg} />
        <View style={styles.cardTitle}>
          <Text variant="heading" numberOfLines={1}>
            {card.name}
          </Text>
          <Text variant="meta">
            {sizeLine(card.size)} · {hereNowLine(card)}
          </Text>
        </View>
        <Pressable
          onPress={onMore}
          hitSlop={SPACE.md}
          accessibilityRole="button"
          accessibilityLabel={`Report ${card.name}`}
          style={styles.more}
        >
          <MaterialIcons name="more-horiz" size={ICON.md} color={EMBER.textTertiary} />
        </Pressable>
      </View>
      {card.bio ? <Text variant="body">{card.bio}</Text> : null}
      {card.tags.length ? (
        <View style={styles.chips}>
          {card.tags.map((t) => (
            <View key={t.slug} style={styles.chip}>
              <Text variant="meta" color={EMBER.textPrimary}>
                {t.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <Pressable
        onPress={onLike}
        disabled={card.youLiked || liking}
        accessibilityRole="button"
        accessibilityLabel={card.youLiked ? `You liked ${card.name}` : `Like ${card.name}`}
        accessibilityHint="They are only told if they like you back"
        accessibilityState={{ disabled: card.youLiked || liking, busy: liking }}
        style={({ pressed }) => [styles.like, card.youLiked ? styles.liked : styles.likeOn, pressed && styles.pressed]}
      >
        {liking ? (
          <ActivityIndicator color={EMBER.onGradient} />
        ) : (
          <>
            <Ionicons
              name={card.youLiked ? 'heart' : 'heart-outline'}
              size={ICON.md}
              color={card.youLiked ? EMBER.textPrimary : EMBER.onGradient}
            />
            <Text variant="button" color={card.youLiked ? EMBER.textPrimary : EMBER.onGradient}>
              {card.youLiked ? 'Liked' : 'Like'}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  )
}

/** A face in a Blend side: big enough to recognise, small enough for twelve. */
const SIDE_FACE = CONTROL.md

/**
 * One side of a Blend: an anonymous menagerie until its crew reveals, then a
 * collage of the revealed members' faces and first names — and anybody who
 * kept themselves anonymous stays a pseudonym tile beside it (`sideView`).
 *
 * `onPerson` opens the safety sheet for somebody on the other side; it is
 * never offered on yourself.
 */
export function BlendSideCard({
  side,
  myId,
  onPerson,
}: {
  side: BlendSide
  myId: string | null | undefined
  onPerson?: (person: BlendPerson) => void
}) {
  const view = sideView(side)
  const person = (p: BlendPerson, label: string, photo: string | null) => {
    const tappable = !!onPerson && p.userId !== myId
    return (
      <Pressable
        key={p.userId}
        disabled={!tappable}
        onPress={() => onPerson?.(p)}
        accessibilityRole={tappable ? 'button' : 'text'}
        accessibilityLabel={p.userId === myId ? 'You' : tappable ? `${label}. Block` : label}
        style={styles.person}
      >
        <Face name={p.pseudonym} photo={photo} size={SIDE_FACE} />
        <Text variant="caption" numberOfLines={1} style={styles.personName}>
          {p.userId === myId ? 'You' : label}
        </Text>
      </Pressable>
    )
  }
  return (
    <View style={styles.side}>
      <View style={styles.sideHead}>
        {side.kind === 'crew' && side.emblemSeed ? <CrewEmblem seed={side.emblemSeed} size={CONTROL.sm} /> : null}
        <Text variant="bodyStrong" numberOfLines={1} style={styles.flex} accessibilityRole="header">
          {view.title}
        </Text>
      </View>
      {view.countLine ? <Text variant="meta">{view.countLine}</Text> : null}
      {/*
        Your own side is a count and you (the server sends nothing more): a tile
        for each crewmate would show the crew who kept themselves anonymous.
      */}
      {view.mode === 'mine' ? (
        <View style={styles.people}>{side.people.filter((p) => p.userId === myId).map((p) => person(p, 'You', p.photo))}</View>
      ) : (
      <View style={styles.people}>
        {/* Revealed: photo and first name. The server's `name` is the reveal — a photo alone is not. */}
        {view.faces.map((p) => person(p, p.name ?? p.pseudonym, p.photo))}
        {view.more > 0 ? (
          <View style={styles.person} accessible accessibilityLabel={`${view.more} more revealed`}>
            <View style={styles.moreFaces}>
              <Text variant="bodyStrong">+{view.more}</Text>
            </View>
          </View>
        ) : null}
        {/* Anonymous, or kept private: tonight's pseudonym, and its creature. Never their photo. */}
        {view.tiles.map((p) => person(p, p.pseudonym, null))}
      </View>
      )}
    </View>
  )
}

/**
 * A crew's or a Blend's room that is over for you: "This Blend has closed".
 * It replaces the feed and the composer — the server refuses both now — and
 * says nothing about why: a Blend closing, a block across its sides and a
 * member taken out all read the same from inside.
 */
export function RoomClosedNotice({ line, onBack }: { line: string; onBack: () => void }) {
  return (
    <View style={styles.closed}>
      <Ionicons name="moon-outline" size={ICON.lg} color={EMBER.textTertiary} />
      <Text variant="heading" accessibilityRole="header" style={styles.closedText}>
        {line}
      </Text>
      <EmberButton label="Back" variant="secondary" onPress={onBack} />
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  closed: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.lg, paddingHorizontal: SPACE.xl },
  closedText: { textAlign: 'center' },
  pressed: { opacity: OPACITY.pressed },
  emblem: { borderRadius: EMBER_RADIUS.sm, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  consent: {
    gap: SPACE.md,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
  },
  agree: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: CONTROL.md },
  card: { gap: SPACE.md, padding: SPACE.lg, borderRadius: EMBER_RADIUS.md, backgroundColor: EMBER.surfaceSunken },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  cardTitle: { flex: 1, gap: SPACE.xxs },
  more: { width: CONTROL.sm, height: CONTROL.sm, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  chip: {
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.xs,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
  },
  like: {
    height: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.sm,
  },
  likeOn: { backgroundColor: EMBER.accent },
  liked: { backgroundColor: EMBER.surface },
  side: { gap: SPACE.sm, padding: SPACE.lg, borderRadius: EMBER_RADIUS.md, backgroundColor: EMBER.surfaceSunken },
  sideHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
  person: { width: CONTROL.lg + SPACE.lg, alignItems: 'center', gap: SPACE.xs },
  personName: { textAlign: 'center' },
  moreFaces: {
    width: SIDE_FACE,
    height: SIDE_FACE,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
