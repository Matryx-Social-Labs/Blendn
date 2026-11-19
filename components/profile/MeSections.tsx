import { useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { joinedDate } from '../../lib/meProfile'
import { personFace } from '../../lib/personFace'
import { Avatar } from '../ds/Avatar'
import { Button } from '../ds/Button'
import { Title } from '../ds/Title'
import { font, SELECTION, useBoldText, useLargeText } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { SkeletonBlock } from '../Skeleton'
import { Icon } from '../ui/Icon'
import type { Rect } from '../ds/chatShared'

/** Me + settings A 01: the round main photo, 88 pt (64 at the accessibility sizes, above the name), and its viewer badge. */
// design-exception: the board's 88 / 64 pt photo and 28 pt badge, between the Avatar steps
export const ME_PHOTO = 88
export const ME_PHOTO_LARGE = 64
const PHOTO_BADGE = 28
const PHOTO_BADGE_GLYPH = 15
/** The skeleton's blocks, at the final geometry. */
const SKELETON = { name: 30, line: 16, button: 44, buttonWidth: 140, nights: 220 } as const

/**
 * The top of Me (Me + settings A 01, owner 2026-11-18): your main photo in a violet ring beside your name, with your age in
 * Geist Mono, where you are and since when on one line, then Edit profile. The name is never cut and never broken inside a
 * word: it wraps to the lines it needs, and a word too wide for the line shrinks (`Title`). At the accessibility sizes the
 * photo sits above the name and the button spans the column (02 A, largest text).
 *
 * "See as others do" (the board's second button) is not drawn: what a room sees depends on the server's reveal rules, and a
 * preview guessed on the phone could show something others never see. It waits for the self-preview read (ROADMAP § Backend
 * later). Your job title is under About now, beside education.
 */
export function MeIdentity({
  name,
  age,
  location,
  memberSince,
  photo,
  onEdit,
  onPhoto,
}: {
  name: string
  age?: number | null
  location?: string | null
  memberSince?: string | null
  /** Your main photo; none draws your initial on your disc, and a tap goes to add one. */
  photo?: string | null
  onEdit: () => void
  onPhoto: (from: Rect | null) => void
}) {
  const bold = useBoldText()
  const large = useLargeText()
  const joined = joinedDate(memberSince)
  const where = location?.trim()
  const box = useRef<View>(null)
  const size = large ? ME_PHOTO_LARGE : ME_PHOTO
  const press = () => {
    if (!box.current) return onPhoto(null)
    box.current.measureInWindow((x, y, width, height) => onPhoto({ x, y, width, height }))
  }
  return (
    <View testID="me-identity" style={styles.identityColumn}>
      <View style={large ? styles.stacked : styles.identity}>
        <ScalePress
          testID="me-photo"
          onPress={press}
          haptic={false}
          accessibilityRole="button"
          accessibilityLabel={photo ? 'Your photos' : 'Add a photo'}
          accessibilityHint={photo ? 'Opens your photos' : undefined}
        >
          <View ref={box} collapsable={false}>
            <Avatar size={size} ring={COLOR.ink} halo={SELECTION.violet.glyph} {...personFace({ named: true, name, photo })} />
            {photo ? (
              <View style={styles.photoBadge}>
                <Icon name="images" size={PHOTO_BADGE_GLYPH} color={COLOR.textPrimary} />
              </View>
            ) : null}
          </View>
        </ScalePress>
        <View style={styles.text}>
          <Title testID="me-name" accessibilityRole="header" accessibilityLabel={age ? `${name}, ${age}` : name} style={styles.ink}>
            {name}
            {age ? (
              <>
                {', '}
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.title} style={styles.age}>{age}</Text>
              </>
            ) : null}
          </Title>
          {where || joined ? (
            <Text testID="me-where" numberOfLines={large ? undefined : 1} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.muted]}>
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
        </View>
      </View>
      <Button kind="lit" size="md" icon="pencil" label="Edit profile" onPress={onEdit} style={large ? styles.editWide : styles.edit} testID="me-edit" />
    </View>
  )
}

/** Me while it loads, at the final geometry (Flow 6 `me` 07): the name and lines, the button, the pile, the stats and one section. */
export function MeSkeleton() {
  return (
    <View accessible testID="me-skeleton" accessibilityLabel="Loading your profile" accessibilityState={{ busy: true }} style={styles.skeleton}>
      <View style={styles.identity}>
        <SkeletonBlock width={ME_PHOTO} height={ME_PHOTO} borderRadius={ME_PHOTO / 2} />
        <View style={styles.skeletonText}>
          <SkeletonBlock width="60%" height={SKELETON.name} borderRadius={RADIUS.thumb} />
          <SkeletonBlock width="80%" height={SKELETON.line} borderRadius={RADIUS.capsule} />
          <SkeletonBlock width="50%" height={SKELETON.line} borderRadius={RADIUS.capsule} />
        </View>
      </View>
      <SkeletonBlock width={SKELETON.buttonWidth} height={SKELETON.button} borderRadius={RADIUS.capsule} />
      <SkeletonBlock height={SKELETON.nights} borderRadius={RADIUS.mediaInCard} />
    </View>
  )
}

const styles = StyleSheet.create({
  identityColumn: { gap: SPACE.md },
  identity: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  stacked: { gap: SPACE.md },
  text: { flex: 1, minWidth: 0, gap: SPACE.xxs },
  ink: { color: COLOR.textPrimary },
  age: { fontFamily: FONT_FAMILY.mono[700] },
  muted: { color: COLOR.textSecondary },
  edit: { alignSelf: 'flex-start' },
  editWide: { alignSelf: 'stretch' },
  photoBadge: {
    position: 'absolute',
    right: -SPACE.xxs,
    bottom: -SPACE.xxs,
    width: PHOTO_BADGE,
    height: PHOTO_BADGE,
    borderRadius: PHOTO_BADGE / 2,
    backgroundColor: COLOR.surfaceRaised,
    borderWidth: SPACE.xxs,
    borderColor: COLOR.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeleton: { gap: SPACE.lg },
  skeletonText: { flex: 1, gap: SPACE.sm },
})
