import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { Linking, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../components/AppHeader'
import ScalePress from '../components/motion/ScalePress'
import { useToast } from '../components/Toast'
import { Text } from '../components/ui/Text'
import { appVersionLabel, BLENDN_LINKS } from '../lib/support'
import { EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE } from '../lib/theme'

/**
 * About Blend'n: which build this is, and the documents it runs under.
 *
 * The version is the first thing support asks for, so it is written out where
 * anyone can read it back to us. No accent: nothing here is a primary action.
 */
export default function AboutScreen() {
  const { showToast } = useToast()

  const open = (url: string) =>
    Linking.openURL(url).catch(() => showToast("That page didn't open. Try again.", 'error'))

  const rows = [
    { icon: 'document-text-outline', title: 'Terms of Service', url: BLENDN_LINKS.terms },
    { icon: 'lock-closed-outline', title: 'Privacy Policy', url: BLENDN_LINKS.privacy },
    { icon: 'flag-outline', title: 'Community guidelines', url: BLENDN_LINKS.guidelines },
  ] as const

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title="About Blend'n" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.version} accessible accessibilityLabel={`Version ${appVersionLabel()}`}>
          <Text variant="label">VERSION</Text>
          <Text variant="bodyStrong" selectable>{appVersionLabel()}</Text>
        </View>

        <View style={styles.card}>
          {rows.map((row, i) => (
            <View key={row.title}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <ScalePress
                haptic={false}
                pressedScale={0.98}
                onPress={() => void open(row.url)}
                accessibilityRole="link"
                accessibilityLabel={row.title}
                style={styles.row}
              >
                <Ionicons name={row.icon} size={ICON.md} color={EMBER.textPrimary} />
                <Text variant="bodyStrong" style={styles.rowTitle}>{row.title}</Text>
                <Ionicons name="open-outline" size={ICON.sm} color={EMBER.textSecondary} />
              </ScalePress>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  content: { paddingHorizontal: GUTTER, paddingVertical: SPACE.lg, gap: SPACE.xxl },
  version: { gap: SPACE.xs },
  card: {
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: EMBER_RADIUS.md,
    borderWidth: 1,
    borderColor: EMBER.separator,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, padding: SPACE.lg },
  rowTitle: { flex: 1 },
  divider: { height: 1, backgroundColor: EMBER.separator, marginLeft: SPACE.lg + ICON.md + SPACE.md },
})
