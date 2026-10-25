import { useEffect, useState, type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'

import { Avatar, type AvatarSize } from '../../components/ds/Avatar'
import { Banner, VisibilityBanner, type Visibility } from '../../components/ds/Banner'
import { Button, type ButtonKind, type ButtonSize } from '../../components/ds/Button'
import { IconButton } from '../../components/ds/IconButton'
import { Loader, Spinner } from '../../components/ds/Loader'
import { SettingsGroup, SettingsRow } from '../../components/ds/SettingsRow'
import { Sheet, type SheetProps } from '../../components/ds/Sheet'
import { StateScreen } from '../../components/ds/StateScreen'
import { Toast, type ToastKind } from '../../components/ds/Toast'
import { COLOR, CREATURE_PALETTES, RADIUS, SIZE, SPACE, TYPE, VENUE_PLATES } from '../../lib/design/tokens'

/**
 * Every P0 system component in every state it draws, on demand
 * (ROUND3 B4; guidelines/components/<Name>.html).
 *
 * Deep-link `exp+blendn:///preview/ds-p0`. Each cell has a testID
 * (`ds-<component>-<state>`) for a device driver to scroll to and screenshot;
 * sheets open from `ds-open-sheet-<name>` and a live toast from
 * `ds-show-toast-<kind>`.
 *
 * The platform and the accessibility settings are the device's, so drive it
 * twice (iOS, Android) and again with each setting on: Reduce Motion, Reduce
 * Transparency, Increase Contrast (iOS) / high-contrast text (Android), Bold
 * Text (iOS), and the largest text size. The components read them live.
 */
export default function DsP0Preview() {
  const insets = useSafeAreaInsets()
  const [sheet, setSheet] = useState<keyof typeof SHEETS | null>(null)
  const [toast, setToast] = useState<{ kind: ToastKind; key: number } | null>(null)
  // A busy sheet will not close (that is the state), so the gallery's lets go after a while.
  useEffect(() => {
    if (sheet !== 'busy') return
    const timer = setTimeout(() => setSheet(null), BUSY_SHEET_MS)
    return () => clearTimeout(timer)
  }, [sheet])

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + SPACE.xl, paddingBottom: insets.bottom + SPACE.xxl }]}>
        <Text style={styles.display}>P0 · system</Text>
        <Buttons />
        <IconButtons />
        <Loaders />
        <States />
        <Banners />
        <Settings />
        <Avatars />
        <Toasts onShow={(kind) => setToast({ kind, key: Date.now() })} />
        <Section title="Sheet">
          {(Object.keys(SHEETS) as (keyof typeof SHEETS)[]).map((name) => (
            <Button key={name} testID={`ds-open-sheet-${name}`} label={`Open: ${name}`} kind="secondary" size="md" onPress={() => setSheet(name)} />
          ))}
        </Section>
      </ScrollView>
      {(Object.keys(SHEETS) as (keyof typeof SHEETS)[]).map((name) => (
        <Sheet key={name} testID={`ds-sheet-${name}`} {...SHEETS[name](() => setSheet(null))} visible={sheet === name} onClose={() => setSheet(null)} />
      ))}
      {toast ? (
        <Toast
          key={toast.key}
          testID={`ds-toast-live-${toast.kind}`}
          kind={toast.kind}
          text={TOAST_TEXT[toast.kind]}
          action={toast.kind === 'info' ? { label: 'Undo', onPress: () => {} } : undefined}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </View>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {note ? <Text style={styles.note}>{note}</Text> : null}
      <View style={styles.cells}>{children}</View>
    </View>
  )
}

/** A labelled stage; `testID` is the cell's. */
function Cell({ label, testID, children, style }: { label: string; testID: string; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View testID={testID} style={styles.cell}>
      <Text style={styles.caption}>{label}</Text>
      <View style={[styles.stage, style]}>{children}</View>
    </View>
  )
}

const KINDS: ButtonKind[] = ['primary', 'lit', 'strong', 'secondary', 'tertiary', 'destructive']
const SIZES: ButtonSize[] = ['lg', 'md', 'sm']
/** A lit action is never 56 pt: that is the primary's. */
const sizesOf = (kind: ButtonKind) => (kind === 'lit' ? SIZES.filter((size) => size !== 'lg') : SIZES)
const LABEL: Record<ButtonKind, string> = {
  primary: 'I’m going',
  lit: 'Accept',
  strong: 'Open Settings',
  secondary: 'Not now',
  tertiary: 'Skip',
  destructive: 'Delete account',
}
const STATES = [
  ['default', {}],
  ['pressed', { previewState: 'pressed' }],
  ['focused', { previewState: 'focused' }],
  ['disabled', { disabled: true }],
  ['loading', { loading: true }],
  ['refused', { refused: true, pressHaptic: false }],
] as const

