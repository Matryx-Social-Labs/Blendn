import { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { COLOR, FONT_FAMILY, ICON, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import type { FriendPerson } from '../../lib/friends'
import { Avatar } from '../ds/Avatar'
import { CONTROL_FONT_CAP, font, useBoldText } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { OptimizedImage } from '../OptimizedImage'
import { SkeletonCircle, SkeletonLine } from '../Skeleton'
import { Icon } from '../ui/Icon'

/** The avatar's box and its decode hint, one number so they cannot drift (Flow 6 `personRow`: 48). */
const AVATAR = 48
/** The row's height: the frame's 64. */
const ROW = SIZE.primary + SPACE.sm

/**
 * One person on a friend surface (Flow 6 `personRow`): a 48 pt photo, the name in 500 17/24, a line under it, and whatever the screen
 * needs on the right (a chevron, Withdraw). A date in the line is `detailMono`, drawn in Geist Mono right after `detail`.
 *
 * Real name and photo, because every place this is drawn is one both people agreed to — the friends list, requests, a link someone
 * handed out. Never used in a room, where the same person is a pseudonym.
 */
export function PersonRow({
  person,
  detail,
  detailMono,
  detailTail,
  onPress,
  trailing,
  chevron = false,
}: {
  person: FriendPerson
  detail?: string
  /** Drawn in Geist Mono right after `detail` ("Friends since " + "Mar 2026"). */
  detailMono?: string
  /** After `detailMono`, in the line's own face ("Blocked " + "Sep 12" + " · Harassment"). */
  detailTail?: string
  onPress?: () => void
  trailing?: ReactNode
  /** The row goes somewhere: a chevron at its right. */
  chevron?: boolean
}) {
  const bold = useBoldText()
  const line = [detail, detailMono, detailTail].filter(Boolean).join('')
  const body = (
    <>
      <PersonAvatar person={person} />
      <View style={styles.text}>
        <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('bodyStrong', bold, FONT_FAMILY.brand[500]), styles.ink]}>
          {person.name}
        </Text>
        {line ? (
          <Text numberOfLines={1} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), styles.muted]}>
            {detail}
            {detailMono ? <Text style={font('meta', bold, FONT_FAMILY.mono[500])}>{detailMono}</Text> : null}
            {detailTail}
          </Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      {chevron ? <Icon name="chevron-right" size={ICON.control} color={COLOR.textTertiary} /> : null}
    </>
  )

  return onPress ? (
    <ScalePress
      onPress={onPress}
      haptic={false}
      pressedScale={0.98}
      accessibilityRole="button"
      accessibilityLabel={line ? `${person.name}, ${line}` : person.name}
      style={styles.row}
    >
      {body}
    </ScalePress>
  ) : (
    <View style={styles.row}>{body}</View>
  )
}

/**
 * Photo, or the name's creature (the frame's `avatar(r, p, 48)`): a disc of its own on any surface, where the initial on `surface`
 * vanished into a request card of the same colour. Decorative: the name beside it says who this is.
 */
export function PersonAvatar({ person }: { person: FriendPerson }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {person.photo ? (
        <OptimizedImage source={person.photo} style={styles.avatar} width={AVATAR} height={AVATAR} contentFit="cover" />
      ) : (
        <Avatar kind="creature" pseudonym={person.name} size={AVATAR} testID="person-creature" />
      )}
    </View>
  )
}

/** Rows at `PersonRow`'s geometry while a list loads (Flow 6 friends 02), so it does not jump when it lands. Still: nothing loops. */
export function PersonRowSkeleton() {
  return (
    <View testID="person-skeleton" style={styles.skeleton} accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      {[50, 60, 70, 80].map((width) => (
        <View key={width} style={styles.row}>
          <SkeletonCircle width={AVATAR} />
          <View style={styles.skeletonText}>
            <SkeletonLine width={`${width}%`} />
            <SkeletonLine width="40%" />
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  skeleton: { paddingHorizontal: SPACE.gutter },
  skeletonText: { flex: 1, gap: SPACE.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: ROW },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: RADIUS.capsule },
  text: { flex: 1, minWidth: 0 },
  // Centred on the row: a small button inside hugs its label, and without this it would sit at the row's top.
  trailing: { alignSelf: 'center' },
  ink: { color: COLOR.textPrimary },
  muted: { color: COLOR.textSecondary },
})
