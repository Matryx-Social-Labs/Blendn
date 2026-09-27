import React, { useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { HoldToConfirm } from '../../components/blendn/HoldToConfirm'
import { ConfettiBurst } from '../../components/motion/ConfettiBurst'
import { Text } from '../../components/ui/Text'
import { CONTROL, EMBER, SPACE } from '../../lib/theme'
import { useInteractionFeedback } from '../../lib/useInteractionFeedback'

/**
 * The check-in confetti, on demand.
 *
 * Deep-link `exp+blendn:///preview/confetti`.
 *
 * A real check-in can happen once per event, so tuning the burst against one
 * would mean checking out and walking back into the geofence each time. This
 * is the same hold button and the same burst with the server's "yes" faked,
 * so it plays once per hold, as often as you like.
 */
export default function ConfettiPreview() {
  const insets = useSafeAreaInsets()
  const feedback = useInteractionFeedback()
  const [trigger, setTrigger] = useState(0)
  const [busy, setBusy] = useState(false)

  const confirm = () => {
    // A short fake round trip, so the pop lands after the spinner as it does for real.
    setBusy(true)
    setTimeout(() => {
      setBusy(false)
      feedback.success()
      setTrigger((n) => n + 1)
    }, 400)
  }

  return (
    <View style={[styles.page, { paddingTop: insets.top + SPACE.xl }]}>
      <Text variant="title">Check-in confetti</Text>
      <Text variant="meta">Hold the button. Each hold plays one burst.</Text>
      <View style={[styles.dock, { paddingBottom: insets.bottom + SPACE.md }]}>
        <View style={styles.pass}>
          <HoldToConfirm label="Hold to check in" busy={busy} busyLabel="Checking you in…" onConfirm={confirm} />
        </View>
      </View>
      <ConfettiBurst trigger={trigger} originBottom={insets.bottom + SPACE.md + SPACE.lg + CONTROL.md / 2} />
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: EMBER.bg, paddingHorizontal: SPACE.xl, gap: SPACE.sm },
  dock: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: SPACE.md },
  pass: { padding: SPACE.lg },
})