function Buttons() {
  return (
    <>
      <Section title="Button · kinds × sizes" note="56 the screen primary · 48 a dock secondary · 36 a row action">
        {KINDS.map((kind) => (
          <Cell key={kind} label={kind} testID={`ds-button-${kind}`}>
            {sizesOf(kind).map((size) => (
              <Button key={size} testID={`ds-button-${kind}-${size}`} kind={kind} size={size} icon={kind === 'lit' ? 'user-check' : undefined} label={LABEL[kind]} onPress={() => {}} />
            ))}
          </Cell>
        ))}
      </Section>
      {(['primary', 'lit', 'strong', 'secondary'] as const).map((kind) => (
        <Section key={kind} title={`Button · states · ${kind}`} note="refused plays H.error and shakes as it mounts">
          {STATES.map(([state, props]) => (
            <Cell key={state} label={state} testID={`ds-button-${kind}-state-${state}`}>
              <Button kind={kind} size={kind === 'lit' ? 'md' : undefined} label={LABEL[kind]} onGlass={kind === 'secondary'} onPress={() => {}} {...props} />
            </Cell>
          ))}
        </Section>
      ))}
      <Section title="Button · row actions">
        <Cell label="36 pt, wrapping at 360" testID="ds-button-row-actions" style={styles.row}>
          <Button kind="strong" size="sm" label="Accept" onPress={() => {}} />
          <Button kind="secondary" size="sm" label="Decline" onPress={() => {}} />
          <Button kind="strong" size="sm" label="Accept" loading onPress={() => {}} />
          <Button kind="secondary" size="sm" icon="user-plus" label="Add" onPress={() => {}} />
        </Cell>
      </Section>
    </>
  )
}

function IconButtons() {
  const trio = (props: object) => (
    <>
      <IconButton icon="chevron-left" accessibilityLabel="Back" onPress={() => {}} {...props} />
      <IconButton icon="share" accessibilityLabel="Share" onPress={() => {}} {...props} />
      <IconButton icon="ellipsis-vertical" accessibilityLabel="More" onPress={() => {}} {...props} />
    </>
  )
  return (
    <Section title="IconButton" note="Android draws 48 dp; glass never dims, the glyph does">
      {[
        ['default', {}],
        ['pressed', { previewState: 'pressed' }],
        ['focused', { previewState: 'focused' }],
        ['disabled', { disabled: true }],
      ].map(([state, props]) => (
        <Cell key={state as string} label={`control · ${state}`} testID={`ds-iconbutton-${state}`} style={styles.row}>
          {trio(props as object)}
        </Cell>
      ))}
      <Cell label="media · over a photo" testID="ds-iconbutton-media" style={[styles.row, styles.photo]}>
        {trio({ tier: 'media' })}
      </Cell>
      <Cell label="toggle · saved (selected) / not" testID="ds-iconbutton-toggle" style={styles.row}>
        <IconButton icon="bookmark" accessibilityLabel="Saved" selected onPress={() => {}} />
        <IconButton icon="bookmark" accessibilityLabel="Save" selected={false} onPress={() => {}} />
      </Cell>
    </Section>
  )
}

function Loaders() {
  return (
    <Section title="Loader" note="the morph stops at 5 s and names the wait; Try again at 10 s; Reduce Motion: static mark + Loading…">
      <Cell label="24 · 40 · 96" testID="ds-loader-sizes" style={styles.row}>
        <Loader size={24} />
        <Loader size={40} />
        <Loader size={96} waitLabel="Still loading the room…" onRetry={() => {}} />
      </Cell>
      <Cell label="ink, on white" testID="ds-loader-ink" style={styles.white}>
        <Loader size={40} ink />
      </Cell>
      <Cell label="spinner · 16 · 18 · 20 · dark" testID="ds-loader-spinners" style={styles.row}>
        <Spinner size={16} />
        <Spinner size={18} />
        <Spinner size={20} />
        <View style={styles.whiteDot}>
          <Spinner size={20} dark />
        </View>
      </Cell>
    </Section>
  )
}

