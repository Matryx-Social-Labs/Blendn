import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppHeader from '../components/AppHeader'
import { apiClient } from '../lib/apiClient'
import { initializePushNotifications, removePushTokenFromProfile } from '../lib/notifications'
import { EMBER } from '../lib/theme'
import { useAuth, signOut, deleteAccount } from '../lib/useAuth'

type PreferenceKey = 'pushEnabled' | 'showOnlineStatus' | 'shareReadReceipts' | 'locationSharing'

interface PreferencesState {
  pushEnabled: boolean
  showOnlineStatus: boolean
  shareReadReceipts: boolean
  locationSharing: boolean
}

const DEFAULT_PREFERENCES: PreferencesState = {
  pushEnabled: true,
  showOnlineStatus: true,
  shareReadReceipts: true,
  locationSharing: true,
}

const toBoolean = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback

const BLENDN_LINKS = {
  safety: 'https://blendn.app/safety',
  guidelines: 'https://blendn.app/community-guidelines',
  help: 'https://blendn.app/help',
  terms: 'https://blendn.app/terms',
  privacy: 'https://blendn.app/privacy',
} as const

export default function SettingsScreen() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState<string>('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [preferences, setPreferences] = useState<PreferencesState>(DEFAULT_PREFERENCES)
  const [saving, setSaving] = useState<Record<PreferenceKey, boolean>>({
    pushEnabled: false,
    showOnlineStatus: false,
    shareReadReceipts: false,
    locationSharing: false,
  })
  const [loadingPreferences, setLoadingPreferences] = useState(true)
  const [deletingAccount, setDeletingAccount] = useState(false)

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
    }

    return { profile, nextPrefs }
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        if (!user) return
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
              })
            }
          } catch {}
        }

        const result = await apiClient.getProfile(user.id)
        if (result.success && result.data) {
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
      } catch {} finally {
        setLoadingPreferences(false)
      }
    }
    load()
  }, [user, settingsStorageKey, savePreferencesLocal, hydratePreferencesFromProfile])

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
      }

      const result = await apiClient.updateProfile(user.id, payload)
      if (!result.success) {
        throw new Error(result.error || 'Failed to save setting')
      }

      if (key === 'pushEnabled') {
        if (next.pushEnabled) {
          initializePushNotifications().catch(() => {})
        } else {
          removePushTokenFromProfile().catch(() => {})
        }
      }

      await savePreferencesLocal(next)
    } catch {
      setPreferences(previous)
      await savePreferencesLocal(previous)
      Alert.alert('Update failed', 'Could not save this setting. Please try again.')
    } finally {
      setSaving(prev => ({ ...prev, [key]: false }))
    }
  }, [user, savePreferencesLocal])

  const onTogglePreference = useCallback((key: PreferenceKey) => {
    const previous = preferences
    const next = { ...previous, [key]: !previous[key] }
    setPreferences(next)
    savePreferencesLocal(next)
    persistPreference(next, previous, key)
  }, [preferences, persistPreference, savePreferencesLocal])

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
      'This permanently deletes your profile, photos, and personal info. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
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
    { icon: 'eye-outline', title: 'Show online status', keyName: 'showOnlineStatus' as const },
    { icon: 'checkmark-done-outline', title: 'Read receipts', keyName: 'shareReadReceipts' as const },
    { icon: 'navigate-outline', title: 'Share location for nearby events', keyName: 'locationSharing' as const },

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

    { header: 'About' },
    { icon: 'help-circle-outline', title: 'Help & support', onPress: () => openExternal(BLENDN_LINKS.help) },
    { icon: 'document-text-outline', title: 'Terms of Service', onPress: () => openExternal(BLENDN_LINKS.terms) },
    { icon: 'lock-closed-outline', title: 'Privacy Policy', onPress: () => openExternal(BLENDN_LINKS.privacy) },

    { header: 'Account' },
    { icon: 'log-out-outline', title: 'Sign out', onPress: async () => {
      try {
        const result = await signOut()
        if (!result.success) Alert.alert('Error', 'Failed to sign out')
      } catch {
        Alert.alert('Error', 'Failed to sign out')
      }
    } },

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
    { icon: 'trash-outline', title: deletingAccount ? 'Deleting account...' : 'Delete account', danger: true, onPress: deletingAccount ? () => {} : handleDeleteAccount },
  ]), [openExternal, deletingAccount, handleDeleteAccount])

  const renderItem = (item: any, idx: number) => {
    if (item.header) {
      return (
        <Text
          key={`h-${idx}`}
          style={[styles.sectionHeader, item.spaced && styles.sectionHeaderSpaced]}
        >
          {item.header}
        </Text>
      )
    }
    if (item.keyName) {
      const keyName = item.keyName as PreferenceKey
      return (
        <View key={idx} style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name={item.icon} size={20} color="#FFFFFF" />
            <Text style={styles.rowTitle}>{item.title}</Text>
          </View>
          <View style={styles.switchWrap}>
            {saving[keyName] && (
              <ActivityIndicator size="small" color="#FFFFFFAA" style={styles.switchLoader} />
            )}
            <Switch
              value={preferences[keyName]}
              onValueChange={() => onTogglePreference(keyName)}
              disabled={saving[keyName] || loadingPreferences}
              /*
               * `EMBER.accent`. The old `#7A2CF3` predates the ember palette and
               * was the only purple left in the app -- on the one control whose
               * whole job is to read as "on".
               */
              trackColor={{ false: 'rgba(255,255,255,0.25)', true: EMBER.accent }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      )
    }
    return (
      <TouchableOpacity
        key={idx}
        style={styles.row}
        onPress={item.onPress}
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >
        <View style={styles.rowLeft}>
          <Ionicons name={item.icon} size={20} color={item.danger ? '#e74c3c' : '#FFFFFF'} />
          <Text style={[styles.rowTitle, item.danger && { color: '#e74c3c' }]}>{item.title}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#FFFFFF99" />
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <AppHeader title="Settings" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
          {items.map((it, i) => (
            <React.Fragment key={`it-${i}`}>
              {renderItem(it, i)}
              {i < items.length - 1 && !items[i + 1].header && !it.header ? <View style={styles.divider} /> : null}
            </React.Fragment>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  
  content: { padding: 16 },
  card: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  sectionHeader: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginTop: 14, marginBottom: 8, paddingHorizontal: 8 },
  /*
   * The gap that separates Delete account from everything above it. 40 rather
   * than the usual 14, because the whole point is that the thumb has to travel
   * to reach it -- it used to sit one row under Sign out.
   */
  sectionHeaderSpaced: { marginTop: 40 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  switchWrap: { flexDirection: 'row', alignItems: 'center' },
  switchLoader: { marginRight: 6 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginLeft: 44 },
})
