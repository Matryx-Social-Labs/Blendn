import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button } from '../components/ds/Button'
import { SettingsGroup, SettingsRow } from '../components/ds/SettingsRow'
import { font, HueProvider, useBoldText } from '../components/ds/shared'
import { TopBar } from '../components/ds/TopBar'
import { useToast } from '../components/Toast'
import { COLOR, SPACE as DS_SPACE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import type { IconName } from '../components/ui/Icon'
import { showSheet, type Sheet } from '../lib/sheet'
import { useTopBarState } from '../lib/useTopBarState'
import { offersApi } from '../lib/offers'
import { apiClient } from '../lib/apiClient'
import { BLENDN_LINKS, openInApp } from '../lib/links'
import { initializePushNotifications, removePushTokenFromProfile } from '../lib/notifications'
import { clearPushDeclined } from '../lib/pushDecline'
import { useLatest } from '../lib/useLatest'
import { Logger } from '../lib/logger'
import { EMBER, GUTTER } from '../lib/theme'
import { useAuth, signOut, deleteAccount } from '../lib/useAuth'
import { openPaywall } from '../lib/paywall'
import { usePlusStatus, type PlusStatus } from '../lib/plus'
import { manageSubscriptionUrl } from '../lib/purchases'

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

function SettingsScreenContent() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [preferences, setPreferences] = useState<PreferencesState>(DEFAULT_PREFERENCES)
  // What the screen currently shows, readable from an async callback. Two
  // toggles can be in flight at once, and a rollback that spread the snapshot
  // it was called with wrote the sibling's OLD value back into storage.
  const preferencesRef = useLatest(preferences)
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
  /** The delete sheet's first step is on screen: a late store-subscription answer may still redraw it, and only then. */
  const deleteExplainOpen = useRef(false)
  /** Blendn+ as the server says it: the row's words, and the delete tray's warning. */
  const { status: plus, refresh: refreshPlus } = usePlusStatus()
  useFocusEffect(refreshPlus)
  const [osPush, setOsPush] = useState<OsPush>('askable')
  const bar = useTopBarState()
  const bold = useBoldText()

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

    return nextPrefs
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
        const nextPrefs = hydratePreferencesFromProfile(result.data)
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
      // The switch has already flipped back; this says why.
      showToast(`Couldn't save “${PREFERENCE_TITLES[key]}”. Try again.`, 'error', { haptic: 'error' })
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }))
    }
  }, [user, savePreferencesLocal, showToast, preferencesRef])

  const onTogglePreference = useCallback((key: PreferenceKey) => {
    // Turning push on after the phone has said no: explain, and change nothing.
    if (key === 'pushEnabled' && osPush === 'blocked') {
      showSheet(PUSH_BLOCKED_SHEET)
      return
    }
    const previous = preferencesRef.current
    const next = { ...previous, [key]: !previous[key] }
    preferencesRef.current = next
    setPreferences(next)
    savePreferencesLocal(next)
    persistPreference(next, previous, key)
  }, [persistPreference, savePreferencesLocal, osPush, preferencesRef])

  /*
   * Our own pages open in the in-app browser; a store's page (Manage
   * subscription) is not ours and opens in the store, through `openURL` alone
   * with no `canOpenURL` first (on iOS that answers false for any scheme not
   * declared in `LSApplicationQueriesSchemes`). A failure is a toast, the same
   * sentence About uses.
   */
  const openPage = useCallback(
    (url: string) => {
      openInApp(url).catch(() => showToast("That page didn't open. Try again.", 'error'))
    },
    [showToast]
  )
  const openStore = useCallback(
    (url: string) => {
      Linking.openURL(url).catch(() => showToast("That page didn't open. Try again.", 'error'))
    },
    [showToast]
  )

  /** Deleting is two steps in one sheet: what it does, then "for good?". The confirm's own haptic is H.destructive (SheetHost). */
  const confirmDeleteSheet = useCallback((): Sheet => ({
    kind: 'actions',
    icon: 'trash',
    title: 'Delete your account for good?',
    message: "This can't be undone. You'd need a new account to use Blend'n again.",
    actions: [
      {
        label: 'Delete my account',
        variant: 'destructive',
        // On failure the sheet stays, says why, and the button becomes Try again.
        run: async () => {
          try {
            const result = await deleteAccount()
            if (!result.success) return { ok: false, error: result.error || "Your account wasn't deleted. Try again." }
            /*
             * The session is already gone and the guard is on its way to sign-in.
             * The toast sits above the navigator, so it lands there too: without it
             * the account vanished with no word that deleting it had worked.
             */
            return { ok: true, toast: 'Your account has been deleted.' }
          } catch {
            return { ok: false, error: "Your account wasn't deleted. Check your connection and try again." }
          }
        },
      },
      { label: 'Cancel', cancel: true },
    ],
  }), [])

  const explainDeleteSheet = useCallback(
    (storePlus: PlusStatus['source'] | null): Sheet => {
      const store = storePlus === 'apple' ? 'App Store' : 'Google Play'
      return {
        kind: 'actions',
        icon: 'trash',
        title: 'Delete your account?',
        message:
          'Your profile, photos, friends and sign-in are deleted now. Messages you sent stay in their conversations under a deleted account, and we keep your registration details for 180 days, as Indian law requires.',
        // A running store subscription keeps billing after the account is gone: say so first (review H1).
        content: storePlus ? (
          <Text accessibilityLiveRegion="polite" style={[font('bodyStrong', bold), { color: COLOR.textPrimary }]}>
            {`Cancel Blendn+ in your ${store} subscriptions first. Deleting your account doesn't cancel it.`}
          </Text>
        ) : undefined,
        onDismiss: () => {
          deleteExplainOpen.current = false
        },
        actions: [
          {
            label: 'Delete account',
            variant: 'destructive',
            next: () => {
              deleteExplainOpen.current = false
              return confirmDeleteSheet()
            },
          },
          ...(storePlus
            ? [
                {
                  label: 'Manage subscription',
                  variant: 'secondary' as const,
                  then: () => {
                    deleteExplainOpen.current = false
                    void manageSubscriptionUrl().then(openStore)
                  },
                },
              ]
            : []),
          {
            label: "What's kept",
            variant: 'secondary',
            then: () => {
              deleteExplainOpen.current = false
              openPage(BLENDN_LINKS.deleteAccount)
            },
          },
          { label: 'Cancel', cancel: true },
        ],
      }
    },
    [bold, confirmDeleteSheet, openPage, openStore]
  )

  const handleDeleteAccount = useCallback(() => {
    deleteExplainOpen.current = true
    showSheet(explainDeleteSheet(null))
    apiClient
      .getMyPlus()
      .then((res) => {
        const source = res.success ? res.data?.source : null
        // Only while the first step is still the sheet: a late answer must not pull someone back from "for good?".
        if (deleteExplainOpen.current && res.success && res.data?.active && (source === 'apple' || source === 'google')) {
          showSheet(explainDeleteSheet(source))
        }
      })
      .catch(() => {})
  }, [explainDeleteSheet])

  /** Asks first: one stray tap used to end the session on the spot. */
  const askSignOut = useCallback(
    () =>
      showSheet({
        kind: 'actions',
        icon: 'log-out',
        title: 'Sign out?',
        message: "You'll need to sign in again to see your events, friends and messages.",
        actions: [
          {
            // The design's affirmative is the plain button; the confirm still plays the destructive tick, as Remove friend and Delete do.
            label: 'Sign out',
            variant: 'primary',
            run: async () => {
              H.destructive()
              try {
                const result = await signOut()
                // Local state is gone either way; this is the honest version of what
                // the server did, which used to be reported as success regardless. A
                // toast, because it lands on the sign-in screen the guard moves to.
                if (!result.success) {
                  showToast(
                    "Signed out on this phone. We couldn't reach the server, so you may stay signed in elsewhere for a while.",
                    'info'
                  )
                }
                return { ok: true }
              } catch {
                return { ok: false, error: "Couldn't sign out. Try again." }
              }
            },
          },
          { label: 'Cancel', cancel: true },
        ],
      }),
    [showToast]
  )

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
  const preferenceRow = (key: PreferenceKey, icon: IconName, title: string, hint?: string) => {
    // Push is on only when the account AND the phone say so.
    const pushBlocked = key === 'pushEnabled' && osPush === 'blocked'
    return (
      <SettingsRow
        key={key}
        icon={icon}
        title={title}
        hint={pushBlocked ? "Off in your phone's settings." : hint}
        trail="switch"
        value={preferences[key] && !pushBlocked}
        onValueChange={() => onTogglePreference(key)}
        busy={saving[key]}
        disabled={loadingPreferences}
        testID={`settings-${key}`}
      />
    )
  }

  // The paywall, asked for: no cooldown (step 11, trigger `profile`). Free during launch where you go out: a row that says so and sells nothing (review H2).
  const plusIsFree = plus && !plus.gated && !plus.active

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <TopBar title="Settings" state={bar.state} onBack={() => router.back()} testID="settings-top" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={EMBER.textSecondary} />}
        {...bar.scrollProps}
      >
        {/*
          There was a profile card here, and it was the third door to editing.
          The Me tab carries the identity card and both doors now. Settings is
          settings. Six groups, each under its own label, so Privacy, Safety and
          Account do not read as one block; Delete account is alone at the bottom.
        */}
        {preferencesError ? (
          <View style={styles.prefsErrorWrap}>
            <Text style={[font('meta', bold), styles.prefsError]} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {preferencesError}
            </Text>
            <Button kind="secondary" size="sm" label="Try again" onPress={() => void onRefresh()} disabled={refreshing} />
          </View>
        ) : null}

        <SettingsGroup title="Privacy">
          {/* What it does, in the row: the switch was a promise for a year (SCRUM-141). */}
          {preferenceRow('showOnlineStatus', 'eye', 'Show online status', "Off: you're counted at events but not listed to other people there.")}
          {preferenceRow('shareReadReceipts', 'check-check', 'Read receipts')}
          {preferenceRow('locationSharing', 'navigation', 'Share location for nearby events')}
          {preferenceRow('friendsSeeMe', 'users', 'Friends can see who I am in rooms', 'Off: at an event, your friends see your pseudonym like everyone else.')}
        </SettingsGroup>

        <SettingsGroup title="Notifications">
          {preferenceRow('pushEnabled', 'bell', 'Push notifications')}
          {/* Offers from the places you keep going back to (step 12): its own switch, kept on the server. */}
          <OffersFromPlacesRow />
        </SettingsGroup>

        {/* Blocked users leads Safety: blocking is the most consequential safety action in the product. */}
        <SettingsGroup title="Safety">
          <SettingsRow icon="ban" title="Blocked users" trail="chevron" onPress={() => router.push('/blocked-users')} />
          <SettingsRow icon="shield-check" title="Safety tips" trail="external" onPress={() => openPage(BLENDN_LINKS.safety)} />
          <SettingsRow icon="flag" title="Community guidelines" trail="external" onPress={() => openPage(BLENDN_LINKS.guidelines)} />
        </SettingsGroup>

        <SettingsGroup title="Help">
          <SettingsRow icon="circle-question-mark" title="Help centre" trail="external" onPress={() => openPage(BLENDN_LINKS.help)} />
          <SettingsRow icon="mail" title="Contact support" trail="chevron" onPress={() => router.push('/support')} />
        </SettingsGroup>

        {/* Terms and Privacy are on About, beside the version: two doors to each page, one screen apart. */}
        <SettingsGroup title="About">
          <SettingsRow icon="info" title="About Blend'n" trail="chevron" onPress={() => router.push('/about')} />
        </SettingsGroup>

        <SettingsGroup title="Account">
          {plusIsFree ? (
            <SettingsRow icon="sparkles" title="Blendn+ · free during launch in your city" trail="chevron" onPress={() => showSheet(PLUS_FREE_SHEET)} />
          ) : (
            <SettingsRow icon="sparkles" title="Blendn+" trail="chevron" onPress={() => void openPaywall('profile', { userInitiated: true })} />
          )}
          <SettingsRow icon="log-out" title="Sign out" trail="chevron" onPress={askSignOut} />
        </SettingsGroup>

        {/*
          Alone, at the bottom, under its own label. Sign out is routine and
          reversible and Delete destroys the account: reserving the red for the
          one irreversible row is what makes it mean anything.
        */}
        <SettingsGroup title="Danger zone">
          <SettingsRow icon="trash" title="Delete account" trail="chevron" destructive onPress={handleDeleteAccount} />
        </SettingsGroup>
      </ScrollView>
    </SafeAreaView>
  )
}

