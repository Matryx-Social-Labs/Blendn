import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { apiClient } from '../../lib/apiClient'
import { COLOR, FONT_FAMILY, ICON, RADIUS, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { calendarDate } from '../../lib/time'

/** The pill is a 48 pt capsule (Flow 15 `signInToOpen`). */
const PILL_HEIGHT = 48
export const HELD_LINK_TITLE = 'Sign in to open this'
export const HELD_LINK_WHAT = 'An event · held for you'

type PublicShare = { available?: boolean; event?: { title?: unknown; startsAt?: unknown; timezone?: unknown } }

/**
 * "Neon Nights · Sat 4 Oct · held for you" from the public share read (the one a link preview is drawn from: it answers
 * without a session, and names nothing a signed-out person may not read). Null when the event can't be read (gone, private,
 * offline), and the pill keeps its generic line (SYS-15).
 */
export async function heldEventLine(eventId: string): Promise<string | null> {
  try {
    const res = await apiClient.queuedRequest<PublicShare>(`/api/public/share/events/${encodeURIComponent(eventId)}`, {}, false)
    const event = res.success && res.data?.available ? res.data.event : undefined
    const title = typeof event?.title === 'string' ? event.title.trim() : ''
    if (!title) return null
    const timeZone = typeof event?.timezone === 'string' ? event.timezone : undefined
    const date = typeof event?.startsAt === 'string' ? calendarDate(event.startsAt, { weekday: true, timeZone }) : ''
    return [title, date, 'held for you'].filter(Boolean).join(' · ')
  } catch {
    return null
  }
}

/**
 * A link tapped while signed out, held through sign-in and named on the landing (Flow 15 15.12 02): a solid pill above
 * the lockup. It opens after sign-in, on its own; the pill only says the link was not dropped. Static, no haptic. Given the
 * held event's id it names the event; without one, or when the read fails, it says "An event".
 */
export function HeldLink({ eventId }: { eventId?: string | null }) {
  const bold = useBoldText()
  const [named, setNamed] = useState<{ id: string; line: string } | null>(null)
  useEffect(() => {
    if (!eventId) return
    let live = true
    void heldEventLine(eventId).then((line) => live && line && setNamed({ id: eventId, line }))
    return () => {
      live = false
    }
  }, [eventId])
  const what = named && named.id === eventId ? named.line : HELD_LINK_WHAT
  const contrast = useIncreaseContrast()
  return (
    <View
      testID="held-link"
      accessible
      accessibilityLabel={`${HELD_LINK_TITLE}. ${what}`}
      style={[styles.pill, contrast ? IC_HAIRLINE : styles.edge]}
    >
      <Icon name="link" size={ICON.control} />
      <View style={styles.text}>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.title]} numberOfLines={1}>
          {HELD_LINK_TITLE}
        </Text>
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.caption} style={[font('caption', bold), styles.what]} numberOfLines={1}>
          {what}
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    minHeight: PILL_HEIGHT,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surface,
  },
  edge: { borderWidth: StyleSheet.hairlineWidth, borderColor: COLOR.hairline },
  text: { flex: 1, minWidth: 0 },
  title: { color: COLOR.textPrimary },
  what: { color: COLOR.textSecondary },
})
