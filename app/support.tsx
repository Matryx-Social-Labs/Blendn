import { router } from 'expo-router'
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '../components/ds/Button'
import { SettingsGroup, SettingsRow } from '../components/ds/SettingsRow'
import { font, monoValue, useBoldText, useLargeText } from '../components/ds/shared'
import { TopBar } from '../components/ds/TopBar'
import ScalePress from '../components/motion/ScalePress'
import { useToast } from '../components/Toast'
import { Icon, type IconName } from '../components/ui/Icon'
import { COLOR, ICON, MAX_FONT_SCALE, PRESS, RADIUS, SIZE, SPACE } from '../lib/design/tokens'
import { copyText } from '../lib/copyText'
import { BLENDN_LINKS, openInApp } from '../lib/links'
import { appVersionLabel, platformParts, shortAccountId, SUPPORT_EMAIL, supportMailto } from '../lib/support'
import { useAuth } from '../lib/useAuth'
import { useTopBarOverlay } from '../lib/useTopBarState'

/**
 * Contact support (guidelines/flow-7 `support`): an email to a person, with what they will ask for already in it.
 *
 * The screen says what the draft carries (the app, the phone, your account) as a solid card, then Email support as the
 * screen's one gradient primary; the address is written once and copies on a tap; the Help centre leaves the app. The
 * foot says nothing is sent until you press Send in your mail app, which is true: it is your mail app.
 */
export default function SupportScreen() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const bar = useTopBarOverlay()
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  // D-M9: at the accessibility sizes a row's label and value no longer fit side by side; the label went. They stack.
  const largeText = useLargeText()

  const email = () =>
    Linking.openURL(supportMailto({ subject: "Blend’n support", userId: user?.id })).catch(() =>
      // No mail app set up. The address is on screen, so say where to write.
      showToast(`No email app opened. Write to ${SUPPORT_EMAIL}.`, 'info')
    )

  const openHelp = () => openInApp(BLENDN_LINKS.help).catch(() => showToast("That page didn’t open. Try again.", 'error'))

  const os = platformParts()
  const details: { icon: IconName; name: string; value: string }[] = [
    { icon: 'smartphone', name: 'App', value: appVersionLabel() },
    // The system it runs on; Android's old smartphone-nfc read as a phone set to vibrate (r7 L15).
    { icon: Platform.OS === 'ios' ? 'apple' : 'cpu', name: os.name, value: os.version },
    ...(user?.id ? [{ icon: 'user' as const, name: 'Account ID', value: shortAccountId(user.id) }] : []),
  ]

  return (
    <View style={styles.screen}>
      <ScrollView
        {...bar.scrollProps}
        contentContainerStyle={[styles.content, { paddingTop: bar.contentTop + SPACE.md, paddingBottom: insets.bottom + SPACE.xxl }]}
        scrollIndicatorInsets={{ top: bar.indicatorTop }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[font('body', bold), styles.ink]} maxFontSizeMultiplier={MAX_FONT_SCALE.body}>
          Tell us what happened and we’ll write back by email. Your draft includes these details so we don’t have to ask:
        </Text>

        <View style={styles.details}>
          {details.map((row, i) => (
            <View key={row.name}>
              {i ? <View style={styles.hairline} /> : null}
              <View accessible accessibilityLabel={`${row.name}, ${row.value}`} style={styles.detail} testID={`support-detail-${i}`}>
                <Icon name={row.icon} size={ICON.control} />
                <View style={largeText ? styles.stacked : styles.inline}>
                  <Text style={[font('bodyStrong', bold), styles.name]} maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong}>
                    {row.name}
                  </Text>
                  <Text style={[monoValue(bold), styles.value]} maxFontSizeMultiplier={MAX_FONT_SCALE.meta}>
                    {row.value}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>

        <Button label="Email support" icon="mail" onPress={() => void email()} testID="support-email" />

        <ScalePress
          haptic={false}
          pressedScale={PRESS.scale}
          onPress={() => copyText(SUPPORT_EMAIL, showToast)}
          accessibilityRole="button"
          accessibilityLabel={`${SUPPORT_EMAIL}, copies the address`}
          style={styles.address}
          testID="support-address"
        >
          {/* One line, shrunk to fit: an address broken mid-way can't be read back (D-L13). */}
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[monoValue(bold), styles.addressText]} numberOfLines={1} adjustsFontSizeToFit>
            {SUPPORT_EMAIL}
          </Text>
          <Icon name="copy" size={ICON.inline} color={COLOR.textTertiary} />
        </ScalePress>

        <SettingsGroup>
          <SettingsRow icon="circle-question-mark" title="Help centre" hint="Answers to the common questions" trail="external" onPress={() => void openHelp()} />
        </SettingsGroup>

        <Text style={[font('meta', bold), styles.foot]} maxFontSizeMultiplier={MAX_FONT_SCALE.meta}>Nothing is sent until you press Send in your mail app.</Text>
      </ScrollView>
      <View style={bar.barPin} pointerEvents="box-none">
        <TopBar title="Contact support" state={bar.state} onBack={() => router.back()} testID="support-top" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  content: { flexGrow: 1, gap: SPACE.lg, paddingHorizontal: SPACE.gutter },
  ink: { color: COLOR.textPrimary },
  details: { borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, overflow: 'hidden' },
  detail: { flexDirection: 'row', alignItems: 'center', gap: SPACE.lg, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, minHeight: SIZE.targetIos },
  inline: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: SPACE.lg },
  stacked: { flex: 1, gap: SPACE.xxs },
  name: { flexShrink: 1, flexGrow: 1, color: COLOR.textPrimary },
  value: { color: COLOR.textSecondary },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: COLOR.hairline, marginLeft: SPACE.lg + ICON.control + SPACE.lg },
  address: { flexDirection: 'row', alignSelf: 'center', maxWidth: '100%', alignItems: 'center', gap: SPACE.sm, minHeight: SIZE.targetIos, paddingHorizontal: SPACE.lg },
  addressText: { flexShrink: 1, color: COLOR.textPrimary },
  // At the foot of a short page, after the content of a long one.
  foot: { marginTop: 'auto', color: COLOR.textTertiary, textAlign: 'center' },
})
