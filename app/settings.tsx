import { Ionicons } from '@expo/vector-icons'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getOptimizedImageUrl } from '../lib/photoUtils'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/useAuth'

export default function SettingsScreen() {
  const { user } = useAuth()
  const [displayName, setDisplayName] = useState<string>('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [pushEnabled, setPushEnabled] = useState<boolean>(true)
  const [showOnlineStatus, setShowOnlineStatus] = useState<boolean>(true)
  const [shareReadReceipts, setShareReadReceipts] = useState<boolean>(true)
  const [locationSharing, setLocationSharing] = useState<boolean>(true)

  useEffect(() => {
    const load = async () => {
      try {
        if (!user) return
        const { data: base } = await supabase.from('profiles').select('name').eq('id', user.id).maybeSingle()
        const { data: up } = await supabase.from('user_profiles').select('display_name, profile_photos, photos').eq('user_id', user.id).maybeSingle()
        const name = up?.display_name || base?.name || 'You'
        setDisplayName(name)
        const primary = (Array.isArray(up?.profile_photos) && up?.profile_photos?.[0]) || (Array.isArray(up?.photos) && up?.photos?.[0]) || null
        if (primary) {
          const optimized = getOptimizedImageUrl(primary, { width: 160, height: 160, resize: 'cover', quality: 60 })
          setAvatarUrl(optimized || primary)
        }
      } catch {}
    }
    load()
  }, [user])

  const items = useMemo(() => ([
    { header: 'Account' },
    { icon: 'person-outline', title: 'Edit profile', onPress: () => router.push('/edit-profile') },
    { icon: 'mail-outline', title: 'Blocked users', onPress: () => router.push('/blocked-users') },
    { icon: 'log-out-outline', title: 'Sign out', danger: true, onPress: async () => {
      try {
        const { error } = await supabase.auth.signOut()
        if (error) Alert.alert('Error', 'Failed to sign out')
      } catch (e) {
        Alert.alert('Error', 'Failed to sign out')
      }
    } },

    { header: 'Discovery' },
    { icon: 'eye-outline', title: 'Show online status', type: 'switch' as const, value: showOnlineStatus, onToggle: setShowOnlineStatus },
    { icon: 'checkmark-done-outline', title: 'Read receipts', type: 'switch' as const, value: shareReadReceipts, onToggle: setShareReadReceipts },
    { icon: 'navigate-outline', title: 'Share location for nearby events', type: 'switch' as const, value: locationSharing, onToggle: setLocationSharing },

    { header: 'Notifications' },
    { icon: 'notifications-outline', title: 'Push notifications', type: 'switch' as const, value: pushEnabled, onToggle: setPushEnabled },

    { header: 'Safety' },
    { icon: 'shield-checkmark-outline', title: 'Safety tips', onPress: () => Linking.openURL('https://www.bumble.com/safety') },
    { icon: 'flag-outline', title: 'Community guidelines', onPress: () => Linking.openURL('https://www.bumble.com/en-in/community-guidelines') },

    { header: 'Support' },
    { icon: 'help-circle-outline', title: 'Help & support', onPress: () => Linking.openURL('https://help.bumble.com/') },
    { icon: 'document-text-outline', title: 'Terms of Service', onPress: () => Linking.openURL('https://bumble.com/terms') },
    { icon: 'lock-closed-outline', title: 'Privacy Policy', onPress: () => Linking.openURL('https://bumble.com/privacy') },
  ]), [pushEnabled, showOnlineStatus, shareReadReceipts, locationSharing])

  const renderItem = (item: any, idx: number) => {
    if (item.header) {
      return (
        <Text key={`h-${idx}`} style={styles.sectionHeader}>{item.header}</Text>
      )
    }
    if (item.type === 'switch') {
      return (
        <View key={idx} style={styles.row}>
          <View style={styles.rowLeft}>
            <Ionicons name={item.icon} size={20} color="#333" />
            <Text style={styles.rowTitle}>{item.title}</Text>
          </View>
          <Switch value={!!item.value} onValueChange={item.onToggle} />
        </View>
      )
    }
    return (
      <TouchableOpacity key={idx} style={styles.row} onPress={item.onPress}>
        <View style={styles.rowLeft}>
          <Ionicons name={item.icon} size={20} color={item.danger ? '#e74c3c' : '#333'} />
          <Text style={[styles.rowTitle, item.danger && { color: '#e74c3c' }]}>{item.title}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#999" />
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.profileCard}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl } as any} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]} />
          )}
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.displayName}>{displayName}</Text>
            <TouchableOpacity onPress={() => router.push('/edit-profile')}>
              <Text style={styles.editLink}>Edit profile</Text>
            </TouchableOpacity>
          </View>
        </View>

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
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#222' },
  content: { padding: 16 },
  profileCard: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f9f9f9', borderRadius: 12, marginBottom: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#eee' },
  avatarFallback: { backgroundColor: '#eee' },
  displayName: { fontSize: 18, fontWeight: '800', color: '#222' },
  editLink: { marginTop: 4, color: '#007AFF', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#f0f0f0' },
  sectionHeader: { fontSize: 14, fontWeight: '700', color: '#666', marginTop: 14, marginBottom: 8, paddingHorizontal: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#333' },
  divider: { height: 1, backgroundColor: '#f2f2f2', marginLeft: 44 },
})


