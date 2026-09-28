import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import * as Notifications from 'expo-notifications'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Alert, AppState, Linking, RefreshControl, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ActionTray from '../components/ActionTray'
import { AppHeader } from '../components/AppHeader'
import ScalePress from '../components/motion/ScalePress'
import { useToast } from '../components/Toast'
import { apiClient } from '../lib/apiClient'
import { BLENDN_LINKS } from '../lib/links'
import { initializePushNotifications, removePushTokenFromProfile } from '../lib/notifications'
import { clearPushDeclined } from '../lib/pushDecline'
import { Logger } from '../lib/logger'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, SWITCH_COLORS, TYPE } from '../lib/theme'
import { useAuth, signOut, deleteAccount } from '../lib/useAuth'

type PreferenceKey = 'pushEnabled' | 'showOnlineStatus' | 'shareReadReceipts' | 'locationSharing' | 'friendsSeeMe'

/** The visible row title per key, so a failure can name the setting it lost. */
const PREFERENCE_TITLES: Record<PreferenceKey, string> = {
  pushEnabled: 'Push notifications',
  showOnlineStatus: 'Show online status',
  shareReadReceipts: 'Read receipts',
  locationSharing: 'Share location for nearby events',
  friendsSeeMe: 'Friends can see who I am in rooms',
}

interface PreferencesState {
  pushEnabled: boolean
  showOnlineStatus: boolean
  shareReadReceipts: boolean
  locationSharing: boolean
  friendsSeeMe: boolean
}

const DEFAULT_PREFERENCES: PreferencesState = {
  pushEnabled: true,
  showOnlineStatus: true,
  shareReadReceipts: true,
  locationSharing: true,
  // Off, unlike the four above: in a room a friend is a pseudonym like anyone
  // else until you choose otherwise. The column defaults false for the same reason.
  friendsSeeMe: false,
}

const toBoolean = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback

/**
 * What the phone itself says about notifications, apart from what the account says.
 *
 * `blocked` is a no the app can no longer ask past: iOS after the first
 * refusal, Android once "Don't ask again" is set. Only the phone's Settings can
 * undo it, so the switch shows off whatever the account says, and turning it on
 * explains that instead of saving a preference nothing will ever deliver on.
 */
type OsPush = 'granted' | 'askable' | 'blocked'

async function readOsPush(): Promise<OsPush> {
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync()
    if (status === 'granted') return 'granted'
    return canAskAgain ? 'askable' : 'blocked'
  } catch {
    // Unknown reads as askable: the switch then behaves as it always did.
    return 'askable'
  }
}

