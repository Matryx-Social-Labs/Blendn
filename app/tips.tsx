import { router } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { SettingsGroup } from '../components/ds/SettingsRow'
import { font, HueProvider, useBoldText } from '../components/ds/shared'
import { TopBar } from '../components/ds/TopBar'
import { COACH_TIPS } from '../lib/coachMarks'
import { COLOR, SPACE, MAX_FONT_SCALE } from '../lib/design/tokens'
import { useTopBarOverlay } from '../lib/useTopBarState'

const INTRO = 'Each tip shows once, on its own screen, the first time it applies. They’re all here to read again.'

/**
 * Settings › Help › Tips (R4-2): every coach-mark sentence, grouped by the screen it shows on, and when. Reading only:
 * nothing here replays a tip, and a row does nothing when pressed.
 */
function TipsContent() {
  const bold = useBoldText()
  const insets = useSafeAreaInsets()
  const bar = useTopBarOverlay()
  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: bar.contentTop, paddingBottom: insets.bottom + SPACE.xl }]}
        scrollIndicatorInsets={{ top: bar.indicatorTop }}
        showsVerticalScrollIndicator={false}
        {...bar.scrollProps}
      >
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.intro]}>{INTRO}</Text>
        {COACH_TIPS.map((tip) => (
          <SettingsGroup key={tip.id} title={tip.screen} testID={`tip-${tip.id}`}>
            {/* Plain text in the card: a tip is read, never pressed, so no glyph and no row to ripple. */}
            <View style={styles.tip}>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.text]}>{tip.text}</Text>
              <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.when]}>{tip.when}</Text>
            </View>
          </SettingsGroup>
        ))}
      </ScrollView>
      <View style={bar.barPin} pointerEvents="box-none">
        <TopBar title="Tips" state={bar.state} onBack={() => router.back()} testID="tips-top" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: SPACE.gutter, gap: SPACE.xl },
  intro: { color: COLOR.textSecondary },
  tip: { padding: SPACE.lg, gap: SPACE.xxs },
  text: { color: COLOR.textPrimary },
  when: { color: COLOR.textTertiary },
})

/** Violet world: one hue on this screen (`HueProvider`), as Settings. */
export default function TipsScreen() {
  return (
    <HueProvider value="violet">
      <TipsContent />
    </HueProvider>
  )
}
