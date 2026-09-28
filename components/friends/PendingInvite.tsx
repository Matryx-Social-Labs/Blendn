import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'

import { OptimizedImage } from '../OptimizedImage'
import { Text } from '../ui/Text'
import { apiClient } from '../../lib/apiClient'
import { isGone } from '../../lib/loadFailure'
import { pendingInviteToken } from '../../lib/pendingRoute'
import { EMBER, EMBER_RADIUS, SPACE } from '../../lib/theme'

/** The avatar's box and its decode hint. */
const AVATAR = 32

/** The line beside the face. A name the server sent, or nobody. */
export function pendingInviteLine(name: string): string {
  return `Sign in to accept ${name}'s invite`
}

type Preview = { kind: 'from'; name: string; photoUrl: string | null } | { kind: 'dead' }

/**
 * Whose invite is waiting, on the welcome and sign-in screens.
 *
 * Signed out, an invite link (`/f/<token>`) is held until sign-in and the
 * guard shows the welcome screen instead (`app/_layout.tsx`). Without this
 * the link looked like it had simply opened the app. The public preview gives
 * a first name and a photo — nothing more, since whoever holds a forwarded
 * link has agreed to nothing yet.
 *
 * A link that doesn't work says so now rather than after the sign-up it
 * seemed to promise. Any other failure (offline, rate limited) draws nothing:
 * the link still opens after sign-in, and a line about a failure would be
 * about the wrong thing.
 */
export function PendingInvite() {
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

  if (preview.kind === 'dead') {
    return (
      <Text variant="meta" style={styles.center} maxFontSizeMultiplier={1.4}>
        This invite link doesn&apos;t work any more. Ask for a new one once you&apos;re in.
      </Text>
    )
  }

  return (
    <View style={styles.row} accessible accessibilityLabel={pendingInviteLine(preview.name)}>
      {preview.photoUrl ? (
        <OptimizedImage source={preview.photoUrl} style={styles.avatar} width={AVATAR} height={AVATAR} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, styles.avatarEmpty]}>
          <Text variant="caption">{(preview.name[0] ?? '?').toUpperCase()}</Text>
        </View>
      )}
      <Text variant="bodyStrong" style={styles.text} numberOfLines={2} maxFontSizeMultiplier={1.4}>
        {pendingInviteLine(preview.name)}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: SPACE.sm,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
  },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: EMBER_RADIUS.pill },
  avatarEmpty: { backgroundColor: EMBER.surfaceSunken, alignItems: 'center', justifyContent: 'center' },
  text: { flexShrink: 1 },
  center: { textAlign: 'center' },
})
