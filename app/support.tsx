import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { Linking, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { AppHeader } from '../components/AppHeader'
import ScalePress from '../components/motion/ScalePress'
import { EmberButton } from '../components/onboarding/EmberControls'
import { useToast } from '../components/Toast'
import { Text } from '../components/ui/Text'
import { appVersionLabel, platformLabel, SUPPORT_EMAIL, supportMailto } from '../lib/support'
import { BLENDN_LINKS } from '../lib/links'
import { EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE } from '../lib/theme'
import { useAuth } from '../lib/useAuth'

/**
 * Contact support: an email to a person, with what they will ask for already in it.
 *
 * The draft carries the app version, the phone and your account id under the
 * space for your message, and the screen says so before you send — it is your
 * mail app, and nothing leaves until you press send there.
 */
export default function SupportScreen() {
  const { user } = useAuth()
  const { showToast } = useToast()

  const email = () =>
    Linking.openURL(supportMailto({ subject: "Blend'n support", userId: user?.id })).catch(() =>
      // No mail app set up. The address is on screen, so say where to write.
      showToast(`No email app opened. Write to ${SUPPORT_EMAIL}.`, 'info')
    )

  const openHelp = () =>
    Linking.openURL(BLENDN_LINKS.help).catch(() => showToast("That page didn't open. Try again.", 'error'))

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title="Contact support" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.section}>
          <Text variant="body" color={EMBER.textSecondary}>
            Tell us what happened and we&apos;ll write back by email. Your draft includes these details so we
            don&apos;t have to ask:
          </Text>
          <View style={styles.details}>
            <Text variant="meta">App {appVersionLabel()}</Text>
            <Text variant="meta">{platformLabel()}</Text>
            {user?.id ? <Text variant="meta">Account {user.id}</Text> : null}
          </View>
          <EmberButton label="Email support" onPress={() => void email()} />
          <Text variant="meta" style={styles.center} selectable>{SUPPORT_EMAIL}</Text>
        </View>

        <ScalePress
          haptic={false}
          pressedScale={0.98}
          onPress={() => void openHelp()}
          accessibilityRole="link"
          accessibilityLabel="Help centre"
          style={styles.row}
        >
          <Ionicons name="help-circle-outline" size={ICON.md} color={EMBER.textPrimary} />
          <View style={styles.rowText}>
            <Text variant="bodyStrong">Help centre</Text>
            <Text variant="meta">Answers to the common questions</Text>
          </View>
          <Ionicons name="open-outline" size={ICON.sm} color={EMBER.textSecondary} />
        </ScalePress>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  content: { paddingHorizontal: GUTTER, paddingVertical: SPACE.lg, gap: SPACE.xxl },
  section: { gap: SPACE.lg },
  details: {
    gap: SPACE.xs,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
  },
  center: { textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    padding: SPACE.lg,
    borderRadius: EMBER_RADIUS.md,
    backgroundColor: EMBER.surfaceSunken,
  },
  rowText: { flex: 1, gap: SPACE.xxs },
})