function States() {
  return (
    <Section title="StateScreen" note="one pattern: 56 well inline, 80 on a whole screen">
      <Cell label="empty" testID="ds-state-empty">
        <StateScreen icon="users" title="Nobody else is here yet" body="People show up as they check in." />
      </Cell>
      <Cell label="empty with an action" testID="ds-state-empty-action">
        <StateScreen icon="calendar" title="Nothing saved yet" body="Events you save show up here." actions={[{ label: 'Find something tonight', onPress: () => {} }]} />
      </Cell>
      <Cell label="load error" testID="ds-state-error">
        <StateScreen icon="cloud-off" title="Couldn’t load the board" body="Check your connection and try again." actions={[{ label: 'Try again', kind: 'secondary', onPress: () => {} }]} />
      </Cell>
      <Cell label="busy" testID="ds-state-busy">
        <StateScreen icon="cloud-off" title="Couldn’t load the board" body="Check your connection and try again." busy actions={[{ label: 'Try again', onPress: () => {} }]} />
      </Cell>
      <Cell label="full screen · refusal" testID="ds-state-screen" style={styles.tall}>
        <SafeAreaInsetsContext.Provider value={NO_INSETS}>
          <StateScreen variant="screen" icon="circle-slash" title="Not open to you" body="This event is 21+." actions={[{ label: 'OK', kind: 'strong', onPress: () => {} }]} />
        </SafeAreaInsetsContext.Provider>
      </Cell>
    </Section>
  )
}

const VISIBILITY: Visibility[] = ['named', 'anon', 'hidden', 'blocked']

function Banners() {
  return (
    <Section title="Banner · VisibilityBanner">
      <Cell label="offline" testID="ds-banner-offline">
        <Banner kind="offline" text="Offline. Showing what loaded last." />
      </Cell>
      <Cell label="paused" testID="ds-banner-paused">
        <Banner kind="paused" text="Live updates paused. Pull to refresh." />
      </Cell>
      <Cell label="info" testID="ds-banner-info">
        <Banner kind="info" text="Your place in line: 4th." />
      </Cell>
      <Cell label="info with an action" testID="ds-banner-info-action">
        <Banner kind="info" text="Dating is on for this event." action={{ label: 'Change', onPress: () => {} }} />
      </Cell>
      {VISIBILITY.map((state) => (
        <Cell key={state} label={`visibility · ${state}`} testID={`ds-banner-visibility-${state}`}>
          <VisibilityBanner state={state} name={state === 'named' ? 'Sam' : 'Night Cat'} onAction={() => {}} />
        </Cell>
      ))}
      <Cell label="visibility · busy" testID="ds-banner-visibility-busy">
        <VisibilityBanner state="anon" name="Night Cat" busy onAction={() => {}} />
      </Cell>
    </Section>
  )
}

function Settings() {
  const [on, setOn] = useState(true)
  const card = (row: ReactNode) => <View style={styles.card}>{row}</View>
  const rows = [
    ['switch-on', { icon: 'bell', title: 'Push notifications', hint: 'Matches, messages and reminders', trail: 'switch', value: on, onValueChange: setOn }],
    ['switch-off', { icon: 'eye', title: 'Show online status', hint: 'People in a room can see you’re there', trail: 'switch', value: false, onValueChange: () => {} }],
    ['chevron', { icon: 'shield', title: 'Blocked users', hint: '3', trail: 'chevron', onPress: () => {} }],
    ['external', { icon: 'file-text', title: 'Privacy policy', trail: 'external', onPress: () => {} }],
    ['pressed', { icon: 'shield', title: 'Blocked users', hint: '3', trail: 'chevron', previewState: 'pressed', onPress: () => {} }],
    ['focused', { icon: 'shield', title: 'Blocked users', hint: '3', trail: 'chevron', previewState: 'focused', onPress: () => {} }],
    ['disabled', { icon: 'map-pin', title: 'Location', hint: 'Off in your phone’s Settings', trail: 'switch', value: false, disabled: true }],
    ['busy', { icon: 'bell', title: 'Push notifications', hint: 'Saving…', trail: 'switch', value: true, busy: true }],
    ['error', { icon: 'bell', title: 'Push notifications', hint: 'Couldn’t save. Try again.', trail: 'switch', value: false, error: true }],
    ['destructive', { icon: 'trash', title: 'Delete account', trail: 'chevron', destructive: true, onPress: () => {} }],
  ] as const
  return (
    <Section title="SettingsRow · grouped list">
      {rows.map(([state, props]) => (
        <Cell key={state} label={state} testID={`ds-settings-${state}`}>
          {card(<SettingsRow {...props} />)}
        </Cell>
      ))}
      <Cell label="a group" testID="ds-settings-group">
        <SettingsGroup title="Privacy">
          <SettingsRow icon="eye" title="Show online status" hint="People in a room can see you’re there" trail="switch" value={on} onValueChange={setOn} />
          <SettingsRow icon="users" title="Friends can see who I am in rooms" trail="switch" value={false} onValueChange={() => {}} />
          <SettingsRow icon="shield" title="Blocked users" hint="3" trail="chevron" onPress={() => {}} />
          <SettingsRow icon="download" title="Get a copy of your data" trail="chevron" onPress={() => {}} />
        </SettingsGroup>
      </Cell>
    </Section>
  )
}

