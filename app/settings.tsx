import AsyncStorage from '@react-native-async-storage/async-storage'
import { router, useFocusEffect } from 'expo-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Banner } from '../components/ds/Banner'
import { SettingsGroup, SettingsRow } from '../components/ds/SettingsRow'
import { font, HueProvider, useBoldText } from '../components/ds/shared'
import { TopBar } from '../components/ds/TopBar'
import { bannerFadeIn, bannerIn, bannerOut } from '../components/motion/presence'
import { OfflineBanner } from '../components/OfflineBanner'
import { useToast } from '../components/Toast'
import { COLOR, SPACE as DS_SPACE, SPRING, MAX_FONT_SCALE } from '../lib/design/tokens'
import type { IconName } from '../components/ui/Icon'
import { H } from '../lib/haptics'
import { PLUS_FREE_SHEET } from '../lib/plusFree'
import { showSheet, type Sheet } from '../lib/sheet'
import { useTopBarOverlay } from '../lib/useTopBarState'
import { apiClient } from '../lib/apiClient'
import { useAuthMethod } from '../lib/authMethod'
import { APPLE_UNLINK_HINT, appleCodeForDeletion } from '../lib/appleRevocation'
import { BLENDN_LINKS, openInApp } from '../lib/links'
import { dataCopyMailto, SUPPORT_EMAIL } from '../lib/support'
import { settleWithin } from '../lib/fetchTimeout'
import { NOT_SIGNED_OUT_EVERYWHERE, passwordLinkSheet, signOutEverywhereSheet, signOutSheet } from '../lib/settingsSheets'
import { useLatest } from '../lib/useLatest'
import { usePullToRefresh } from '../lib/usePullToRefresh'
import { usePushPreference } from '../lib/usePushPreference'
import { Logger } from '../lib/logger'
import { useAuth, refreshAuthUser, signOut, signOutEverywhere, deleteAccount } from '../lib/useAuth'
import { notificationsHint, useMutedRooms } from '../lib/mutedRooms'
import { openPaywall } from '../lib/paywall'
import { usePlusStatus, type PlusStatus } from '../lib/plus'
import { plusRowLine } from '../lib/mePlus'
import { useMonthlyPrice } from '../lib/useMonthlyPrice'
import { manageSubscriptionUrl } from '../lib/purchases'
import { useReducedMotion } from '../lib/motion'

/** The banner's sentence when the profile could not be read (Flow 7 frame 06). */
/** How long "Sign out of every device" keeps its spinner: past one request deadline (15 s), so a slow answer still lands. */
const SIGN_OUT_EVERYWHERE_CAP_MS = 20_000

const SETTINGS_NOT_LOADED = 'Your settings didn’t load. Pull down or try again.'

type PreferenceKey = 'showOnlineStatus' | 'shareReadReceipts' | 'locationSharing' | 'friendsSeeMe'

/** The asymmetric column names (see `hydratePreferencesFromProfile`). */
const PREFERENCE_COLUMN: Record<PreferenceKey, string> = {
  showOnlineStatus: 'show_online',
  shareReadReceipts: 'read_receipts',
  locationSharing: 'share_location',
  friendsSeeMe: 'friends_see_me_in_rooms',
}

/** The visible row title per key, so a failure can name the setting it lost. */
const PREFERENCE_TITLES: Record<PreferenceKey, string> = {
  showOnlineStatus: 'Show online status',
  shareReadReceipts: 'Read receipts',
  locationSharing: 'Share location for nearby events',
  friendsSeeMe: "Friends can see I’m here",
}

interface PreferencesState {
  showOnlineStatus: boolean
  shareReadReceipts: boolean
  locationSharing: boolean
  friendsSeeMe: boolean
}

const DEFAULT_PREFERENCES: PreferencesState = {
  showOnlineStatus: true,
  shareReadReceipts: true,
  locationSharing: true,
  // Off, unlike the four above: in a room a friend is a pseudonym like anyone
  // else until you choose otherwise. The column defaults false for the same reason.
  friendsSeeMe: false,
}

const toBoolean = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback

