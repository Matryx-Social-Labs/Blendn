import { router } from 'expo-router'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Backdrop, ORB_LEVEL } from '../components/onboarding/Backdrop'
import { DiscMark } from '../components/ds/DiscMark'
import { SettingsGroup, SettingsRow } from '../components/ds/SettingsRow'
import { CONTROL_FONT_CAP, font, minTarget, monoValue, useBoldText } from '../components/ds/shared'
import { TopBar } from '../components/ds/TopBar'
import ScalePress from '../components/motion/ScalePress'
import { useToast } from '../components/Toast'
import { GradientFill } from '../components/ui/GradientFill'
import { Icon } from '../components/ui/Icon'
import { COLOR, ICON, MAX_FONT_SCALE, PRESS, RADIUS, SPACE } from '../lib/design/tokens'
import { copyText } from '../lib/copyText'
import { BLENDN_LINKS, openInApp } from '../lib/links'
import { MAP_CREDITS } from '../lib/mapStyleEmber'
import { appVersionLabel, GRIEVANCE_LINE, grievanceMailto } from '../lib/support'
import { useTopBarOverlay } from '../lib/useTopBarState'

/** The disc the mark sits on (Flow 7 `about`: 96 pt, the gradient, the monogram at 62 pt tall inside). */
const MARK_DISC = 96
const MARK_HEIGHT = 62
/** The credit line the two typefaces' licences ask for, at the foot. */
const FONT_CREDIT = 'Satoshi © Indian Type Foundry · Geist Mono © Vercel'

/** Who the map is drawn from, with their licences (the map's own credit fades: this is where it stays). */
const MAP_DATA = Object.values(MAP_CREDITS).map((c) => ({
  // A non-breaking space inside the licence keeps "(CC BY 4.0)" whole when the row wraps.
  title: 'licence' in c ? `${c.text} (${c.licence.replace(/ /g, '\u00A0')})` : c.text,
  url: c.href,
}))

/**
 * About Blend'n (guidelines/flow-7 `about`): a short, quiet page on the brand orbs. The mark on its gradient disc, the
 * lockup, the version as a tap-to-copy chip (the first thing support asks for), the legal links one tap away, the
 * grievance officer, who the map is drawn from, and the typefaces' credit at the foot. No primary action.
 *
 * Our own pages open in the in-app browser (blendn.app only); the map's licence pages (OpenStreetMap's ODbL credit
 * among them) are other sites', and the grievance row opens the mail app. A link that will not open is a toast.
 */
export default function AboutScreen() {
  const { showToast } = useToast()
  const bar = useTopBarOverlay()
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const version = appVersionLabel()

  const fail = () => showToast("That page didn’t open. Try again.", 'error')
  const openOurs = (url: string) => () => void openInApp(url).catch(fail)
  const openTheirs = (url: string) => () => void Linking.openURL(url).catch(fail)

  return (
    <View style={styles.screen}>
      <Backdrop level={ORB_LEVEL.landing} />
      <ScrollView
        {...bar.scrollProps}
        contentContainerStyle={[styles.content, { paddingTop: bar.contentTop + SPACE.lg, paddingBottom: insets.bottom + SPACE.xxl }]}
        scrollIndicatorInsets={{ top: bar.indicatorTop }}
        showsVerticalScrollIndicator={false}
      >
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.disc}>
          <GradientFill gradient="brand" style={StyleSheet.absoluteFill} />
          <DiscMark height={MARK_HEIGHT} fill="white" />
        </View>

        <View style={styles.lockup}>
          {/* One line, shrunk to fit: a wordmark never breaks "Blend’ / n" (D-M10). */}
          <Text accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.display} numberOfLines={1} adjustsFontSizeToFit style={[font('display', bold), styles.name]} testID="about-wordmark">
            Blend’n
          </Text>
          <ScalePress
            haptic={false}
            pressedScale={PRESS.scale}
            onPress={() => copyText(version, showToast)}
            accessibilityRole="button"
            accessibilityLabel={`Version ${version}`}
            accessibilityHint="Copies the version"
            hitSlop={{ top: (minTarget() - CHIP_HEIGHT) / 2, bottom: (minTarget() - CHIP_HEIGHT) / 2 }}
            style={styles.chip}
            testID="about-version"
          >
            <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('label', bold), styles.chipLabel]}>
              Version
            </Text>
            <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[monoValue(bold), styles.chipValue]}>
              {version}
            </Text>
            <Icon name="copy" size={ICON.inline} color={COLOR.textTertiary} />
          </ScalePress>
        </View>

        <View style={styles.full}>
          <SettingsGroup>
            <SettingsRow icon="file-text" title="Terms of Service" trail="external" onPress={openOurs(BLENDN_LINKS.terms)} />
            <SettingsRow icon="lock" title="Privacy Policy" trail="external" onPress={openOurs(BLENDN_LINKS.privacy)} />
            <SettingsRow icon="flag" title="Community guidelines" trail="external" onPress={openOurs(BLENDN_LINKS.guidelines)} />
            <SettingsRow
              icon="scale"
              title="Grievances"
              hint={GRIEVANCE_LINE}
              trail="external"
              opens="opens your mail app"
              onPress={openTheirs(grievanceMailto())}
              testID="about-grievances"
            />
          </SettingsGroup>
        </View>

        <View style={styles.full}>
          <SettingsGroup title="Map data">
            {MAP_DATA.map((c) => (
              <SettingsRow key={c.title} icon="map-pin" title={c.title} trail="external" onPress={openTheirs(c.url)} />
            ))}
          </SettingsGroup>
        </View>

        <Text style={[font('caption', bold), styles.credit]}>{FONT_CREDIT}</Text>
      </ScrollView>
      <View style={bar.barPin} pointerEvents="box-none">
        <TopBar title="About Blend’n" state={bar.state} onBack={() => router.back()} testID="about-top" />
      </View>
    </View>
  )
}

const CHIP_HEIGHT = 36

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLOR.ink },
  content: { flexGrow: 1, alignItems: 'center', gap: SPACE.xl, paddingHorizontal: SPACE.gutter },
  disc: {
    width: MARK_DISC,
    height: MARK_DISC,
    borderRadius: RADIUS.capsule,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockup: { alignItems: 'center', gap: SPACE.sm },
  name: { color: COLOR.textPrimary },
  chip: {
    height: CHIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.lg,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surface,
  },
  chipLabel: { color: COLOR.textSecondary },
  chipValue: { color: COLOR.textPrimary },
  full: { alignSelf: 'stretch' },
  // At the foot of a short page, after the content of a long one.
  credit: { marginTop: 'auto', color: COLOR.textTertiary, textAlign: 'center' },
})