const SIZES_AVATAR: AvatarSize[] = [24, 32, 40, 56, 72, 112]
const CREW_PLATE = [CREATURE_PALETTES[0][0], CREATURE_PALETTES[2][1]] as const
const PSEUDONYMS = ['Night Cat', 'Velvet Heron', 'Cosmic Panda', 'Quiet Fox', 'Neon Owl', 'Lucky Otter', 'Cosmic Comet', 'Velvet Lion']
const PHOTO = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=256'

function Avatars() {
  return (
    <Section title="Avatar" note="photo (earned) · creature · crew square; the ring is a cut-out in the colour behind">
      <Cell label="photo" testID="ds-avatar-photo" style={styles.rowEnd}>
        {SIZES_AVATAR.map((s) => <Avatar key={s} kind="photo" uri={PHOTO} size={s} />)}
      </Cell>
      <Cell label="creature" testID="ds-avatar-creature" style={styles.rowEnd}>
        {SIZES_AVATAR.map((s) => <Avatar key={s} kind="creature" pseudonym="Night Cat" size={s} />)}
      </Cell>
      <Cell label="crew square" testID="ds-avatar-crew" style={styles.rowEnd}>
        {SIZES_AVATAR.map((s) => <Avatar key={s} kind="crew" plate={CREW_PLATE} size={s} />)}
      </Cell>
      <Cell label="ring on ink · white ring" testID="ds-avatar-ring" style={styles.row}>
        <Avatar kind="photo" uri={PHOTO} size={32} ring={COLOR.ink} />
        <Avatar kind="creature" pseudonym="Night Cat" size={32} ring={COLOR.ink} />
        <Avatar kind="photo" uri={PHOTO} size={24} ring={COLOR.textPrimary} />
      </Cell>
      <Cell label="a stack of six at 32, −8" testID="ds-avatar-stack" style={styles.stack}>
        {PSEUDONYMS.slice(0, 6).map((name, i) => (
          <View key={name} style={i ? styles.overlap : null}>
            <Avatar kind="creature" pseudonym={name} size={32} ring={COLOR.ink} />
          </View>
        ))}
      </Cell>
      <Cell label="eight pseudonyms" testID="ds-avatar-pseudonyms" style={styles.row}>
        {PSEUDONYMS.map((name) => <Avatar key={name} kind="creature" pseudonym={name} size={40} />)}
      </Cell>
    </Section>
  )
}

const TOAST_TEXT: Record<ToastKind, string> = {
  success: 'Saved to Going',
  error: 'Couldn’t save. Try again.',
  info: 'Removed from Going',
}
const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 }

/** A toast in a stage, mounted again when it leaves so a screenshot always finds it. Silent: the live ones below play. */
function StagedToast({ kind, action, aboveTabBar }: { kind: ToastKind; action?: string; aboveTabBar?: boolean }) {
  const [round, setRound] = useState(0)
  return (
    <SafeAreaInsetsContext.Provider value={NO_INSETS}>
      <Toast
        key={round}
        kind={kind}
        silent
        text={TOAST_TEXT[kind]}
        action={action ? { label: action, onPress: () => {} } : undefined}
        aboveTabBar={aboveTabBar}
        onDismiss={() => setRound((n) => n + 1)}
      />
    </SafeAreaInsetsContext.Provider>
  )
}

function Toasts({ onShow }: { onShow: (kind: ToastKind) => void }) {
  return (
    <Section title="Toast / Snackbar" note="iOS: glass capsule at the top · Android: snackbar at the bottom">
      <Cell label="success" testID="ds-toast-success" style={styles.toastStage}>
        <StagedToast kind="success" />
      </Cell>
      <Cell label="success with Undo" testID="ds-toast-undo" style={styles.toastStage}>
        <StagedToast kind="success" action="Undo" />
      </Cell>
      <Cell label="error" testID="ds-toast-error" style={styles.toastStage}>
        <StagedToast kind="error" action="Retry" />
      </Cell>
      <Cell label="info" testID="ds-toast-info" style={styles.toastStage}>
        <StagedToast kind="info" />
      </Cell>
      <Cell label="Android · above the tab bar" testID="ds-toast-above-bar" style={styles.toastStageTall}>
        <StagedToast kind="info" action="Undo" aboveTabBar />
      </Cell>
      {(['success', 'error', 'info'] as const).map((kind) => (
        <Button key={kind} testID={`ds-show-toast-${kind}`} label={`Show a live ${kind} toast`} kind="secondary" size="md" onPress={() => onShow(kind)} />
      ))}
    </Section>
  )
}

