import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Button } from '../ds/Button'
import { IconButton } from '../ds/IconButton'
import { font, useBoldText } from '../ds/shared'
import { COLOR, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { friendsCardDone, retireFriendsCard } from '../../lib/friendsCard'
import { useFriendInvite } from '../../lib/useFriendInvite'

/** The onboarding screen's sentence, kept (FLOW-WALK: "reuses friends.tsx copy"): the reason the link matters. */
export const FRIENDS_CARD_BODY = 'Nobody can find you on Blend’n by searching. Send your link, and anyone you send it to can ask to be your friend.'

/**
 * "Bring your friends" (Flow 3 · Pulse, Option C; ledger row 14): one card after the lead card, the share tray for your
 * invite link, × to put it away. Gone for good once shared or dismissed (`lib/friendsCard.ts`). Nothing is drawn until
 * the stored answer is read, so somebody who dismissed it never sees it flash. No people on the Pulse: the card names
 * nobody.
 */
export function FriendsCard({ userId }: { userId: string }) {
  const [state, setState] = useState<'reading' | 'shown' | 'done'>('reading')
  useEffect(() => {
    let live = true
    void friendsCardDone(userId).then((done) => {
      if (live) setState(done ? 'done' : 'shown')
    })
    return () => {
      live = false
    }
  }, [userId])
  if (state !== 'shown') return null
  const retire = () => {
    setState('done')
    void retireFriendsCard(userId)
  }
  return <FriendsCardBody onDone={retire} />
}

/** The card itself: mounted only while shown, so the invite link is read only for someone who will see it. */
function FriendsCardBody({ onDone }: { onDone: () => void }) {
  const bold = useBoldText()
  const { invite, share } = useFriendInvite()
  const shareLink = async () => {
    if (await share()) onDone()
  }
  return (
    <View style={styles.card} testID="pulse-friends-card">
      <View style={styles.head}>
        <Text style={[font('heading', bold), styles.ink, styles.fill]} maxFontSizeMultiplier={MAX_FONT_SCALE.heading} accessibilityRole="header">
          Bring your friends
        </Text>
        <IconButton icon="x" accessibilityLabel="Dismiss, bring your friends" onPress={onDone} testID="pulse-friends-dismiss" />
      </View>
      <Text style={[font('meta', bold), styles.secondary]} maxFontSizeMultiplier={MAX_FONT_SCALE.meta}>
        {FRIENDS_CARD_BODY}
      </Text>
      <View style={styles.actions}>
        <Button kind="lit" size="sm" icon="share" label="Share my link" loading={!invite} onPress={() => void shareLink()} testID="pulse-friends-share" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { marginHorizontal: SPACE.gutter, marginTop: SPACE.xl, padding: SPACE.lg, gap: SPACE.sm, borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  actions: { flexDirection: 'row', marginTop: SPACE.xs },
  fill: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})
