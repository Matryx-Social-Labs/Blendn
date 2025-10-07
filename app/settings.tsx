import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Linking, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AppHeader from '../components/AppHeader'
import OptimizedImage from '../components/OptimizedImage'
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
          setAvatarUrl(primary)
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
            <Ionicons name={item.icon} size={20} color="#FFFFFF" />
            <Text style={styles.rowTitle}>{item.title}</Text>
          </View>
          <Switch
            value={!!item.value}
            onValueChange={item.onToggle}
            trackColor={{ false: 'rgba(255,255,255,0.25)', true: '#7A2CF3' }}
            thumbColor="#FFFFFF"
          />
        </View>
      )
    }
    return (
      <TouchableOpacity key={idx} style={styles.row} onPress={item.onPress}>
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
        <TouchableOpacity style={styles.profileCard} onPress={() => router.push('/(tabs)/profile')} accessibilityRole="button" accessibilityLabel="Open About me">
          {avatarUrl ? (
            <OptimizedImage source={avatarUrl} style={styles.avatar as any} contentFit="cover" width={160} height={160} quality={60} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]} />
          )}
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.displayName}>{displayName}</Text>
            <TouchableOpacity onPress={() => router.push('/edit-profile')}>
              <Text style={styles.editLink}>Edit profile</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

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
  profileCard: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#333' },
  avatarFallback: { backgroundColor: '#333' },
  displayName: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  editLink: { marginTop: 4, color: '#9CCBFF', fontWeight: '600' },
  card: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  sectionHeader: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.7)', marginTop: 14, marginBottom: 8, paddingHorizontal: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginLeft: 44 },
})


