import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useCallback, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../../components/AppHeader'
import ScalePress from '../../components/motion/ScalePress'
import { PlaceholderBanner } from '../../components/ui/PlaceholderBanner'
import { Text } from '../../components/ui/Text'
import { apiClient, type VenueDetail } from '../../lib/apiClient'
import { liveNowLabel, tonightLine } from '../../lib/home'
import { EMBER, EMBER_RADIUS, GUTTER, SPACE } from '../../lib/theme'

/**
 * A place, opened from the Places list — PLACEHOLDER (plan v2 step 2;
 * docs/PLACEHOLDER_SCREENS.md §10).
 *
 * Only what `GET /venues/:venueId` already says: the place, how many are live
 * as a bucket, and tonight's event. Go Live, the live pill and "Own this place?
 * Claim it" fill this screen in step 5.
 */
export default function VenueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [detail, setDetail] = useState<VenueDetail | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!id) return
    void apiClient.getVenue(id).then((res) => {
      setFailed(res.success && res.data ? null : res.error || "This place didn't load.")
      if (res.success && res.data) setDetail(res.data)
    })
  }, [id])

  // On focus, so coming back to it shows the count as it is now.
  useFocusEffect(load)

  const tonight = detail?.tonight ? tonightLine(detail.tonight) : null

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title={detail?.venue.name ?? 'Place'} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        <PlaceholderBanner />
        {detail ? (
          <View style={styles.body}>
            <Text variant="title" accessibilityRole="header">
              {detail.venue.name}
            </Text>
            <Text variant="meta">
              {[detail.venue.venueTypeLabel, detail.venue.address ?? detail.venue.city].filter(Boolean).join(' · ')}
            </Text>
            <Text variant="bodyStrong">{liveNowLabel(detail.live.liveNow)}</Text>
            {tonight && detail.tonight ? (
              <ScalePress
                style={styles.tonight}
                onPress={() => router.push(`/event/${detail.tonight!.id}` as never)}
                accessibilityRole="button"
                accessibilityLabel={tonight}
              >
                <Text variant="bodyStrong">{tonight}</Text>
              </ScalePress>
            ) : null}
          </View>
        ) : failed ? (
          <View style={styles.body} accessibilityLiveRegion="polite">
            <Text variant="heading">{failed}</Text>
            <ScalePress style={styles.tonight} onPress={load} accessibilityRole="button" accessibilityLabel="Try again">
              <Text variant="bodyStrong">Try again</Text>
            </ScalePress>
          </View>
        ) : (
          <ActivityIndicator color={EMBER.textSecondary} accessibilityLabel="Loading the place" />
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  content: { paddingHorizontal: GUTTER, paddingVertical: SPACE.lg, gap: SPACE.xl },
  body: { gap: SPACE.md },
  tonight: {
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    borderWidth: 1,
    borderColor: EMBER.separator,
    backgroundColor: EMBER.surfaceSunken,
  },
})