export default function SettingsScreen() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [, setDisplayName] = useState<string>('')
  const [, setAvatarUrl] = useState<string | null>(null)
  const [preferences, setPreferences] = useState<PreferencesState>(DEFAULT_PREFERENCES)
  // What the screen currently shows, readable from an async callback. Two
  // toggles can be in flight at once, and a rollback that spread the snapshot
  // it was called with wrote the sibling's OLD value back into storage.
  const preferencesRef = useRef(preferences)
  useEffect(() => {
    preferencesRef.current = preferences
  }, [preferences])
  const [saving, setSaving] = useState<Record<PreferenceKey, boolean>>({
    pushEnabled: false,
    showOnlineStatus: false,
    shareReadReceipts: false,
    locationSharing: false,
    friendsSeeMe: false,
  })
  const [loadingPreferences, setLoadingPreferences] = useState(true)
  const [preferencesError, setPreferencesError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [osPush, setOsPush] = useState<OsPush>('askable')
  const [pushBlockedOpen, setPushBlockedOpen] = useState(false)

  /*
   * Read now and on every return to the app: the fix for `blocked` is a trip
   * to the phone's Settings, and coming back should show that it worked.
   */
  useEffect(() => {
    void readOsPush().then(setOsPush)
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void readOsPush().then(setOsPush)
    })
    return () => sub.remove()
  }, [])

  const settingsStorageKey = useMemo(() => (
    user?.id ? `settings_preferences_${user.id}` : null
  ), [user?.id])

  const savePreferencesLocal = useCallback(async (next: PreferencesState) => {
    if (!settingsStorageKey) return
    try {
      await AsyncStorage.setItem(settingsStorageKey, JSON.stringify(next))
    } catch {}
  }, [settingsStorageKey])

  /*
   * Read the four keys the server actually returns.
   *
   * This used to try twelve spellings -- nested under `preferences`, camelCase,
   * snake_case -- and match none of them, because the server returns exactly
   * four, flat, under `profile`:
   *
   *   push_enabled   show_online   read_receipts   share_location
   *
   * Every lookup missed, every toggle fell back to its default of `true`, and
   * so every switch read ON regardless of what the user had chosen. A switch
   * that lies is worse than no switch.
   *
   * The names are asymmetric on purpose and worth reading twice: the UI calls
   * it `showOnlineStatus` and the column is `show_online`; the UI says
   * `shareReadReceipts` and the column is `read_receipts`; the UI says
   * `locationSharing` and the column is `share_location`. Guessing the
   * translation is what produced the twelve-key shotgun. Confirm against
   * /api-docs, which is generated from the route.
   */
  const hydratePreferencesFromProfile = useCallback((resultData: any) => {
    const profile = resultData?.profile || resultData || {}

    const nextPrefs: PreferencesState = {
      pushEnabled: toBoolean(profile.push_enabled, DEFAULT_PREFERENCES.pushEnabled),
      showOnlineStatus: toBoolean(profile.show_online, DEFAULT_PREFERENCES.showOnlineStatus),
      shareReadReceipts: toBoolean(profile.read_receipts, DEFAULT_PREFERENCES.shareReadReceipts),
      locationSharing: toBoolean(profile.share_location, DEFAULT_PREFERENCES.locationSharing),
      friendsSeeMe: toBoolean(profile.friends_see_me_in_rooms, DEFAULT_PREFERENCES.friendsSeeMe),
    }

    return { profile, nextPrefs }
  }, [])

  const loadPreferences = useCallback(async () => {
    if (!user) return
    try {
      if (settingsStorageKey) {
        try {
          const cached = await AsyncStorage.getItem(settingsStorageKey)
          if (cached) {
            const parsed = JSON.parse(cached) as Partial<PreferencesState>
            setPreferences({
              pushEnabled: toBoolean(parsed.pushEnabled, DEFAULT_PREFERENCES.pushEnabled),
              showOnlineStatus: toBoolean(parsed.showOnlineStatus, DEFAULT_PREFERENCES.showOnlineStatus),
              shareReadReceipts: toBoolean(parsed.shareReadReceipts, DEFAULT_PREFERENCES.shareReadReceipts),
              locationSharing: toBoolean(parsed.locationSharing, DEFAULT_PREFERENCES.locationSharing),
              friendsSeeMe: toBoolean(parsed.friendsSeeMe, DEFAULT_PREFERENCES.friendsSeeMe),
            })
          }
        } catch {}
      }

      const result = await apiClient.getProfile(user.id)
      if (!result.success || !result.data) {
        /*
         * Say so, rather than leave four switches reading ON. With nothing
         * cached the defaults are all `true` and looked exactly like a
         * server-confirmed answer — the same lie the naming bug below used
         * to tell, arriving through a network failure instead.
         */
        Logger.warn('profile', 'Could not load preferences', { error: result.error })
        setPreferencesError("Your settings didn't load. Pull down or try again.")
      }
      if (result.success && result.data) {
        setPreferencesError(null)
        const { profile, nextPrefs } = hydratePreferencesFromProfile(result.data)
        const name = profile.name || user.name || 'You'
        setDisplayName(name)
        // Get avatar from profile photos if available
        const photos = profile.photos || profile.profile_photos || []
        const primary = Array.isArray(photos) && photos[0] ? photos[0] : null
        if (primary) {
          setAvatarUrl(primary)
        } else if (user.image) {
          setAvatarUrl(user.image)
        }
        setPreferences(nextPrefs)
        savePreferencesLocal(nextPrefs)
      }
    } catch (error) {
      Logger.warn('profile', 'Could not load preferences', { error })
      setPreferencesError("Your settings didn't load. Pull down or try again.")
    } finally {
      setLoadingPreferences(false)
    }
  }, [user, settingsStorageKey, savePreferencesLocal, hydratePreferencesFromProfile])

  useEffect(() => {
    // Every setState in loadPreferences comes after its first await; the rule
    // can't see through the async function. It is shared with pull-to-refresh
    // and Try again, which is why it isn't declared inside this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPreferences()
  }, [loadPreferences])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([loadPreferences(), readOsPush().then(setOsPush)])
    setRefreshing(false)
  }, [loadPreferences])

  const persistPreference = useCallback(async (next: PreferencesState, previous: PreferencesState, key: PreferenceKey) => {
    if (!user) return
    setSaving(prev => ({ ...prev, [key]: true }))

    try {
      // The four keys the route validates, top level, snake_case. There is no
      // `preferences` wrapper and no camelCase alias -- the previous twelve
      // variants matched none of them, so nothing was ever persisted.
      const payload = {
        push_enabled: next.pushEnabled,
        show_online: next.showOnlineStatus,
        read_receipts: next.shareReadReceipts,
        share_location: next.locationSharing,
        friends_see_me_in_rooms: next.friendsSeeMe,
      }

      const result = await apiClient.updateProfile(user.id, payload)
      if (!result.success) {
        throw new Error(result.error || 'Failed to save setting')
      }

      if (key === 'pushEnabled') {
        if (next.pushEnabled) {
          // Turning it on is the answer onboarding's "Maybe later" deferred. It may
          // ask the phone for the first time; read its answer back either way.
          void clearPushDeclined(user.id)
            .then(() => initializePushNotifications())
            .catch(() => {})
            .finally(() => void readOsPush().then(setOsPush))
        } else {
          removePushTokenFromProfile().catch(() => {})
        }
      }

      await savePreferencesLocal(next)
    } catch {
      // Roll back THIS key only, from what is on screen NOW. Restoring the
      // whole snapshot undid a sibling toggle that had already been saved
      // while this one was in flight.
      const rolled = { ...preferencesRef.current, [key]: previous[key] }
      preferencesRef.current = rolled
      setPreferences(rolled)
      await savePreferencesLocal(rolled)
      Alert.alert('Update failed', `Could not save “${PREFERENCE_TITLES[key]}”. Please try again.`)
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }))
    }
  }, [user, savePreferencesLocal])

  const onTogglePreference = useCallback((key: PreferenceKey) => {
    // Turning push on after the phone has said no: explain, and change nothing.
    if (key === 'pushEnabled' && osPush === 'blocked') {
      setPushBlockedOpen(true)
      return
    }
    const previous = preferencesRef.current
    const next = { ...previous, [key]: !previous[key] }
    preferencesRef.current = next
    setPreferences(next)
    savePreferencesLocal(next)
    persistPreference(next, previous, key)
  }, [persistPreference, savePreferencesLocal, osPush])

  const openExternal = useCallback(async (url: string) => {
    try {
      const supported = await Linking.canOpenURL(url)
      if (!supported) {
        Alert.alert('Link unavailable', 'Unable to open this link.')
        return
      }
      await Linking.openURL(url)
    } catch {
      Alert.alert('Link unavailable', 'Unable to open this link.')
    }
  }, [])

  const handleDeleteAccount = useCallback(() => {
    Alert.alert(
      'Delete Account',
      // What the deletion route actually does (app/api/mobile/account in the
      // API): the profile goes, messages stay under a deleted account, and
      // registration details are held 180 days (IT Rules 2021, r.3(1)(h)).
      'Your profile, photos, friends and sign-in are deleted now. Messages you sent stay in their conversations under a deleted account, and we keep your registration details for 180 days, as Indian law requires. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: "What's kept",
          onPress: () => {
            Linking.openURL(BLENDN_LINKS.deleteAccount).catch(() => {})
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'Your account will be permanently deleted and cannot be recovered.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete My Account',
                  style: 'destructive',
                  onPress: async () => {
                    setDeletingAccount(true)
                    try {
                      const result = await deleteAccount()
                      if (!result.success) {
                        Alert.alert('Error', result.error || 'Failed to delete account')
                      } else {
                        /*
                         * The session is already gone and the guard is on its
                         * way to sign-in. The toast sits above the navigator,
                         * so it lands there too: without it the account
                         * vanished with no word that deleting it had worked.
                         */
                        showToast('Your account has been deleted.', 'success')
                      }
                    } catch {
                      Alert.alert('Error', 'Failed to delete account')
                    } finally {
                      setDeletingAccount(false)
                    }
                  },
                },
              ]
            )
          },
        },
      ]
    )
  }, [showToast])

  const confirmSignOut = useCallback(async () => {
    setSigningOut(true)
    try {
      const result = await signOut()
      // Local state is gone either way; this is the honest version of what
      // the server did, which used to be reported as success regardless.
      if (!result.success) {
        Alert.alert(
          'Signed out on this phone',
          'We could not reach the server, so this session may stay active elsewhere until it lapses.'
        )
      }
    } catch {
      Alert.alert('Error', 'Failed to sign out')
    } finally {
      setSigningOut(false)
      setSignOutOpen(false)
    }
  }, [])

  /*
   * Five sections, each named after what is actually in it.
   *
   * What this replaced: an "Account" section holding Blocked users, Sign out
   * and Delete account -- no account settings at all -- with the two
   * destructive rows adjacent, both red, at the top of the screen where the
   * thumb lands. Blocked users sat there while "Safety" held two web links.
   * "Discovery" mixed a navigation row with three toggles, "Notifications" was
   * a header over one switch, and Terms and Privacy were filed under Support.
   *
   * "You and matching" is gone from here entirely: those five fields are part
   * of `edit-profile` now, because they are profile data and this was the app's
   * second profile editor.
   */
  const items = useMemo(() => ([
    { header: 'Privacy' },
    // What it does, in the row: the switch was a promise for a year (SCRUM-141).
    {
      icon: 'eye-outline',
      title: 'Show online status',
      hint: "Off: you're counted at events but not listed to other people there.",
      keyName: 'showOnlineStatus' as const,
    },
    { icon: 'checkmark-done-outline', title: 'Read receipts', keyName: 'shareReadReceipts' as const },
    { icon: 'navigate-outline', title: 'Share location for nearby events', keyName: 'locationSharing' as const },
    {
      icon: 'people-outline',
      title: 'Friends can see who I am in rooms',
      hint: 'Off: at an event, your friends see your pseudonym like everyone else.',
      keyName: 'friendsSeeMe' as const,
    },

    { header: 'Notifications' },
    { icon: 'notifications-outline', title: 'Push notifications', keyName: 'pushEnabled' as const },

    /*
     * Blocked users leads Safety. Blocking somebody is the most consequential
     * safety action in the product and it used to be filed under "Account",
     * further from Safety than two links to a web page.
     */
    { header: 'Safety' },
    { icon: 'ban-outline', title: 'Blocked users', onPress: () => router.push('/blocked-users') },
    { icon: 'shield-checkmark-outline', title: 'Safety tips', onPress: () => openExternal(BLENDN_LINKS.safety) },
    { icon: 'flag-outline', title: 'Community guidelines', onPress: () => openExternal(BLENDN_LINKS.guidelines) },

    { header: 'Help' },
    { icon: 'help-circle-outline', title: 'Help centre', onPress: () => openExternal(BLENDN_LINKS.help) },
    { icon: 'mail-outline', title: 'Contact support', onPress: () => router.push('/support') },

    { header: 'About' },
    { icon: 'information-circle-outline', title: "About Blend'n", onPress: () => router.push('/about') },
    { icon: 'document-text-outline', title: 'Terms of Service', onPress: () => openExternal(BLENDN_LINKS.terms) },
    { icon: 'lock-closed-outline', title: 'Privacy Policy', onPress: () => openExternal(BLENDN_LINKS.privacy) },

    // Asks first: one stray tap used to end the session on the spot.
    { header: 'Account' },
    { icon: 'log-out-outline', title: 'Sign out', onPress: () => setSignOutOpen(true) },

    /*
     * Alone, at the bottom, under its own header and a gap.
     *
     * It used to sit one row under Sign out, both styled `danger`, both in the
     * first section. One is routine and reversible and the other destroys the
     * account -- identical in colour, a thumb's width apart, at the top of the
     * screen. Sign out is no longer red either: reserving that colour for the
     * single irreversible row is what makes it mean anything.
     */
    { header: 'Danger zone', spaced: true },
    { icon: 'trash-outline', title: deletingAccount ? 'Deleting account...' : 'Delete account', danger: true, disabled: deletingAccount, onPress: handleDeleteAccount },
  ]), [openExternal, deletingAccount, handleDeleteAccount])

  const renderItem = (item: any, idx: number) => {
    if (item.header) {
      return (
        <Text
          key={`h-${idx}`}
          style={[styles.sectionHeader, item.spaced && styles.sectionHeaderSpaced]}
        >
          {item.header.toUpperCase()}
        </Text>
      )
    }
    if (item.keyName) {
      const keyName = item.keyName as PreferenceKey
      // Push is on only when the account AND the phone say so.
      const pushBlocked = keyName === 'pushEnabled' && osPush === 'blocked'
      const hint = pushBlocked ? "Off in your phone's settings." : item.hint
      return (
        <View key={idx} style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name={item.icon} size={ICON.md} color={EMBER.textPrimary} />
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
            </View>
          </View>
          <View style={styles.switchWrap}>
            {saving[keyName] && (
              <ActivityIndicator size="small" color={EMBER.textSecondary} style={styles.switchLoader} />
            )}
            <Switch
              value={preferences[keyName] && !pushBlocked}
              onValueChange={() => onTogglePreference(keyName)}
              accessibilityLabel={item.title}
              disabled={saving[keyName] || loadingPreferences}
              {...SWITCH_COLORS}
            />
          </View>
        </View>
      )
    }
    // Shrinks rather than dims, like the Me tab's rows: 0.98 for a full-width
    // row, no haptic -- settings are tapped often and navigate, they don't commit.
    return (
      <ScalePress
        key={idx}
        haptic={false}
        pressedScale={0.98}
        style={styles.row}
        onPress={item.onPress}
        disabled={item.disabled}
        accessibilityRole="button"
        accessibilityLabel={item.title}
        accessibilityState={item.disabled ? { disabled: true, busy: true } : undefined}
      >
        <View style={styles.rowLeft}>
          <Ionicons name={item.icon} size={ICON.md} color={item.danger ? EMBER.destructive : EMBER.textPrimary} />
          <Text style={[styles.rowTitle, item.danger && { color: EMBER.destructive }]}>{item.title}</Text>
        </View>
        <Ionicons name="chevron-forward" size={ICON.sm} color={EMBER.textSecondary} />
      </ScalePress>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title="Settings" onBack={() => router.back()} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={EMBER.textSecondary} />}
      >
        {/*
          There was a profile card here, and it was the third door to editing.
          Worse than a duplicate: a `TouchableOpacity` whose outer press went to
          `/(tabs)/profile` -- the screen you had just come from -- wrapping a
          nested one that went to `/edit-profile`. Two overlapping targets, one
          of them a round trip.

          The Me tab carries the identity card and both doors now. Settings is
          settings.
        */}
        <View style={styles.card}>
          {preferencesError ? (
            <View style={styles.prefsErrorWrap}>
              <Text style={styles.prefsError} accessibilityRole="alert" accessibilityLiveRegion="polite">
                {preferencesError}
              </Text>
              <ScalePress
                onPress={() => void onRefresh()}
                disabled={refreshing}
                haptic={false}
                accessibilityRole="button"
                accessibilityLabel="Try again"
                style={styles.retry}
              >
                <Text style={styles.retryLabel}>Try again</Text>
              </ScalePress>
            </View>
          ) : null}
          {items.map((it, i) => (
            <React.Fragment key={`it-${i}`}>
              {renderItem(it, i)}
              {i < items.length - 1 && !items[i + 1].header && !it.header ? <View style={styles.divider} /> : null}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>

      <ActionTray
        visible={signOutOpen}
        title="Sign out?"
        message="You'll need to sign in again to see your events, friends and messages."
        onClose={() => setSignOutOpen(false)}
        buttons={[
          { label: 'Cancel', onPress: () => setSignOutOpen(false), disabled: signingOut },
          { label: 'Sign out', variant: 'primary', onPress: () => void confirmSignOut(), loading: signingOut },
        ]}
      />

      <ActionTray
        visible={pushBlockedOpen}
        title="Notifications are off"
        message="Your phone is blocking notifications from Blend'n. Turn them on in Settings, then come back."
        onClose={() => setPushBlockedOpen(false)}
        buttons={[
          { label: 'Not now', onPress: () => setPushBlockedOpen(false) },
          {
            label: 'Open Settings',
            variant: 'primary',
            onPress: () => {
              setPushBlockedOpen(false)
              Linking.openSettings().catch(() => {})
            },
          },
        ]}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  prefsErrorWrap: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.lg, gap: SPACE.sm, alignItems: 'flex-start' },
  prefsError: { ...TYPE.meta, color: EMBER.destructive },
  retry: {
    height: CONTROL.sm,
    paddingHorizontal: SPACE.md,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surface,
    justifyContent: 'center',
  },
  retryLabel: { ...TYPE.bodyStrong },
  container: { flex: 1, backgroundColor: 'transparent' },
  
  content: { paddingHorizontal: GUTTER, paddingVertical: SPACE.lg },
  // One step up from the page. (Was a 6% white overlay: on the flat EMBER.bg it renders as this.)
  card: { backgroundColor: EMBER.surfaceSunken, borderRadius: EMBER_RADIUS.md, borderWidth: 1, borderColor: EMBER.separator },
  sectionHeader: { ...TYPE.label, marginTop: SPACE.lg, marginBottom: SPACE.sm, paddingHorizontal: SPACE.lg },
  /*
   * The gap that separates Delete account from everything above it. 40 rather
   * than the usual 16, because the whole point is that the thumb has to travel
   * to reach it -- it used to sit one row under Sign out.
   */
  sectionHeaderSpaced: { marginTop: SPACE.xxxl },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.lg, paddingVertical: SPACE.lg },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, flex: 1, paddingRight: SPACE.md },
  switchWrap: { flexDirection: 'row', alignItems: 'center' },
  switchLoader: { marginRight: SPACE.sm },
  rowTitle: { ...TYPE.bodyStrong },
  rowText: { flexShrink: 1, gap: SPACE.xxs },
  rowHint: { ...TYPE.meta },
  divider: { height: 1, backgroundColor: EMBER.separator, marginLeft: SPACE.lg + ICON.md + SPACE.md },
})
