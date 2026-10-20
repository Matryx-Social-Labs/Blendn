import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { Linking, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { TopBar } from '../components/ds/TopBar'
import ScalePress from '../components/motion/ScalePress'
import { useToast } from '../components/Toast'
import { Text } from '../components/ui/Text'
import { useTopBarState } from '../lib/useTopBarState'
import { appVersionLabel } from '../lib/support'
import { BLENDN_LINKS, openInApp } from '../lib/links'
import { MAP_CREDITS } from '../lib/mapStyleEmber'
import { EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE } from '../lib/theme'

/** `ours`: one of our own pages, opened in the app. Otherwise another site's, opened in the system browser. */
type LinkRow = { icon: keyof typeof Ionicons.glyphMap; title: string; url: string; ours?: boolean }

/** Who the map is drawn from, with their licences (the map's own credit fades: this is where it stays). */
const MAP_DATA: LinkRow[] = Object.values(MAP_CREDITS).map((c) => ({
  icon: 'map-outline',
  title: 'licence' in c ? `${c.text} (${c.licence})` : c.text,
  url: c.href,
}))

/**
 * About Blend'n: which build this is, the documents it runs under, and who the
 * map is drawn from.
 *
 * The version is the first thing support asks for, so it is written out where
 * anyone can read it back to us. No accent: nothing here is a primary action.
 */
export default function AboutScreen() {
  const { showToast } = useToast()
  const bar = useTopBarState()

  // The in-app browser opens only blendn.app; the map's licence pages (OpenStreetMap's ODbL credit among them) are other sites'.
  const open = ({ url, ours }: LinkRow) =>
    (ours ? openInApp(url) : Linking.openURL(url)).catch(() => showToast("That page didn't open. Try again.", 'error'))

  const rows: LinkRow[] = [
    { icon: 'document-text-outline', title: 'Terms of Service', url: BLENDN_LINKS.terms, ours: true },
    { icon: 'lock-closed-outline', title: 'Privacy Policy', url: BLENDN_LINKS.privacy, ours: true },
    { icon: 'flag-outline', title: 'Community guidelines', url: BLENDN_LINKS.guidelines, ours: true },
  ]

  const card = (links: LinkRow[]) => (
    <View style={styles.card}>
      {links.map((row, i) => (
        <View key={row.title}>
          {i > 0 ? <View style={styles.divider} /> : null}
          <ScalePress
            haptic={false}
            pressedScale={0.98}
            onPress={() => void open(row)}
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
  )

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <TopBar title="About Blend'n" state={bar.state} onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} {...bar.scrollProps}>
        <View style={styles.section} accessible accessibilityLabel={`Version ${appVersionLabel()}`}>
          <Text variant="label">VERSION</Text>
          <Text variant="bodyStrong" selectable>{appVersionLabel()}</Text>
        </View>

        {card(rows)}

        <View style={styles.section}>
          <Text variant="label" accessibilityRole="header">MAP DATA</Text>
          {card(MAP_DATA)}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  content: { paddingHorizontal: GUTTER, paddingVertical: SPACE.lg, gap: SPACE.xxl },
  section: { gap: SPACE.xs },
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
