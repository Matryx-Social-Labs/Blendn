import * as Location from 'expo-location'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, StyleSheet, Text, View } from 'react-native'

import { font, useBoldText, useAnnounced } from '../../components/ds/shared'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { SettingsTray } from '../../components/onboarding/SettingsTray'
import { LocationIllustration } from '../../components/onboarding/PermissionIllustration'
import { isPreciseLocationOff } from '../../lib/preciseLocation'
import { Icon } from '../../components/ui/Icon'
import { COLOR, ICON, RADIUS, SPACE, MAX_FONT_SCALE } from '../../lib/design/tokens'
import { roughFix } from '../../lib/locationFix'
import type { LngLat } from '../../lib/mapLit'
import { useReducedMotion } from '../../lib/motion'
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
/** After Allow, how long a fix is waited for before the step moves on without the flight. */
const FIX_DEADLINE_MS = 3000
/** The flight to you and the lighting of what is near, at most this long: the step never waits on the map. */
const SHOWN_CAP_MS = 5000

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
  useAnnounced(precise.off ? PRECISE_OFF_NOTICE : null)
  const reduceMotion = useReducedMotion()
  const [you, setYou] = useState<LngLat | null>(null)
  const shown = useRef<(() => void) | null>(null)

  /** On Allow, with motion: the map flies to the fix and lights what is near before the step moves on (owner, 2026-11-01). */
  const showWhereYouAre = async () => {
    const fix = await roughFix(FIX_DEADLINE_MS).catch(() => null)
    if (!fix) return
    await new Promise<void>((resolve) => {
      shown.current = resolve
      setTimeout(resolve, SHOWN_CAP_MS)
      setYou([fix.coords.longitude, fix.coords.latitude])
    })
  }

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

    if (granted && !reduceMotion) {
      setAsking(true)
      await showWhereYouAre()
      setAsking(false)
    }
    await commit({ share_location: granted })
  }

  return (
    <OnboardingScreen
      step="location"
      title="See what’s on "
      titleAccent="near you"
      subtitle="Used to show what’s nearby and to check you in at the door. Never shared with strangers."
      ctaLabel="Allow location"
      ctaBusy={saving || asking}
      onContinue={() => void ask()}
      secondaryLabel="Maybe later"
      // The same bug in the second of two places — see the note in
      // `notifications.tsx`. Declining left `share_location` at `@default(true)`.
      onSecondary={() => void commit({ share_location: false })}
      onBack={goBack}
    >
      {precise.off ? (
        <View testID="precise-off-notice" accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.notice}>
          <Icon name="triangle-alert" size={ICON.control} color={COLOR.warning} />
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.noticeText]}>{PRECISE_OFF_NOTICE}</Text>
        </View>
      ) : null}
      <LocationIllustration notice={precise.off} you={you} onShown={() => shown.current?.()} />
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