const noop = () => {}
const BUSY_SHEET_MS = 4000
const SHEETS: Record<string, (close: () => void) => Omit<SheetProps, 'visible' | 'onClose'>> = {
  short: (close) => ({
    title: 'Share Vinyl Night',
    detents: ['short'],
    actions: [
      { label: 'WhatsApp', kind: 'strong', onPress: close },
      { label: 'Copy link', kind: 'secondary', onPress: close },
      { label: 'More…', kind: 'tertiary', onPress: close },
    ],
  }),
  medium: (close) => ({
    icon: 'log-out',
    title: 'Sign out?',
    body: 'You’ll need to sign in again to see your events, friends and messages.',
    detents: ['medium', 'tall'],
    actions: [
      { label: 'Cancel', kind: 'tertiary', onPress: close },
      { label: 'Sign out', kind: 'destructive', onPress: close },
    ],
  }),
  tall: (close) => ({
    icon: 'flag',
    title: 'Report this message',
    body: 'Tell us what’s wrong. A report goes to our team, and they are not told who sent it.',
    detents: ['tall', 'medium'],
    actions: [
      { label: 'Harassment', kind: 'secondary', onPress: noop },
      { label: 'Spam', kind: 'secondary', onPress: noop },
      { label: 'Something else', kind: 'secondary', onPress: noop },
      { label: 'Send report', kind: 'strong', onPress: close },
      { label: 'Cancel', kind: 'tertiary', onPress: close },
    ],
  }),
  refusal: (close) => ({
    icon: 'circle-slash',
    title: 'Not open to you',
    body: 'This event is 21+.',
    actions: [{ label: 'OK', kind: 'strong', onPress: close }],
  }),
  confirm: (close) => ({
    icon: 'trash',
    title: 'Delete your account for good?',
    body: 'This can’t be undone. You’d need a new account to use Blend’n again.',
    actions: [
      { label: 'Delete account', kind: 'destructive', onPress: close },
      { label: 'Keep my account', kind: 'tertiary', onPress: close },
    ],
  }),
  busy: () => ({
    icon: 'trash',
    title: 'Delete your account for good?',
    body: 'This can’t be undone. You’d need a new account to use Blend’n again.',
    actions: [
      { label: 'Delete account', kind: 'destructive', loading: true, onPress: noop },
      { label: 'Keep my account', kind: 'tertiary', onPress: noop },
    ],
  }),
  notifications: (close) => ({
    icon: 'bell-off',
    title: 'Notifications are off',
    body: 'Turn them on in your phone’s Settings to get them from Blend’n.',
    actions: [
      { label: 'Open Settings', kind: 'strong', onPress: close },
      { label: 'Not now', kind: 'tertiary', onPress: close },
    ],
  }),
}

/** The narrowest supported phone (360 dp), so a cell shows what wraps. */
const CELL_WIDTH = 360
const TOAST_STAGE = 120
const TOAST_STAGE_TALL = 200
const TALL_STAGE = 560

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLOR.ink },
  scroll: { paddingHorizontal: SPACE.gutter, gap: SPACE.xxl },
  display: { ...TYPE.display, color: COLOR.textPrimary },
  section: { gap: SPACE.md },
  heading: { ...TYPE.heading, color: COLOR.textPrimary },
  note: { ...TYPE.meta, color: COLOR.textSecondary },
  cells: { gap: SPACE.lg },
  cell: { gap: SPACE.sm, maxWidth: CELL_WIDTH },
  caption: { ...TYPE.label, color: COLOR.textTertiary },
  stage: {
    borderRadius: RADIUS.rowInCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: COLOR.hairline,
    padding: SPACE.lg,
    gap: SPACE.md,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: SPACE.md },
  rowEnd: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: SPACE.md },
  stack: { flexDirection: 'row' },
  overlap: { marginLeft: -SPACE.sm },
  photo: { backgroundColor: VENUE_PLATES.brewery[1] },
  white: { backgroundColor: COLOR.textPrimary, alignItems: 'center' },
  whiteDot: {
    width: SIZE.primary,
    height: SIZE.primary,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: { borderRadius: RADIUS.sheet, backgroundColor: COLOR.surface, overflow: 'hidden' },
  tall: { height: TALL_STAGE, padding: 0 },
  toastStage: { height: TOAST_STAGE, padding: 0 },
  toastStageTall: { height: TOAST_STAGE_TALL, padding: 0 },
})
