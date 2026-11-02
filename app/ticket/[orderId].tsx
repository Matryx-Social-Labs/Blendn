import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { AccessibilityInfo, FlatList, Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Chip } from '../../components/ds/Chip'
import { IconButton } from '../../components/ds/IconButton'
import { Loader } from '../../components/ds/Loader'
import { font, useBoldText } from '../../components/ds/shared'
import { StateScreen } from '../../components/ds/StateScreen'
import { QR_MAX, TicketPass } from '../../components/tickets/TicketPass'
import { COLOR, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { useMyTickets } from '../../lib/ticketCache'
import { ticketEventOf } from '../../lib/ticketing'
import { useAuth } from '../../lib/useAuth'

/** The pass's inner padding and the QR well's, either side: what the QR gives up to fit a narrow screen. */
const QR_INSET = (SPACE.lg + SPACE.md) * 2

/**
 * One order's tickets (T-A, contract §6), one page each, swiped. Drawn from the phone's copy at once (`useMyTickets`), so it
 * opens at a door with no signal, then the server's answer replaces it. "Works offline" is a fact, not a promise: the copy
 * is on the phone. Opened from the event page's "My ticket", its order row, the Going card, and after M-A.
 */
export default function TicketScreen() {
  const { orderId } = useLocalSearchParams<{ orderId?: string }>()
  const { user } = useAuth()
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const { width } = useWindowDimensions()
  const { tickets, events, offline, loaded, refresh } = useMyTickets(user?.id)
  const [page, setPage] = useState(0)
  const mine = tickets.filter((t) => t.orderId === orderId)
  // The ticket's own event (§8.4) first; the copy remembered from the event page or Going for a ticket that carries none.
  const event = mine[0] ? (ticketEventOf(mine[0]) ?? events[mine[0].eventId]) : undefined
  const qrSize = Math.min(QR_MAX, width - SPACE.gutter * 2 - QR_INSET)

  // Said once as it changes: the pass still works, it is only not fresh.
  useEffect(() => {
    if (offline && mine.length > 0) AccessibilityInfo.announceForAccessibility('Offline. Your ticket still works.')
    // Once per change of `offline`, not per ticket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline])

  const close = () => router.back()
  const top = (
    <View style={[styles.bar, { paddingTop: insets.top + SPACE.sm }]}>
      <IconButton icon={Platform.OS === 'android' ? 'arrow-left' : 'x'} accessibilityLabel="Close" onPress={close} testID="ticket-close" />
      {mine.length > 0 ? <Chip label={offline ? 'Offline · still valid' : 'Works offline'} icon={offline ? 'wifi-off' : 'check'} variant="outline" /> : null}
    </View>
  )

  if (mine.length === 0) {
    return (
      <View style={styles.screen}>
        {top}
        <View style={styles.state}>
          {!loaded ? (
            <Loader />
          ) : offline ? (
            <StateScreen icon="cloud-off" title="Couldn’t load your ticket" body="Check your connection and try again." actions={[{ label: 'Try again', onPress: () => void refresh() }]} />
          ) : (
            <StateScreen
              icon="ticket"
              title="No tickets on this order yet"
              body="If you just paid, it can take a minute to confirm. Your tickets show here once it does."
              actions={[{ label: 'Refresh', onPress: () => void refresh() }]}
            />
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      {top}
      <FlatList
        data={mine}
        keyExtractor={(t) => t.ticketId}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item, index }) => (
          <View style={[styles.page, { width }]}>
            <TicketPass ticket={item} index={index} total={mine.length} event={event} qrSize={qrSize} />
          </View>
        )}
      />
      {mine.length > 1 ? (
        <View style={[styles.foot, { paddingBottom: insets.bottom + SPACE.lg }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.dots}>
            {mine.map((t, i) => (
              <View key={t.ticketId} style={[styles.dot, i === page && styles.dotOn]} />
            ))}
          </View>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.secondary]}>
            {page < mine.length - 1 ? `Swipe for ticket ${page + 2}` : 'Swipe back for the others'}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

const DOT = SPACE.sm

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.gutter, paddingBottom: SPACE.md },
  page: { paddingHorizontal: SPACE.gutter, justifyContent: 'center' },
  state: { flex: 1, justifyContent: 'center', paddingHorizontal: SPACE.gutter },
  foot: { alignItems: 'center', gap: SPACE.sm, paddingTop: SPACE.md },
  dots: { flexDirection: 'row', gap: SPACE.sm },
  dot: { width: DOT, height: DOT, borderRadius: RADIUS.capsule, backgroundColor: COLOR.hairlineStrong },
  dotOn: { backgroundColor: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})
