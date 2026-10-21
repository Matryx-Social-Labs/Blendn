import { StyleSheet, Text, View } from 'react-native'

import { Spinner } from '../ds/Loader'
import { font, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE } from '../../lib/design/tokens'

/**
 * Your invite link, shown as what it is: a link (Flow 2 friends 01 · 02 · 03).
 *
 * Shown in full rather than hidden behind the Share button, so it is plain what is being handed out, and that it is the only
 * way anybody can reach you, since there is no search. Sharing goes through the OS sheet, which already offers Copy,
 * Messages, WhatsApp, Instagram and the rest. The link is Geist Mono, selectable; a failure keeps the card's height and says
 * so in a sentence, with the primary becoming Try again.
 */
export function InviteLinkCard({ url, failed, shared }: { url?: string | null; failed?: boolean; shared?: boolean }) {
  const bold = useBoldText()
  return (
    <View testID="invite-link-card" style={styles.card}>
      <View style={styles.row}>
        {url ? (
          <>
            <Icon name="link" size={ICON.control} color={COLOR.textPrimary} />
            <Text
              testID="invite-link-url"
              selectable
              style={[font('body', bold, FONT_FAMILY.mono[500]), styles.url]}
              numberOfLines={2}
              maxFontSizeMultiplier={1.3}
            >
              {url.replace(/^https:\/\//, '')}
            </Text>
          </>
        ) : failed ? (
          <>
            <Icon name="circle-alert" size={ICON.control} color={COLOR.destructive} />
            <Text accessibilityRole="alert" style={[font('meta', bold), styles.message]}>
              Your link didn’t load. Check your connection and try again.
            </Text>
          </>
        ) : (
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Loading your link"
            accessibilityState={{ busy: true }}
            style={styles.loading}
          >
            <Spinner size={20} />
            <Text style={[font('meta', bold), styles.muted]}>Getting your link</Text>
          </View>
        )}
      </View>
      {url && shared ? (
        <View style={styles.sharedRow}>
          <Icon name="circle-check" size={ICON.inline} color={COLOR.live} />
          <Text style={[font('meta', bold), styles.muted]}>Shared. Anyone with the link can ask to be your friend.</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    gap: SPACE.md,
    padding: SPACE.lg,
    borderRadius: RADIUS.mediaInCard,
    backgroundColor: COLOR.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.hairline,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, minHeight: ICON.nav },
  sharedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  url: { flex: 1, color: COLOR.textPrimary },
  message: { flex: 1, color: COLOR.textPrimary },
  loading: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  muted: { color: COLOR.textSecondary },
})