function SettingsScreenContent() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [preferences, setPreferences] = useState<PreferencesState>(DEFAULT_PREFERENCES)
  // What the screen currently shows, readable from an async callback. Two
  // toggles can be in flight at once, and a rollback that spread the snapshot
  // it was called with wrote the sibling's OLD value back into storage.
  const preferencesRef = useLatest(preferences)
  const [saving, setSaving] = useState<Record<PreferenceKey, boolean>>({
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
  /** The delete is in flight: the row says so and nothing can close the sheet (Flow 7 frame 15). */
  const [deleting, setDeleting] = useState(false)
  /** The Notifications row's hint: how many rooms are muted, else whether pushes are on. */
  const muted = useMutedRooms()
  const push = usePushPreference()
  const bar = useTopBarOverlay()
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const reduceMotion = useReducedMotion()
  const authMethod = useAuthMethod(user?.signInMethod)
  // The Password row follows the server's `signInMethod`, which a password added elsewhere changes: read the session on opening.
  useEffect(() => {
    void refreshAuthUser()
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
        setPreferencesError(SETTINGS_NOT_LOADED)
      }
      if (result.success && result.data) {
        setPreferencesError(null)
        const nextPrefs = hydratePreferencesFromProfile(result.data)
        setPreferences(nextPrefs)
        savePreferencesLocal(nextPrefs)
      }
    } catch (error) {
      Logger.warn('profile', 'Could not load preferences', { error })
      setPreferencesError(SETTINGS_NOT_LOADED)
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

  const { load: reloadPush, reloadIfStale: reloadPushIfStale } = push
  // The Notifications row's hint says what the account says: read again when this screen comes back (30 s), and on a pull.
  useFocusEffect(reloadPushIfStale)
  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await Promise.all([loadPreferences(), reloadPush()])
    setRefreshing(false)
  }, [loadPreferences, reloadPush])
  // The app's one pull to refresh, with its haptic when it arms (SYS-12).
  const pull = usePullToRefresh({ refreshing, onRefresh: () => void onRefresh(), onScroll: bar.scrollProps.onScroll, indicatorTop: bar.indicatorTop })

  const persistPreference = useCallback(async (next: PreferencesState, previous: PreferencesState, key: PreferenceKey) => {
    if (!user) return
    setSaving(prev => ({ ...prev, [key]: true }))

    try {
      // The four keys the route validates, top level, snake_case. There is no
      // `preferences` wrapper and no camelCase alias -- the previous twelve
      // variants matched none of them, so nothing was ever persisted.
      //
      // ONLY the key that was changed. All four from what the screen holds sent a stale cache's value for the
      // others: opened offline, with `friendsSeeMe` still false, flipping Read receipts would have turned off a
      // consent the person gave elsewhere (the one-time ask). A switch the person did not touch is not sent.
      const payload = { [PREFERENCE_COLUMN[key]]: next[key] }

      const result = await apiClient.updateProfile(user.id, payload)
      if (!result.success) {
        throw new Error(result.error || 'Failed to save setting')
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
      showToast(`Couldn’t save “${PREFERENCE_TITLES[key]}”. Try again.`, 'error', { haptic: 'error' })
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }))
    }
  }, [user, savePreferencesLocal, showToast, preferencesRef])

  const onTogglePreference = useCallback((key: PreferenceKey) => {
    const previous = preferencesRef.current
    const next = { ...previous, [key]: !previous[key] }
    preferencesRef.current = next
    setPreferences(next)
    savePreferencesLocal(next)
    persistPreference(next, previous, key)
  }, [persistPreference, savePreferencesLocal, preferencesRef])

  /*
   * Our own pages open in the in-app browser; a store's page (Manage
   * subscription) is not ours and opens in the store, through `openURL` alone
   * with no `canOpenURL` first (on iOS that answers false for any scheme not
   * declared in `LSApplicationQueriesSchemes`). A failure is a toast, the same
   * sentence About uses.
   */
  const openPage = useCallback(
    (url: string) => {
      openInApp(url).catch(() => showToast("That page didn’t open. Try again.", 'error'))
    },
    [showToast]
  )
  const openStore = useCallback(
    (url: string) => {
      Linking.openURL(url).catch(() => showToast("That page didn’t open. Try again.", 'error'))
    },
    [showToast]
  )

  /** Deleting is two steps in one sheet: what it does, then "for good?". The confirm's own haptic is H.destructive (SheetHost). */
  const confirmDeleteSheet = useCallback((): Sheet => ({
    kind: 'actions',
    hue: 'violet',
    icon: 'trash-2',
    title: 'Delete your account for good?',
    message: 'This can’t be undone. You’d need a new account to use Blend’n again.',
    actions: [
      {
        label: 'Delete my account',
        variant: 'destructive',
        // On failure the sheet stays, says why, and the button becomes Try again.
        run: async () => {
          setDeleting(true)
          try {
            // An Apple account's grant is revoked with a fresh code from the Apple sheet; without one it is deleted anyway (5.1.1(v)).
            const apple = authMethod === 'apple'
            const appleCode = apple ? await appleCodeForDeletion() : null
            const result = await deleteAccount(appleCode ?? undefined)
            if (!result.success) {
              setDeleting(false)
              return { ok: false, error: result.error || "Your account wasn’t deleted. Try again." }
            }
            /*
             * The session is already gone and the guard is on its way to sign-in.
             * The toast sits above the navigator, so it lands there too: without it
             * the account vanished with no word that deleting it had worked.
             */
            const deleted = 'Your account has been deleted.'
            return { ok: true, toast: apple && !appleCode ? `${deleted} ${APPLE_UNLINK_HINT}` : deleted }
          } catch {
            setDeleting(false)
            return { ok: false, error: "Your account wasn’t deleted. Check your connection and try again." }
          }
        },
      },
      { label: 'Cancel', cancel: true },
    ],
  }), [authMethod])

  const explainDeleteSheet = useCallback(
    (storePlus: PlusStatus['source'] | null): Sheet => {
      const store = storePlus === 'apple' ? 'App Store' : 'Google Play'
      return {
        kind: 'actions',
        hue: 'violet',
        icon: 'trash-2',
        title: 'Delete your account?',
        message:
          'Your profile, photos, friends and sign-in are deleted now. Messages you sent stay in their conversations under a deleted account, and we keep your registration details for 180 days, as Indian law requires.',
        // A running store subscription keeps billing after the account is gone: say so first (review H1).
        content: storePlus ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} accessibilityLiveRegion="polite" style={[font('bodyStrong', bold), { color: COLOR.textPrimary }]}>
            {`Cancel Blend’n+ in your ${store} subscriptions first. Deleting your account doesn’t cancel it.`}
          </Text>
        ) : undefined,
        onDismiss: () => {
          deleteExplainOpen.current = false
        },
        actions: [
          {
            label: 'Delete account',
            variant: 'destructive',
            // Each destructive press plays the tick (Flow 7 frame 13), the one that only leads to "for good?" included.
            pressHaptic: () => H.destructive(),
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
            label: 'What’s kept',
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

  /** Sign out asks first (one stray tap used to end the session on the spot); so does signing out of every device. */
  const askSignOut = useCallback(() => showSheet(signOutSheet({ signOut, showToast })), [showToast])
  // The spinner is capped (SCRUM-733): a restored session's keychain can hold the request for a long time, and the sheet's Cancel is
  // disabled while it spins. On the cap it says nothing was signed out, which is what the person can rely on; a late success
  // simply ends their sessions anyway.
  const askSignOutEverywhere = useCallback(
    () =>
      showSheet(
        signOutEverywhereSheet({
          signOutEverywhere: () => settleWithin(signOutEverywhere(), SIGN_OUT_EVERYWHERE_CAP_MS, { success: false, error: NOT_SIGNED_OUT_EVERYWHERE }),
        })
      ),
    []
  )
  const openDataCopyMail = useCallback(
    () => void Linking.openURL(dataCopyMailto(user?.id)).catch(() => showToast(`No email app opened. Write to ${SUPPORT_EMAIL}.`, 'info')),
    [showToast, user?.id]
  )
  const askPasswordLink = useCallback(
    (email: string) => showSheet(passwordLinkSheet({ email, sendLink: (to) => apiClient.forgotPassword(to), showToast })),
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
    return (
      <SettingsRow
        key={key}
        icon={icon}
        title={title}
        hint={hint}
        trail="switch"
        value={preferences[key]}
        onValueChange={() => onTogglePreference(key)}
        busy={saving[key]}
        // Loading, or the profile did not come: the switches show what was cached and hold still (frames 05, 06).
        disabled={loadingPreferences || !!preferencesError}
        testID={`settings-${key}`}
      />
    )
  }

  // The paywall, asked for: no cooldown (step 11, trigger `profile`). Free during launch where you go out: a row that says so and sells nothing (review H2).
  // The same line as Me's row (D23, `plusRowLine`): one account, one sentence on both.
  const plusPrice = useMonthlyPrice(!!plus && !plus.active && plus.gated)
  const plusLine = plusRowLine(plus, plusPrice, Platform.OS === 'android' ? 'android' : 'ios')
  const plusIsFree = plusLine.free
  const plusHint = plusLine.hint ?? undefined

  /** The Account card (R4.1 7.1): who is signed in, how, and the ways out. A Google or Apple account has no password to change. */
  const email = user?.email
  const viaProvider = authMethod === 'google' || authMethod === 'apple'
  const accountRow = viaProvider
    ? { icon: authMethod === 'apple' ? ('apple' as const) : ('mail' as const), title: `Signed in with ${authMethod === 'apple' ? 'Apple' : 'Google'}` }
    : { icon: 'at-sign' as const, title: 'Signed in as' }
  const glide = reduceMotion ? undefined : LinearTransition.springify().stiffness(SPRING.settle.stiffness).damping(SPRING.settle.damping).mass(SPRING.settle.mass)
  const enter = reduceMotion ? bannerFadeIn : bannerIn

  return (
    <View style={styles.container}>
      <ScrollView
        // The foot is the content's own padding: a SafeAreaView around the scroll cut it on a line above the home indicator.
        contentContainerStyle={[styles.content, { paddingTop: bar.contentTop, paddingBottom: insets.bottom + DS_SPACE.xl }]}
        scrollIndicatorInsets={{ top: bar.indicatorTop }}
        showsVerticalScrollIndicator={false}
        {...pull.listProps}
      >
        {/*
          There was a profile card here, and it was the third door to editing.
          The Me tab carries the identity card and both doors now. Settings is
          settings. Six groups, each under its own label, so Privacy, Safety and
          Account do not read as one block; Delete account is alone at the bottom.
        */}
        <Animated.View layout={glide} style={styles.banners}>
          {preferencesError ? (
            <Animated.View entering={enter} exiting={bannerOut}>
              {/* Frame 06: the destructive-tint banner and its Try again; the switches below hold still until it works. */}
              <Banner
                kind="offline"
                text={preferencesError}
                action={{ label: 'Try again', onPress: () => void onRefresh() }}
                busy={refreshing}
                testID="settings-load-error"
              />
            </Animated.View>
          ) : (
            // The load error already says the network is gone; offline with the settings cached says what is on screen.
            <OfflineBanner text="Offline. Showing what you had." testID="settings-offline" />
          )}
        </Animated.View>

        <SettingsGroup title="Privacy">
          {/* What it does, in the row: the switch was a promise for a year (SCRUM-141). */}
          {/* D-L24: the sub names what the switch does now, on or off. */}
          {preferenceRow('showOnlineStatus', 'eye', 'Show online status', ONLINE_STATUS_HINT[preferences.showOnlineStatus ? 'on' : 'off'])}
          {preferenceRow('shareReadReceipts', 'check-check', 'Read receipts')}
          {preferenceRow('locationSharing', 'navigation', 'Share location for nearby events')}
          {preferenceRow('friendsSeeMe', 'users', "Friends can see I’m here", "On: friends at the same event see you under Friends here, with your name and photo, and can message you. Off: you don’t show up for friends at events at all.")}
          {/* R4.1 7.2: a prefilled email to support; nothing is sent until they press Send in their mail app. */}
          <SettingsRow
            icon="download"
            title="Get a copy of your data"
            hint="Opens a prefilled email to support"
            trail="external"
            opens="opens your mail app"
            onPress={openDataCopyMail}
            testID="settings-data-copy"
          />
        </SettingsGroup>

        {/*
          Push, what to hear about, offers and the rooms you muted live on their own screen (Flow 9 · 9.6); what matching
          reads about you is Edit profile's about-you fields, reached from here too (Flow 14 · 14.4, R4.1 7.1 frame 01).
        */}
        <SettingsGroup title="Notifications & matching">
          <SettingsRow
            icon="bell"
            title="Notifications"
            hint={notificationsHint(muted.count, push.enabled === null ? null : push.enabled && !push.off, muted.atLeast)}
            trail="chevron"
            onPress={() => router.push('/notification-settings')}
            testID="settings-notifications"
          />
          <SettingsRow icon="sparkles" title="About you" hint="What matching reads" trail="chevron" onPress={() => router.push({ pathname: '/edit-about-you', params: { from: 'settings' } })} testID="settings-how-you-match" />
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
          {/* R4-2: every coach-mark sentence, to read again. Nothing replays from there. */}
          <SettingsRow icon="zap" title="Tips" trail="chevron" onPress={() => router.push('/tips')} testID="settings-tips" />
        </SettingsGroup>

        {/* Terms and Privacy are on About, beside the version: two doors to each page, one screen apart. */}
        <SettingsGroup title="About">
          <SettingsRow icon="info" title="About Blend’n" trail="chevron" onPress={() => router.push('/about')} />
        </SettingsGroup>

        {/* R2-D7: Blend’n+ is its own group above Account, one row that says where you stand. */}
        <SettingsGroup title="Blend’n+">
          <SettingsRow
            icon="sparkles"
            title="Blend’n+"
            hint={plusHint}
            trail="chevron"
            onPress={plusIsFree ? () => showSheet(PLUS_FREE_SHEET) : () => void openPaywall('profile', { userInitiated: true })}
            testID="settings-plus"
          />
        </SettingsGroup>

        <SettingsGroup title="Account">
          {email ? <SettingsRow icon={accountRow.icon} title={accountRow.title} hint={email} testID="settings-account" /> : null}
          {email && authMethod === 'password' ? (
            <SettingsRow icon="key-round" title="Password" trail="chevron" onPress={() => askPasswordLink(email)} testID="settings-password" />
          ) : null}
          <SettingsRow icon="log-out" title="Sign out" trail="chevron" onPress={askSignOut} />
          <SettingsRow icon="smartphone" title="Sign out of every device" trail="chevron" onPress={askSignOutEverywhere} testID="settings-sign-out-everywhere" />
        </SettingsGroup>

        {/*
          Alone, at the bottom, outlined, under its own label. Sign out is routine and
          reversible and Delete destroys the account: reserving the red for the
          one irreversible row is what makes it mean anything.
        */}
        <SettingsGroup title="Danger zone" danger>
          <SettingsRow
            icon="trash-2"
            title={deleting ? 'Deleting account…' : 'Delete account'}
            trail={deleting ? 'none' : 'chevron'}
            busy={deleting}
            destructive
            onPress={handleDeleteAccount}
            testID="settings-delete"
          />
        </SettingsGroup>
      </ScrollView>
      {pull.indicator}
      <View style={bar.barPin} pointerEvents="box-none">
        <TopBar title="Settings" state={bar.state} onBack={() => router.back()} testID="settings-top" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { paddingHorizontal: DS_SPACE.gutter, paddingBottom: DS_SPACE.xl, gap: DS_SPACE.xl },
  // The banner and the groups share the column's gap; an empty slot takes none.
  banners: { gap: DS_SPACE.sm },
})

/** Violet world: one hue on this screen (`HueProvider`). */

/** What "Show online status" does in the state it is in (D-L24): the sub said only what Off meant while the switch was On. */
export const ONLINE_STATUS_HINT = {
  on: 'On: people at the same event see you listed there.',
  off: 'Off: you’re counted at events but not listed to other people there.',
} as const

export default function SettingsScreen() {
  return (
    <HueProvider value="violet">
      <SettingsScreenContent />
    </HueProvider>
  )
}
