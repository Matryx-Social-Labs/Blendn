import { StyleSheet, Text, View } from 'react-native'

import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import type { FriendRequest } from '../../lib/friends'
import { Button } from '../ds/Button'
import { inboxTimeLabel } from '../banter/inbox'
import { monoCaption } from '../ds/MonoFamily'
import { CONTROL_FONT_CAP, font, useBoldText, useLargeText } from '../ds/shared'
import { SkeletonBlock } from '../Skeleton'
import { PersonAvatar } from './PersonRow'

/** What is under the name: they came through your link, and the link is the only way in. */
export const REQUEST_LINE = 'Opened your link · asks to be your friend'

/**
 * Somebody asking to be your friend (Flow 6 `requestCard`): a `surface` card at radius 24, the face, the name and the line, and the
 * two answers side by side under them, Not now beside Accept, 48 pt each (`Button size="md"`, the DS has no 44). Not now is the glass-ground secondary: a `surface` fill on a `surface` card would have no edge.
 *
 * Accept is the lit button (the screen's rose, the glyph before the label), not the gradient. On Add friends, "Share my link" is the
 * screen's one primary; a column of gradient Accepts under it made two. Both answers dim while this row's answer is in flight (`busy`), and only
 * this row's, which is also what stops a second tap sending a second answer. The haptic is the outcome's, when the server says yes
 * (`useFriendRequests`), never the press.
 */
export function IncomingRequestRow({
  request,
  busy,
  onRespond,
}: {
  request: FriendRequest
  busy: boolean
  onRespond: (action: 'accept' | 'dismiss') => void
}) {
  const bold = useBoldText()
  const largeText = useLargeText()
  const { person } = request
  // How long they have waited (D-LM2), as Banter's request card says it: "3h", "Tue"; a count in mono, a day-word in the sans.
  const age = inboxTimeLabel(request.createdAt)
  return (
    <View style={styles.card}>
      <View style={styles.who}>
        <PersonAvatar person={person} />
        <View style={styles.text}>
          {/* fc5eb48's request card: the name and the line grow to their caps and double their lines at the AX sizes (D-M5). */}
          <Text numberOfLines={largeText ? 2 : 1} maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={[font('bodyStrong', bold, FONT_FAMILY.brand[500]), styles.ink]}>
            {person.name}
          </Text>
          <Text numberOfLines={largeText ? 4 : 2} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.muted]}>
            {REQUEST_LINE}
          </Text>
        </View>
        {age ? (
          // A tag beside the row, as the Banter row's time: it stops where a control does.
          <Text testID="request-age" maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[/\d/.test(age) ? monoCaption(bold) : font('caption', bold), styles.tertiary]}>
            {age}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Button
          kind="secondary"
          size="md"
          label="Not now"
          onGlass
          accessibilityLabel={`Not now, ${person.name}`}
          onPress={() => onRespond('dismiss')}
          disabled={busy}
          style={styles.action}
        />
        <Button
          kind="lit"
          size="md"
          icon="user-check"
          label="Accept"
          accessibilityLabel={`Accept ${person.name}`}
          onPress={() => onRespond('accept')}
          disabled={busy}
          style={styles.action}
        />
      </View>
    </View>
  )
}

/** Requests while they load (Flow 6 requests 14): three cards at the card's own height, so the list does not jump when it lands. */
const SKELETON_CARD = 140
export function RequestSkeleton() {
  return (
    <View testID="request-skeleton" accessibilityLabel="Loading requests" accessibilityState={{ busy: true }} style={styles.skeleton}>
      {[0, 1, 2].map((i) => (
        <SkeletonBlock key={i} height={SKELETON_CARD} borderRadius={RADIUS.mediaInCard} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  skeleton: { gap: SPACE.md, paddingHorizontal: SPACE.gutter, paddingVertical: SPACE.sm },
  card: { gap: SPACE.md, padding: SPACE.lg, borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surface },
  who: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  text: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', gap: SPACE.sm },
  action: { flex: 1 },
  ink: { color: COLOR.textPrimary },
  muted: { color: COLOR.textSecondary },
  tertiary: { color: COLOR.textTertiary, alignSelf: 'flex-start' },
})
