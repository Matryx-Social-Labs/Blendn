import * as Location from 'expo-location'
import { router } from 'expo-router'
import React, { useState } from 'react'
import { ActivityIndicator, Alert, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { supabase } from '../../lib/supabase'

export default function LocationStep() {
  const [loading, setLoading] = useState(false)
  const [granted, setGranted] = useState<boolean | null>(null)

  const requestPermissionAndSave = async () => {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Error', 'Please sign in to continue')
        return
      }

      const servicesEnabled = await Location.hasServicesEnabledAsync()
      if (!servicesEnabled) {
        Alert.alert('Location Disabled', 'Please enable Location Services in your device settings to continue.')
        setGranted(false)
        return
      }

      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setGranted(false)
        Alert.alert('Permission Required', 'We use your location to verify event check-ins and show nearby events.')
        return
      }

      setGranted(true)
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })

      await supabase
        .from('user_profiles')
        .update({
          location_permission_granted: true,
          location_lat: position.coords.latitude,
          location_lng: position.coords.longitude,
        })
        .eq('user_id', user.id)

      router.push('./complete' as any)
    } catch (error) {
      console.error('Location step error:', error)
      Alert.alert('Error', 'Failed to update your location preferences')
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Enable Location</Text>
        <Text style={{ textAlign: 'center', color: '#666', marginBottom: 12 }}>Step 7 of 8</Text>
        <Text style={styles.subtitle}>
          Location helps us verify event check-ins and show you people and events nearby. We never share your exact
          location with other users.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Why we ask:</Text>
          <Text style={styles.cardItem}>• Verify you’re at events you check into</Text>
          <Text style={styles.cardItem}>• Improve match relevance by distance</Text>
          <Text style={styles.cardItem}>• Show nearby events</Text>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.disabled]}
          onPress={requestPermissionAndSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Enable Location</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('./complete' as any)}>
          <Text style={styles.secondaryText}>Skip for now</Text>
        </TouchableOpacity>

        {granted === false && (
          <Text style={styles.notice}>You can enable location later from your device settings.</Text>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#666', lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  card: { backgroundColor: '#f8f9fa', padding: 16, borderRadius: 12, marginBottom: 24 },
  cardTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8, color: '#333' },
  cardItem: { fontSize: 14, color: '#555', marginBottom: 6 },
  primaryButton: { backgroundColor: '#FF6B6B', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 12 },
  disabled: { opacity: 0.6 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: { padding: 12, alignItems: 'center' },
  secondaryText: { color: '#666', fontSize: 16 },
  notice: { marginTop: 12, fontSize: 12, color: '#999', textAlign: 'center' },
})


