import { router } from 'expo-router'
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Banner } from '../components/ds/Banner'
import { SettingsGroup, SettingsRow } from '../components/ds/SettingsRow'
import { font, HueProvider, useBoldText } from '../components/ds/shared'
import { TopBar } from '../components/ds/TopBar'
import { OffersFromPlacesRow } from '../components/notifications/OffersFromPlacesRow'
import { COLOR, SPACE } from '../lib/design/tokens'
import { openChannelSettings } from '../lib/channelSettings'
import { OPACITY } from '../lib/theme'
import { PREF_ROWS, PREFS_FOOT } from '../lib/notificationPrefs'
import { useNotificationPrefs } from '../lib/useNotificationPrefs'
import { usePushPreference } from '../lib/usePushPreference'
import { useTopBarOverlay } from '../lib/useTopBarState'

const ANDROID = Platform.OS === 'android'
const OS_BLOCKING_TEXT = 'Your phone is blocking Blend’n’s notifications.'
const ANDROID_FOOT = 'Each row opens that channel in your phone’s settings. '

/**
 * Notification settings (Flow 9 · 9.6), reached from Settings and from the Notifications screen's ⋯.
 *
 * The master switch is the account's `push_enabled`, which the server already honours. Under "Tell me about"
 * the kinds dim when it is off. iOS shows a switch per kind only once the server sends them
 * (`useNotificationPrefs`: none until then, never a switch that cannot save); Android's rows open that
 * channel in the phone's settings, which needs no server. Offers are the server's already. The switches stop
 * the push only: the bell still fills.
 */
function NotificationSettingsContent() {
  const bold = useBoldText()
  const insets = useSafeAreaInsets()
  const bar = useTopBarOverlay()
  const push = usePushPreference()
  const kinds = useNotificationPrefs()
  const masterOff = push.enabled === false
  const phoneBlocks = push.off && push.enabled !== false

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: bar.contentTop, paddingBottom: insets.bottom + SPACE.xl }]}
        scrollIndicatorInsets={{ top: bar.indicatorTop }}
        showsVerticalScrollIndicator={false}
        {...bar.scrollProps}
      >
        {phoneBlocks ? (
          <Banner kind="info" icon="bell-off" text={OS_BLOCKING_TEXT} action={{ label: 'Turn on', icon: 'bell', onPress: () => void push.turnOn() }} testID="notification-settings-os" />
        ) : null}

        <SettingsGroup testID="notification-settings-master">
          <SettingsRow
            icon="bell"
            title="Push notifications"
            hint={push.os === 'blocked' && push.enabled ? 'Off in your phone’s settings.' : undefined}
            trail="switch"
            value={push.enabled === true && !phoneBlocks}
            onValueChange={push.toggle}
            busy={push.saving}
            disabled={push.enabled === null}
            testID="settings-pushEnabled"
          />
        </SettingsGroup>

        <View style={masterOff ? styles.dim : null} pointerEvents={masterOff ? 'none' : 'auto'} testID="notification-settings-kinds">
          <SettingsGroup title="Tell me about">
            {PREF_ROWS.map((row) =>
              ANDROID ? (
                <SettingsRow key={row.key} icon={row.icon} title={row.title} trail="external" opens="opens your phone’s settings" onPress={() => void openChannelSettings(row.channel)} testID={`pref-${row.key}`} />
              ) : kinds.prefs ? (
                <SettingsRow
                  key={row.key}
                  icon={row.icon}
                  title={row.title}
                  trail="switch"
                  value={kinds.prefs[row.key]}
                  onValueChange={() => void kinds.toggle(row.key)}
                  busy={kinds.saving.has(row.key)}
                  testID={`pref-${row.key}`}
                />
              ) : null
            )}
            {/* One offers row on both platforms: the account's switch. Android's offers channel is in the phone's settings with the rest. */}
            <OffersFromPlacesRow key="offers" />
          </SettingsGroup>
        </View>
        <Text style={[font('meta', bold), styles.foot]}>{(ANDROID ? ANDROID_FOOT : '') + PREFS_FOOT}</Text>
      </ScrollView>
      <View style={bar.barPin} pointerEvents="box-none">
        <TopBar title="Notifications" state={bar.state} onBack={() => router.back()} testID="notification-settings-top" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: SPACE.gutter, gap: SPACE.xl },
  dim: { opacity: OPACITY.disabled },
  // On the section labels' inset (SettingsGroup's 16), not a third edge of its own (r7 L9).
  foot: { color: COLOR.textTertiary, paddingHorizontal: SPACE.lg },
})

/** Violet world: one hue on this screen (`HueProvider`), as Settings. */
export default function NotificationSettingsScreen() {
  return (
    <HueProvider value="violet">
      <NotificationSettingsContent />
    </HueProvider>
  )
}
