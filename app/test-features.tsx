import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

/**
 * @deprecated This test screen was used for Supabase testing.
 * The app has been migrated to use the admin backend API.
 *
 * For API testing, use the admin dashboard or API tools like Postman.
 */
export default function TestFeatures() {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <Text style={styles.icon}>🔧</Text>
        <Text style={styles.title}>Test Features</Text>
        <Text style={styles.description}>
          This debug screen has been deprecated.
        </Text>
        <Text style={styles.subdescription}>
          The app now uses the admin backend API instead of direct Supabase access.
          For API testing, use the admin dashboard or API tools.
        </Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 8,
  },
  subdescription: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 300,
  },
})
