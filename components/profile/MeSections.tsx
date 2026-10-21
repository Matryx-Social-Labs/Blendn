import { StyleSheet, Text, View } from 'react-native'

import { COLOR, FONT_FAMILY, RADIUS, SPACE } from '../../lib/design/tokens'
import { joinedDate } from '../../lib/meProfile'
import { Button } from '../ds/Button'
import { RollingNumber } from '../ds/RollingNumber'
import { CONTROL_FONT_CAP, font, useBoldText } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { SkeletonBlock } from '../Skeleton'
import { PhotoStack, STACK_HEIGHT, STACK_WIDTH } from './PhotoStack'
import type { Rect } from '../ds/chatShared'

/** Flow 6 `me`: the header's text column sits 6 pt apart, between the 4 and 8 steps. */
// design-exception: the frame's name block gap is 6
const IDENTITY_GAP = 6
/** The skeleton's blocks, at the final geometry (Flow 6 `me` 07). */
const SKELETON = { name: 36, line: 16, button: 44, buttonWidth: 140, stats: 96, nights: 220 } as const

/**
 * The top of Me (Flow 6 `me` 01): your name with your age in Geist Mono, where you are and since when (the date in mono), what you
 * do, the Edit profile button, and your photos as a pile beside them. The name takes two lines before it truncates.
 */
export function MeIdentity({
  name,
  age,
  location,
  memberSince,
  occupation,
  photos,
  onEdit,
  onPhotos,
}: {
  name: string
  age?: number | null
  location?: string | null
  memberSince?: string | null
  occupation?: string | null
  photos: string[]
  onEdit: () => void
  onPhotos: (index: number, from: Rect | null) => void
}) {
  const bold = useBoldText()
  const joined = joinedDate(memberSince)
  const where = location?.trim()
  return (
    <View style={styles.identity}>
      <View style={styles.text}>
        <Text
          accessibilityRole="header"
          accessibilityLabel={age ? `${name}, ${age}` : name}
          numberOfLines={2}
          maxFontSizeMultiplier={CONTROL_FONT_CAP}
          style={[font('display', bold), styles.ink]}
        >
          {name}
          {age ? <Text style={[font('display', bold, FONT_FAMILY.mono[700]), styles.age]}>{`, ${age}`}</Text> : null}
        </Text>
        {where || joined ? (
          <Text numberOfLines={2} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), styles.muted]}>
            {where ?? ''}
            {where && joined ? ' · ' : ''}
            {joined ? (
              <>
                {'Joined '}
                <Text style={font('meta', bold, FONT_FAMILY.mono[500])}>{joined}</Text>
              </>
            ) : null}
          </Text>
        ) : null}
        {occupation ? (
          <Text numberOfLines={2} maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('meta', bold), styles.muted]}>
            {occupation}
          </Text>
        ) : null}
        <Button kind="secondary" size="md" icon="pencil" label="Edit profile" onPress={onEdit} style={styles.edit} />
      </View>
      <PhotoStack photos={photos} onPress={onPhotos} />
    </View>
  )
}

/** One number and what it counts, a way through to the list behind it when there is one. */
function Stat({ value, label, onPress, hint = 'Opens Going' }: { value: number; label: string; onPress?: () => void; hint?: string }) {
  const bold = useBoldText()
  const body = (
    <>
      <RollingNumber value={value} role="title" />
      <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('label', bold), styles.muted]}>
        {label}
      </Text>
    </>
  )
  // One element, read as "3 Attended" rather than "3" and then "Attended".
  return onPress ? (
    <ScalePress onPress={onPress} haptic={false} accessibilityRole="button" accessibilityLabel={`${value} ${label}`} accessibilityHint={hint} style={styles.stat}>
      {body}
    </ScalePress>
  ) : (
    <View accessible accessibilityLabel={`${value} ${label}`} style={styles.stat}>
      {body}
    </View>
  )
}

/**
 * Your numbers (Flow 6 `statsCard`): one `surfaceSunken` card at radius 24, the columns split by hairlines. Friends is left out
 * until it loads rather than showing a wrong 0; Hosted only for someone who hosts.
 */
export function StatsCard({
  attended,
  saved,
  friends,
  hosted,
  onGoing,
  onFriends,
}: {
  attended: number
  saved: number
  friends: number | null
  hosted: number
  onGoing: () => void
  onFriends: () => void
}) {
  const columns = [
    { key: 'attended', node: <Stat value={attended} label="Attended" onPress={onGoing} /> },
    { key: 'saved', node: <Stat value={saved} label="Saved" onPress={onGoing} /> },
    ...(friends !== null ? [{ key: 'friends', node: <Stat value={friends} label="Friends" onPress={onFriends} hint="Opens your friends" /> }] : []),
    ...(hosted > 0 ? [{ key: 'hosted', node: <Stat value={hosted} label="Hosted" /> }] : []),
  ]
  return (
    <View testID="stats-card" style={styles.stats}>
      {columns.map((c, i) => (
        <View key={c.key} style={[styles.statColumn, i > 0 && styles.statRule]}>
          {c.node}
        </View>
      ))}
    </View>
  )
}

/** Me while it loads, at the final geometry (Flow 6 `me` 07): the name and lines, the button, the pile, the stats and one section. */
export function MeSkeleton() {
  return (
    <View testID="me-skeleton" accessibilityLabel="Loading your profile" accessibilityState={{ busy: true }} style={styles.skeleton}>
      <View style={styles.identity}>
        <View style={styles.skeletonText}>
          <SkeletonBlock width="60%" height={SKELETON.name} borderRadius={RADIUS.thumb} />
          <SkeletonBlock width="80%" height={SKELETON.line} borderRadius={RADIUS.capsule} />
          <SkeletonBlock width="50%" height={SKELETON.line} borderRadius={RADIUS.capsule} />
          <SkeletonBlock width={SKELETON.buttonWidth} height={SKELETON.button} borderRadius={RADIUS.capsule} style={styles.edit} />
        </View>
        <SkeletonBlock width={STACK_WIDTH} height={STACK_HEIGHT} borderRadius={RADIUS.rowInCard} />
      </View>
      <SkeletonBlock height={SKELETON.stats} borderRadius={RADIUS.mediaInCard} />
      <SkeletonBlock height={SKELETON.nights} borderRadius={RADIUS.mediaInCard} />
    </View>
  )
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SPACE.lg },
  text: { flex: 1, minWidth: 0, gap: IDENTITY_GAP },
  ink: { color: COLOR.textPrimary },
  muted: { color: COLOR.textSecondary },
  // design-exception: Flow 6 draws the age in Geist Mono 700 at 32, beside the name at 34
  age: { fontSize: 32, lineHeight: 40 },
  edit: { alignSelf: 'flex-start', marginTop: SPACE.sm },
  stats: { flexDirection: 'row', paddingVertical: SPACE.lg, borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surfaceSunken },
  statColumn: { flex: 1 },
  statRule: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: COLOR.hairline },
  stat: { alignItems: 'center', gap: SPACE.xxs },
  skeleton: { gap: SPACE.lg },
  skeletonText: { flex: 1, gap: SPACE.sm },
})