const PUSH_BLOCKED_SHEET: Sheet = {
  kind: 'actions',
  icon: 'bell-off',
  title: 'Notifications are off',
  message: "Your phone is blocking notifications from Blend'n. Turn them on in Settings, then come back.",
  actions: [
    { label: 'Open Settings', variant: 'primary', then: () => void Linking.openSettings().catch(() => {}) },
    { label: 'Not now', cancel: true },
  ],
}

const PLUS_FREE_SHEET: Sheet = {
  kind: 'actions',
  icon: 'sparkles',
  title: 'Blendn+ is free here for now',
  message: "During launch in your city, staying live while you're here and your full night history are everyone's. There's nothing to buy.",
  actions: [{ label: 'Got it', variant: 'primary', then: () => {} }],
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: GUTTER, paddingVertical: DS_SPACE.lg, gap: DS_SPACE.xl },
  prefsErrorWrap: { gap: DS_SPACE.sm, alignItems: 'flex-start' },
  prefsError: { color: COLOR.destructive },
})

/**
 * "Offers from places" (step 12 review M6): one switch for every place's
 * offers. The server keeps it (`/me/offers`) and leaves you out of every
 * audience while it is off; the switch shows what the server saved.
 */
function OffersFromPlacesRow() {
  const { showToast } = useToast()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    Promise.resolve()
      .then(() => offersApi.offersFromPlaces())
      .then((res) => {
        if (res.success && res.data) setEnabled(res.data.enabled)
      })
      .catch(() => {})
  }, [])
  const flip = async () => {
    if (enabled === null || saving) return
    setSaving(true)
    try {
      const res = await offersApi.setOffersFromPlaces(!enabled)
      if (res.success && res.data) setEnabled(res.data.enabled)
      else showToast(res.error || "That didn't save. Try again.", 'error', { haptic: 'error' })
    } catch {
      showToast("That didn't save. Try again.", 'error', { haptic: 'error' })
    } finally {
      setSaving(false)
    }
  }
  return (
    <SettingsRow
      icon="gift"
      title="Offers from places"
      hint="Offers places you keep going back to send their regulars. They never learn who gets them."
      trail="switch"
      value={enabled === true}
      onValueChange={() => void flip()}
      busy={saving}
      disabled={enabled === null}
      testID="settings-offers"
    />
  )
}

/** Violet world: one hue on this screen (`HueProvider`). */
export default function SettingsScreen() {
  return (
    <HueProvider value="violet">
      <SettingsScreenContent />
    </HueProvider>
  )
}
