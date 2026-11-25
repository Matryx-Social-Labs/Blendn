import { useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CONSENT_LINE, KEEP_ANONYMOUS_LABEL, type CrewInvite } from '../../lib/crews'
import { askedYouIn, crewVerb, inviteMeta } from '../../lib/crewsScreens'
import { COLOR, MAX_FONT_SCALE, RADIUS, SPACE, TYPE } from '../../lib/design/tokens'
import { personFace } from '../../lib/personFace'
import { Avatar } from '../ds/Avatar'
import { Button } from '../ds/Button'
import { CrewEmblem } from '../ds/CrewEmblem'
import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast, useLargeText } from '../ds/shared'
import { Title } from '../ds/Title'
import { Toggle } from '../ds/Toggle'
import { useToastDock } from '../toastDock'

const EMBLEM = 120
/** The inviter's face in the "Priya asked you in" pill. */
const INVITER_FACE = 24

/**
 * An invite to a crew (board 03 A), a friend's (`app/crews/invite`) or a link's (`app/c`): who asked leads by face, then the crew,
 * big, its size and tags in one line and its line in quotes; the consent sentence and "keep me anonymous" above Join. Never a
 * member's name or photo.
 */
export function InviteCard({
  invitedBy,
  invitedByPhoto,
  invite,
  consentMore,
  note,
  keepAnonymous,
  onKeepAnonymous,
  joining,
  joined,
  refused,
  onJoin,
  onNotNow,
}: {
  invitedBy: string
  invitedByPhoto?: string | null
  invite: Pick<CrewInvite, 'name' | 'bio' | 'emblemSeed' | 'tags' | 'size'>
  /** What else Join agrees to, after the consent sentence (a link's: you become friends with whoever shared it). */
  consentMore?: string
  /** Under Not now: the days left, and who is told. */
  note: string | null
  keepAnonymous: boolean
  onKeepAnonymous: (next: boolean) => void
  joining: boolean
  joined: boolean
  refused: boolean
  onJoin: () => void
  onNotNow: () => void
}) {
  const bold = useBoldText()
  const largeText = useLargeText()
  const contrast = useIncreaseContrast()
  const insets = useSafeAreaInsets()
  // The Android snackbar stands above the consent dock (the toast adds the bottom inset itself).
  const [dockHeight, setDockHeight] = useState(0)
  useToastDock(Math.max(0, dockHeight - insets.bottom))
  const secondary = contrast ? COLOR.textPrimary : COLOR.textSecondary
  return (
    // One scroll, the dock at its foot: at the largest text the card scrolls whole, so the dock never covers the crew's name.
      <ScrollView testID="invite-scroll" contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, styles.heroPad]}>
          <View accessible accessibilityLabel={askedYouIn(invitedBy)} style={[styles.asked, contrast && IC_HAIRLINE]}>
            <Avatar
              {...personFace({ named: true, name: invitedBy, photo: invitedByPhoto })}
              size={INVITER_FACE}
              testID={invitedByPhoto ? 'invite-inviter-photo' : 'invite-inviter-initial'}
            />
            {/* Two lines before an ellipsis: a long first name ("Venkatalakshmi") is never cut at the large sizes. */}
            <Text numberOfLines={2} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, TYPE.bodyStrong.fontFamily), styles.ink, styles.shrink]}>
              {askedYouIn(invitedBy)}
            </Text>
          </View>
          {/* "Priya asked you in": the crew waves hello, once. */}
          <CrewEmblem seed={invite.emblemSeed} size={EMBLEM} scene="wave" />
          {/*
            Two lines at most at the default sizes: a 32-character name is never cut to one, nor left to run on. At the AX sizes
            the cap lifts, as the crew page's name does (CrewHead): two lines cut "Saint-Jean-sur-Richelieu Runners" to its first word.
          */}
          <Title numberOfLines={largeText ? undefined : 2} accessibilityRole="header" style={[styles.centre, styles.ink, styles.name]}>
            {invite.name}
          </Title>
          <View style={styles.about}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.centre, { color: secondary }]}>{inviteMeta(invite)}</Text>
            {invite.bio ? <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.centre, { color: secondary }]}>{`“${invite.bio}”`}</Text> : null}
          </View>
          {/* Under the crew, as the board draws it: read on the way down to Join, never pinned under it. */}
          <View style={[styles.consent, contrast && IC_HAIRLINE]}>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: secondary }]}>{consentMore ? `${CONSENT_LINE} ${consentMore}` : CONSENT_LINE}</Text>
            <View style={styles.anon}>
              {/* The Toggle carries these words; hidden so a screen reader stops here once, not twice. */}
              <Text accessibilityElementsHidden importantForAccessibility="no" maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('meta', bold, TYPE.bodyStrong.fontFamily), styles.ink, styles.fill]}>{KEEP_ANONYMOUS_LABEL}</Text>
              <Toggle value={keepAnonymous} onValueChange={onKeepAnonymous} accessibilityLabel={KEEP_ANONYMOUS_LABEL} disabled={joining} />
            </View>
          </View>
        </View>
      <View
        testID="invite-dock"
        onLayout={(e) => setDockHeight(e.nativeEvent.layout.height)}
        style={[styles.dock, { paddingBottom: insets.bottom + SPACE.xl }]}
      >
        <Button
          label={joined ? 'Joined' : crewVerb('Join', invite.name)}
          kind={joined ? 'secondary' : 'primary'}
          onPress={onJoin}
          loading={joining}
          disabled={joined}
          refused={refused}
          pressHaptic={false}
          testID="invite-join"
        />
        <Button label="Not now" kind="tertiary" onPress={onNotNow} disabled={joining || joined} testID="invite-not-now" />
        {note ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.centre, styles.tertiary]} testID="invite-note">
            {note}
          </Text>
        ) : null}
      </View>
      </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: 'space-between', paddingTop: SPACE.sm, gap: SPACE.xl },
  heroPad: { paddingHorizontal: SPACE.gutter },
  hero: { alignItems: 'center', gap: SPACE.md },
  name: { marginTop: SPACE.xs },
  asked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    maxWidth: '100%',
    paddingLeft: SPACE.xs,
    paddingRight: SPACE.md,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surface,
  },
  shrink: { flexShrink: 1 },
  about: { alignItems: 'center', gap: SPACE.xs },
  consent: { alignSelf: 'stretch', marginTop: SPACE.sm, borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, padding: SPACE.lg, gap: SPACE.md },
  anon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingTop: SPACE.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLOR.hairline,
  },
  dock: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.md, gap: SPACE.sm },
  fill: { flex: 1 },
  centre: { textAlign: 'center' },
  ink: { color: COLOR.textPrimary },
  tertiary: { color: COLOR.textTertiary },
})
