import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { dumpPerf, perfSnapshot, resetPerf, SLOW_COMMIT_MS } from '../../lib/perf'
import { EMBER, EMBER_FONTS, EMBER_TYPE } from '../../lib/theme'

/**
 * What every screen cost, since the app started or since the last reset.
 *
 * Deep-link `exp+blendn:///preview/perf`. Dev-only, like its siblings in this
 * folder — see `app/preview/scene.tsx`.
 *
 * ## The workflow this exists for
 *
 *   1. `exp+blendn:///preview/perf` and Reset
 *   2. walk the flow you care about
 *   3. come back here
 *
 * It prints to the Metro log as well as to the screen, because the log is the
 * half that can be read from a script — which is what makes a before/after
 * comparison something you run rather than something you eyeball.
 *
 * ## What the columns mean
 *
 *   mount    the first render. A cold open is this plus the network.
 *   worst    the slowest single commit. Anything over one frame dropped one.
 *   commits  how many times React re-rendered the subtree.
 *
 * `commits` is the one people skip and should not. A screen with a modest worst
 * case and a hundred commits is re-rendering on something it has no business
 * watching, and that is the shape that reads as **lag** rather than as a wait —
 * which is exactly the report this was built to chase.
 */
export default function PerfPreview() {
  const [rows, setRows] = useState(perfSnapshot())

  useEffect(() => {
    dumpPerf()
  }, [])

  const refresh = () => {
    dumpPerf()
    setRows(perfSnapshot())
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Text style={styles.title} accessibilityRole="header">
        Render cost
      </Text>
      <Text style={styles.note}>
        Slow commit ≥ {SLOW_COMMIT_MS}ms. Also printed to the Metro log.
      </Text>

      <View style={styles.actions}>
        <Pressable onPress={refresh} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>Refresh</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            resetPerf()
            setRows([])
          }}
          style={styles.button}
          accessibilityRole="button"
        >
          <Text style={styles.buttonText}>Reset</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>
            Nothing measured yet. Walk a flow and come back.
          </Text>
        ) : (
          rows.map((r) => (
            <View key={r.id} style={styles.row}>
              <Text style={styles.rowId}>{r.id}</Text>
              <Text style={styles.rowStat}>
                mount {r.mount.toFixed(0)}ms · worst {r.worst.toFixed(0)}ms ·{' '}
                {r.commits} commits · {r.total.toFixed(0)}ms total
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg, paddingHorizontal: 16 },
  title: { ...EMBER_TYPE.cardTitle, fontSize: 24, marginTop: 8 },
  note: { ...EMBER_TYPE.meta, marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  button: {
    minHeight: 40,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9999,
    backgroundColor: EMBER.surfaceSunken,
  },
  buttonText: { ...EMBER_TYPE.meta, color: EMBER.textPrimary },
  list: { paddingVertical: 20, gap: 14 },
  empty: { ...EMBER_TYPE.meta },
  row: { gap: 4 },
  rowId: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 16,
    lineHeight: 22,
    color: EMBER.accent,
  },
  rowStat: { ...EMBER_TYPE.meta },
})
