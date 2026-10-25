import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { Avatar } from '../ds/Avatar'
import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { apiClient } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE } from '../../lib/design/tokens'
import { isGone } from '../../lib/loadFailure'
import { pendingInviteToken } from '../../lib/pendingRoute'

/** The avatar's box: the pill is 48 tall, the face 32 with 8 around it (Flow 1 `pendingInvite`). */
const AVATAR = 32
const PILL_HEIGHT = 48
/** What the pill says of a link that no longer works. */
export const DEAD_INVITE_LINE = 'That invite link has expired.'

/** The line beside the face. The landing says whose; the sign-in form adds what to do. */
export function pendingInviteLine(name: string, signIn: boolean): string {
  return signIn ? `${name} invited you. Sign in to accept.` : `${name} invited you`
}

type Preview = { kind: 'from'; name: string; photoUrl: string | null } | { kind: 'dead' }

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

  return (
    <View testID="pending-invite" accessible accessibilityLabel={pendingInviteLine(preview.name, signIn)} style={pill}>
      {preview.photoUrl ? (
        <Avatar kind="photo" uri={preview.photoUrl} size={AVATAR} />
      ) : (
        <Avatar kind="creature" pseudonym={preview.name} size={AVATAR} />
      )}
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
