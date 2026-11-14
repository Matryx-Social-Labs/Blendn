import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { COLOR, ICON, RADIUS, SIZE, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { membersInOrder, type CrewMember } from '../../lib/crews'
import { Avatar } from '../ds/Avatar'
import { PRESSED_WASH, font, minTarget, useBoldText, useIncreaseContrast } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { RowsCard } from './RowsCard'

const FACE = 44
const ROW_HEIGHT = 60
/** Members drawn before "See all N" (board crews/tags/02-size-25: a crew can be 25). */
const MEMBERS_FIRST = 8

/**
 * The Members card (flow10.js `detail`): each person by first name and photo
 * ("You" for you, "Owner" under whoever started it), the owner's ⋯ on
 * everyone else, and Invite friends as the card's last row. A member kept
 * apart from you is not here, and the footnote says so without naming anyone.
 * In order — you, the owner, then by join — the first 8, then "See all N"
 * draws the rest in place (25 at most: the server's cap, so no windowing).
 */
export function CrewMembers({
  members,
  myId,
  isOwner,
  canInvite,
  apart,
  onInvite,
  onOpen,
  onMore,
}: {
  members: readonly CrewMember[]
  myId: string
  isOwner: boolean
  canInvite: boolean
  apart: boolean
  onInvite: () => void
  /** Somebody else's row opens their room card (first name only). */
  onOpen: (member: CrewMember) => void
  onMore: (member: CrewMember) => void
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary
  const [all, setAll] = useState(false)
  const ordered = membersInOrder(members, myId)
  const folded = !all && ordered.length > MEMBERS_FIRST
  return (
    <View style={styles.block}>
      <RowsCard testID="crew-members">
        {(folded ? ordered.slice(0, MEMBERS_FIRST) : ordered).map((m) => {
          const me = m.userId === myId
          const who = me ? 'You' : m.name
          return (
            <View key={m.userId} style={styles.row}>
              <Pressable
                accessible
                accessibilityRole={me ? undefined : 'button'}
                accessibilityLabel={m.role === 'owner' ? `${who}, owner` : who}
                disabled={me}
                onPress={() => onOpen(m)}
                style={({ pressed }) => [styles.who, pressed && { backgroundColor: PRESSED_WASH.ios }]}
              >
                {m.photo ? <Avatar kind="photo" uri={m.photo} size={FACE} /> : <Avatar kind="creature" pseudonym={m.name} size={FACE} />}
                <View style={styles.text}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} numberOfLines={1} style={[font('bodyStrong', bold), styles.ink]}>
                    {who}
                  </Text>
                  {m.role === 'owner' ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: secondary }]}>Owner</Text> : null}
                </View>
              </Pressable>
              {isOwner && !me ? (
                <Pressable
                  onPress={() => onMore(m)}
                  accessibilityRole="button"
                  accessibilityLabel={`More, ${m.name}`}
                  hitSlop={(minTarget() - ICON.control) / 2}
                  style={({ pressed }) => [styles.more, pressed && { backgroundColor: PRESSED_WASH.ios }]}
                >
                  <Icon name="ellipsis" size={ICON.control} color={COLOR.textTertiary} />
                </Pressable>
              ) : null}
            </View>
          )
        })}
        {folded ? (
          <Pressable
            onPress={() => setAll(true)}
            accessibilityRole="button"
            accessibilityLabel={`See all ${ordered.length}`}
            style={({ pressed }) => [styles.row, styles.seeAll, pressed && { backgroundColor: PRESSED_WASH.ios }]}
          >
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.link]}>{`See all ${ordered.length}`}</Text>
          </Pressable>
        ) : null}
        {canInvite ? (
          <Pressable
            onPress={onInvite}
            accessibilityRole="button"
            accessibilityLabel="Invite friends"
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: PRESSED_WASH.ios }]}
          >
            <View style={styles.inviteWell}>
              <Icon name="user-plus" size={ICON.control} />
            </View>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold), styles.ink, styles.fill]}>Invite friends</Text>
            <Icon name="chevron-right" size={ICON.control} color={COLOR.textTertiary} />
          </Pressable>
        ) : null}
      </RowsCard>
      {apart ? (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.footnote]}>
          Someone you’ve blocked, or who blocked you, is in this crew. You don’t see each other here or in the chat. Nobody is told.
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  block: { gap: SPACE.md },
  row: {
    minHeight: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.lg,
  },
  who: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  text: { flex: 1, minWidth: 0 },
  fill: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  seeAll: { justifyContent: 'center' },
  /** White, not the board's rose: rose on surface is 3.77:1 (AA fails), and row text actions are white (SectionHeader, R3). */
  link: { color: COLOR.textPrimary },
  more: { width: SIZE.targetIos, height: SIZE.targetIos, borderRadius: RADIUS.capsule, alignItems: 'center', justifyContent: 'center' },
  inviteWell: {
    width: FACE,
    height: FACE,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footnote: { color: COLOR.textTertiary, paddingHorizontal: SPACE.xs },
})
