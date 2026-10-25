import * as Location from 'expo-location'
import { useCallback, useEffect, useState } from 'react'
import { AppState, StyleSheet, Text, View } from 'react-native'

import { font, useBoldText } from '../../components/ds/shared'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { SettingsTray } from '../../components/onboarding/SettingsTray'
import { LocationIllustration } from '../../components/onboarding/PermissionIllustration'
import { isPreciseLocationOff } from '../../components/onboarding/preciseLocation'
import { Icon } from '../../components/ui/Icon'
import { readStoredCity } from '../../lib/cityStorage'
import { COLOR, ICON, RADIUS, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { askOsPermission } from '../../lib/onboarding'
import { useOnboarding } from '../../lib/useOnboarding'

/**
 * Step three: location.
 *
 * Same shape as notifications, and the same reason for existing: the OS dialog
 * fires once, so the explanation has to come first.
 *
 * Location matters more here than it does in most apps — **check-in is
 * GPS-validated and there is no way around that**, so an account that refuses
 * location can browse and never attend. The copy says what it is for rather
 * than warning about that, because the warning belongs at the check-in button
 * where it is actionable, not on a screen someone is trying to get through.
 *
 * `share_location` is the profile preference — whether other people see roughly
 * where you are. Distinct from the OS permission, which is whether the app can
 * ask the device at all. Granting the permission is what this screen records;
 * the sharing preference follows it because the design has one control, and
 * both are editable in Settings afterwards.
 */
const SETTINGS_HINT = 'Blend’n uses your location to show events near you, and to check you in when you arrive at one.'
const PRECISE_OFF_NOTICE = 'Precise location is off, so check-in can’t confirm you’re inside the venue. Turn it on in Settings.'

/**
 * Whether location is allowed but only roughly: asked on arrival, after each answer, and on coming back from Settings
 * (where the switch is). Nothing asked of the person: reading the setting never prompts.
 */
function usePreciseLocationOff() {
  const [off, setOff] = useState(false)
  const read = useCallback(async () => {
    const permission = await Location.getForegroundPermissionsAsync().catch(() => null)
    setOff(isPreciseLocationOff(permission))
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the setting's own read
    void read()
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') void read()
    })
    return () => sub.remove()
  }, [read])
  return { off, read }
}

export default function LocationScreen() {
  const { saving, commit, goBack } = useOnboarding('location')
  const bold = useBoldText()
  const [asking, setAsking] = useState(false)
  const [settingsPrompt, setSettingsPrompt] = useState(false)
  const precise = usePreciseLocationOff()
  // The city the person has browsed, when there is one: "Near you · Bengaluru". Before any, the line says only "Near you".
  const [city, setCity] = useState<string | null>(null)
  useEffect(() => {
    void readStoredCity().then((stored) => setCity(stored?.city ?? null))
  }, [])

  const ask = async () => {
    setAsking(true)
    const { granted, blocked } = await askOsPermission(
      () => Location.getForegroundPermissionsAsync(),
      async () => (await Location.requestForegroundPermissionsAsync()).status === 'granted'
    )
    setAsking(false)
    void precise.read()

    if (blocked) {
      // The answer comes from the tray; the step waits for it.
      setSettingsPrompt(true)
      return
    }

    await commit({ share_location: granted })
  }

  return (
    <OnboardingScreen
      step="location"
      title="See who’s around"
      subtitle="Blend’n uses your location to show events near you, and to check you in when you arrive at one."
      ctaLabel="Allow location"
      ctaBusy={saving || asking}
      onContinue={() => void ask()}
      secondaryLabel="Maybe later"
      // The same bug in the second of two places — see the note in
      // `notifications.tsx`. Declining left `share_location` at `@default(true)`.
      onSecondary={() => void commit({ share_location: false })}
      footerNote="Your precise location is never shared with strangers."
      onBack={goBack}
    >
      {precise.off ? (
        <View testID="precise-off-notice" accessibilityRole="alert" style={styles.notice}>
          <Icon name="triangle-alert" size={ICON.control} color={COLOR.warning} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.noticeText]}>{PRECISE_OFF_NOTICE}</Text>
        </View>
      ) : null}
      <LocationIllustration city={city} notice={precise.off} />
      <SettingsTray
        visible={settingsPrompt}
        icon="map-pin-off"
        hint={SETTINGS_HINT}
        onClose={() => setSettingsPrompt(false)}
        onNotNow={() => {
          setSettingsPrompt(false)
          void commit({ share_location: false })
        }}
      />
    </OnboardingScreen>
  )
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACE.md,
    borderRadius: RADIUS.rowInCard,
    backgroundColor: COLOR.surface,
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
  noticeText: { flex: 1, color: COLOR.textPrimary },
})
