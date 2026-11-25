import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Avatar } from '../ds/Avatar'
import { CrewEmblem } from '../ds/CrewEmblem'
import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { apiClient } from '../../lib/apiClient'
import { crewsApi } from '../../lib/crewsApi'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { isGone } from '../../lib/loadFailure'
import { pendingCrewToken, pendingInviteToken } from '../../lib/pendingRoute'
import { personFace } from '../../lib/personFace'

/** The avatar's box: the pill is 48 tall, the face 32 with 8 around it (Flow 1 `pendingInvite`). */
const AVATAR = 32
const PILL_HEIGHT = 48
/** What the pill says of a link that no longer works. */
export const DEAD_INVITE_LINE = 'That invite link has expired.'

/** The line beside the face. The landing says whose; the sign-in form adds what to do. */
export function pendingInviteLine(name: string, signIn: boolean): string {
  return signIn ? `${name} invited you. Sign in to accept.` : `${name} invited you`
}

/** The same for a crew's link (S7, board waves-b2 06): who, and which crew. */
export function pendingCrewLine(name: string, crew: string, signIn: boolean): string {
  return signIn ? `${name} invited you to ${crew}. Sign in to join.` : `${name} invited you to ${crew}`
}

type Preview = { kind: 'from'; name: string; photoUrl: string | null } | { kind: 'crew'; name: string; crew: string; emblemSeed: string } | { kind: 'dead' }

/**
 * Whose invite is waiting, on the landing and the sign-in form (Flow 1 landing 02 · 10, sign-in 13).
 *
 * Signed out, an invite link (`/f/<token>`) is held until sign-in and the guard shows the landing instead
 * (`app/_layout.tsx`). Without this the link looked like it had simply opened the app. The public preview gives a first name
 * and a photo, nothing more, since whoever holds a forwarded link has agreed to nothing yet.
 *
 * A link that does not work says so now, in the same pill, rather than after the sign-up it seemed to promise. Any other
 * failure (offline, rate limited) draws nothing: the link still opens after sign-in, and a line about a failure would be
 * about the wrong thing.
 */
export function PendingInvite({ signIn = false }: { signIn?: boolean }) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const [token] = useState(() => pendingInviteToken())
  const [crewToken] = useState(() => pendingCrewToken())
  const [preview, setPreview] = useState<Preview | null>(null)

  useEffect(() => {
    if (!token) return
    let live = true
    apiClient
      .getFriendInvitePreview(token)
      .then((result) => {
        if (!live) return
        if (result.success && result.data?.name) {
          setPreview({ kind: 'from', name: result.data.name, photoUrl: result.data.photoUrl ?? null })
        } else if (isGone(result)) {
          setPreview({ kind: 'dead' })
        }
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [token])

  useEffect(() => {
    if (!crewToken) return
    let live = true
    crewsApi
      .linkPreview(crewToken)
      .then((result) => {
        if (!live) return
        if (result.success && result.data) setPreview({ kind: 'crew', name: result.data.invitedBy.name, crew: result.data.name, emblemSeed: result.data.emblemSeed })
        else if (isGone(result)) setPreview({ kind: 'dead' })
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [crewToken])

  if (!preview) return null

  const pill = [styles.pill, contrast ? IC_HAIRLINE : styles.edge]

  if (preview.kind === 'dead') {
    return (
      <View testID="pending-invite-dead" accessible accessibilityLabel={DEAD_INVITE_LINE} style={pill}>
        <Icon name="link-2-off" size={ICON.control} color={COLOR.textSecondary} />
        <Text style={[font('meta', bold), styles.line]} maxFontSizeMultiplier={1.4}>
          {DEAD_INVITE_LINE}
        </Text>
      </View>
    )
  }

  if (preview.kind === 'crew') {
    return (
      <View testID="pending-crew-invite" accessible accessibilityLabel={pendingCrewLine(preview.name, preview.crew, signIn)} style={pill}>
        <CrewEmblem seed={preview.emblemSeed} size={AVATAR} />
        <Text style={[font('meta', bold), styles.line, styles.fill]} numberOfLines={3} maxFontSizeMultiplier={1.4}>
          <Text style={font('meta', bold, FONT_FAMILY.brand[700])}>{preview.name}</Text>
          {' invited you to '}
          <Text style={font('meta', bold, FONT_FAMILY.brand[700])}>{preview.crew}</Text>
          {signIn ? '. Sign in to join.' : ''}
        </Text>
      </View>
    )
  }

  return (
    <View testID="pending-invite" accessible accessibilityLabel={pendingInviteLine(preview.name, signIn)} style={pill}>
      <Avatar {...personFace({ named: true, name: preview.name, photo: preview.photoUrl })} size={AVATAR} />
      <Text style={[font('meta', bold), styles.line, styles.fill]} numberOfLines={2} maxFontSizeMultiplier={1.4}>
        <Text style={font('meta', bold, FONT_FAMILY.brand[700])}>{preview.name}</Text>
        {signIn ? ' invited you. Sign in to accept.' : ' invited you'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: SPACE.md,
    minHeight: PILL_HEIGHT,
    paddingVertical: SPACE.sm,
    paddingLeft: SPACE.sm,
    paddingRight: SPACE.lg,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.scrim,
  },
  edge: { borderWidth: StyleSheet.hairlineWidth, borderColor: COLOR.hairlineStrong },
  line: { color: COLOR.textPrimary },
  fill: { flexShrink: 1 },
})
