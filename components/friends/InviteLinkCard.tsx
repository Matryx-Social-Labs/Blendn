import { StyleSheet, Text, View } from 'react-native'

import { Avatar } from '../ds/Avatar'
import { personFace } from '../../lib/personFace'
import { Spinner } from '../ds/Loader'
import { SegmentedControl } from '../ds/SegmentedControl'
import { InviteQr } from './InviteQr'
import { FitText } from '../ds/Title'
import { CONTROL_FONT_CAP, font, useBoldText, useIncreaseContrast, useLargeText, useAnnounced } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, MAX_FONT_SCALE, RADIUS, SIZE, SPACE } from '../../lib/design/tokens'
import { tint } from '../../lib/theme'

/** Flow 6 `add`: the link pill is 48 tall on the card's 20 pt padding. */
// design-exception: the frame's card padding is 20
const CARD_PAD = 20
const FACE = 56
const PILL_ALPHA = 0.45
const PILL_EDGE_ALPHA = 0.3

/** The token's tail shown, enough to tell two links apart. */
const TAIL = 6

/**
 * The link's short form for the pill (A9: the raw URL broke mid-token over two lines): the host and the token's last six,
 * "blendn.app/…qrstuv". Copy and Share carry the whole URL; a screen reader hears it whole. Any other shape is shown whole.
 */
export function shortInviteLink(url: string): string {
  const parts = /^https?:\/\/(?:www\.)?([^/]+)\/f\/([^/?#]+)/.exec(url)
  return parts ? `${parts[1]}/…${parts[2].slice(-TAIL)}` : url.replace(/^https?:\/\//, '')
}

/**
 * Your invite link, shown as what it is: a link (Flow 6 `add`, Flow 2 friends 01 · 02 · 03). A `surface` card at radius 32: your face
 * and name and "on Blend’n" above, and the link's short form in a pill beneath, in Geist Mono (Copy and Share carry it whole).
 *
 * Shown (in short) rather than hidden behind the Share button, so it is plain what is being handed out, and that it is the only
 * way anybody can reach you, since there is no search. Sharing goes through the OS sheet, which already offers Copy,
 * Messages, WhatsApp, Instagram and the rest. A failure keeps the card's height and says so in a sentence, with the primary
 * becoming Try again.
 *
 * Flow 7 2-A: the same card flips between the link and a QR code of the same URL with your face in the middle (`side`), by the
 * segmented control at its foot, so somebody at the same table can scan it. The QR side shows only once the link has loaded.
 */
const LINK_FAILED = 'Your link didn’t load. Check your connection and try again.'

export function InviteLinkCard({
  url,
  failed,
  shared,
  name,
  photo,
  side = 'link',
  onSide,
}: {
  url?: string | null
  failed?: boolean
  shared?: boolean
  /** Which face of the card is up; with `onSide`, the Link | QR code control is drawn at its foot. */
  side?: InviteSide
  onSide?: (side: InviteSide) => void
  /** Yours, as people will see it when they open the link. */
  name?: string | null
  photo?: string | null
}) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const largeText = useLargeText()
  const who = name?.trim() || null
  useAnnounced(failed && !url ? LINK_FAILED : null)
  const qr = side === 'qr' && !!url
  const flip = url && onSide ? (
    <SegmentedControl compact items={SIDES} selected={side === 'qr' ? 1 : 0} onChange={(i) => onSide(i === 1 ? 'qr' : 'link')} testID="invite-side" />
  ) : null
  if (qr) {
    return (
      <View testID="invite-link-card" style={[styles.card, contrast ? styles.cardContrast : styles.cardEdge]}>
        <View style={styles.qrSide}>
          <InviteQr url={url} size={QR_SIZE} face={{ name: who ?? '', photo: photo ?? null, size: QR_FACE }} />
          <View>
            {who ? (
              <FitText variant="heading" numberOfLines={largeText ? 2 : 1} maxFontSizeMultiplier={MAX_FONT_SCALE.heading} style={[styles.ink, styles.centre]}>
                {who}
              </FitText>
            ) : null}
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold), styles.muted, styles.centre]}>
              Scan to ask to be friends
            </Text>
          </View>
        </View>
        {flip}
      </View>
    )
  }
  return (
    <View testID="invite-link-card" style={[styles.card, contrast ? styles.cardContrast : styles.cardEdge]}>
      {who ? (
        <View style={styles.who}>
          <Avatar size={FACE} {...personFace({ named: true, name: who, photo })} />
          <View style={styles.whoText}>
            {/* Your name grows to the heading cap and takes two lines at the AX sizes; the line under it stops at meta's (D-LM10). */}
            <FitText variant="heading" numberOfLines={largeText ? 2 : 1} maxFontSizeMultiplier={MAX_FONT_SCALE.heading} style={styles.ink}>
              {who}
            </FitText>
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.onBlendn]}>
              on Blend’n
            </Text>
          </View>
        </View>
      ) : null}
      <View style={[styles.pill, contrast && styles.pillContrast]}>
        {url ? (
          <>
            <Icon name="link" size={ICON.inline} color={COLOR.textPrimary} />
            <Text
              testID="invite-link-url"
              accessibilityLabel={`Your link, ${url.replace(/^https?:\/\//, '')}`}
              style={[font('body', bold, FONT_FAMILY.mono[500]), styles.url]}
              numberOfLines={1}
              ellipsizeMode="middle"
              maxFontSizeMultiplier={CONTROL_FONT_CAP}
            >
              {shortInviteLink(url)}
            </Text>
          </>
        ) : failed ? (
          <>
            <Icon name="circle-alert" size={ICON.control} color={COLOR.destructive} />
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.message]}>
              {LINK_FAILED}
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
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.muted]}>
              Getting your link
            </Text>
          </View>
        )}
      </View>
      {flip}
      {url && shared ? (
        <View style={styles.sharedRow}>
          <Icon name="circle-check" size={ICON.inline} color={COLOR.live} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.muted, styles.shrink]}>
            Shared. Anyone with the link can ask to be your friend.
          </Text>
        </View>
      ) : null}
    </View>
  )
}

export type InviteSide = 'link' | 'qr'
const SIDES = ['Link', 'QR code'] as const
// design-exception: the board's QR is 196 with a 48 face (fr.js `cardSeg`)
const QR_SIZE = 196
const QR_FACE = 48

const styles = StyleSheet.create({
  qrSide: { alignItems: 'center', gap: SPACE.md },
  centre: { textAlign: 'center' },
  card: { gap: SPACE.lg, padding: CARD_PAD, borderRadius: RADIUS.card, backgroundColor: COLOR.surface, overflow: 'hidden' },
  cardEdge: { borderWidth: StyleSheet.hairlineWidth, borderColor: COLOR.hairline },
  cardContrast: { borderWidth: 1, borderColor: COLOR.hairlineStrong },
  who: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  whoText: { flex: 1, minWidth: 0 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    minHeight: SIZE.control,
    paddingVertical: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.button,
    backgroundColor: tint(COLOR.ink, PILL_ALPHA),
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: tint(COLOR.textPrimary, PILL_EDGE_ALPHA),
  },
  pillContrast: { borderWidth: 1, borderColor: COLOR.textPrimary },
  sharedRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  ink: { color: COLOR.textPrimary },
  onBlendn: { color: tint(COLOR.textPrimary, 0.85) },
  url: { flex: 1, color: COLOR.textPrimary },
  message: { flex: 1, color: COLOR.textPrimary },
  loading: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  muted: { color: COLOR.textSecondary },
  shrink: { flexShrink: 1 },
})
