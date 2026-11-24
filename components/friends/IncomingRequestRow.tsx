import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Reanimated from 'react-native-reanimated'

import { COLOR, MAX_FONT_SCALE, SPACE } from '../../lib/design/tokens'
import { requestSource, type FriendRequest } from '../../lib/friends'
import { Button } from '../ds/Button'
import { inboxTimeLabel } from '../banter/inbox'
import { monoCaption } from '../ds/MonoFamily'
import { IconButton } from '../ds/IconButton'
import { FitText } from '../ds/Title'
import { font, useBoldText, useLargeText } from '../ds/shared'
import { SkeletonCircle, SkeletonLine } from '../Skeleton'
import { rowOut, rowReflow } from '../motion/presence'
import { useReducedMotion } from '../../lib/motion'
import { LIST_FACE, PersonAvatar } from './PersonRow'

/** A request row's height at the default size (Flow 7 4-A: 68 pt rows, about eleven a screen where the cards gave five). */
// design-exception: the board's request row is 68 (fr.js `reqMini`)
export const REQUEST_ROW_HEIGHT = 68

/**
 * Somebody asking to be your friend (Flow 7 4-A): a 68 pt row, the face, the name on one line, and under it where the request came
 * from and how long it has waited ("From your link · 2m"). The source is said only when the server says it (`via`, admin #998):
 * a request from before the source was recorded (`null`) has the age alone, never a guess ("Opened your link" was wrong for every match).
 *
 * On the right, Not now (the glass ×) and Accept (the lit button). The board draws Accept as an icon-only lit disc, which no DS
 * kind gives yet (the button audit is pending), so it is the board's small lit Accept. While this row's answer is in flight
 * (`busy`) the answer pressed carries the wait and the other dims, which also stops a second tap sending a second answer. The
 * haptic is the outcome's, when the server says yes (`useFriendRequests`), never the press. At the AX sizes the answers go under
 * the name, so the name keeps the row's width.
 *
 * Answered, the row fades out and the rows below close the gap (DS #16); Reduce Motion: it goes and the column updates at once.
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
  const reduceMotion = useReducedMotion()
  const [answer, setAnswer] = useState<'accept' | 'dismiss' | null>(null)
  const respond = (action: 'accept' | 'dismiss') => {
    setAnswer(action)
    onRespond(action)
  }
  const waiting = (action: 'accept' | 'dismiss') => busy && answer === action
  const { person } = request
  const source = requestSource(request)
  // How long they have waited (D-LM2), as Banter's request card says it: "3h", "Tue"; a count in mono, a day-word in the sans.
  const age = inboxTimeLabel(request.createdAt)
  const answers = (
    <View style={styles.answers}>
      <IconButton icon="x" accessibilityLabel={`Not now, ${person.name}`} onPress={() => respond('dismiss')} disabled={busy} testID="request-not-now" />
      <Button
        kind="lit"
        size="sm"
        icon="user-check"
        label="Accept"
        accessibilityLabel={`Accept ${person.name}`}
        onPress={() => respond('accept')}
        loading={waiting('accept')}
        disabled={busy && !waiting('accept')}
      />
    </View>
  )
  return (
    <Reanimated.View exiting={reduceMotion ? undefined : rowOut} layout={reduceMotion ? undefined : rowReflow} style={styles.row} testID="request-row">
      <View style={styles.who}>
        <PersonAvatar person={person} size={LIST_FACE} />
        <View style={styles.text}>
          {/* The DS word fit: a word too wide for its line shrinks rather than splitting (SCRUM-1041 A, names in rows). */}
          <FitText variant="rowTitle" numberOfLines={largeText ? 2 : 1} maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={styles.ink}>
            {person.name}
          </FitText>
          {source || age ? (
            <Text testID="request-line" numberOfLines={largeText ? 2 : 1} maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('note', bold), styles.muted]}>
              {source}
              {source && age ? ' · ' : null}
              {age ? <Text testID="request-age" style={/\d/.test(age) ? monoCaption(bold) : null}>{age}</Text> : null}
            </Text>
          ) : null}
        </View>
        {largeText ? null : answers}
      </View>
      {largeText ? answers : null}
    </Reanimated.View>
  )
}

/** Requests while they load: rows at the row's own height, so the list does not jump when it lands. */
export function RequestSkeleton() {
  return (
    <View accessible testID="request-skeleton" accessibilityLabel="Loading requests" accessibilityState={{ busy: true }} style={styles.skeleton}>
      {[60, 70, 50, 80, 65].map((width) => (
        <View key={width} style={styles.skeletonRow}>
          <SkeletonCircle width={LIST_FACE} />
          <View style={styles.skeletonText}>
            <SkeletonLine width={`${width}%`} />
            <SkeletonLine width="30%" />
          </View>
        </View>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  skeleton: { paddingHorizontal: SPACE.gutter, paddingVertical: SPACE.sm },
  skeletonRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, height: REQUEST_ROW_HEIGHT },
  skeletonText: { flex: 1, gap: SPACE.sm },
  row: { minHeight: REQUEST_ROW_HEIGHT, justifyContent: 'center', gap: SPACE.sm, paddingVertical: SPACE.xs },
  who: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  text: { flex: 1, minWidth: 0 },
  answers: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: SPACE.sm },
  ink: { color: COLOR.textPrimary },
  muted: { color: COLOR.textSecondary },
})
