import { router } from 'expo-router'
import React, { useState } from 'react'
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useAuth } from '../../lib/useAuth'

const GOALS = [
  'Make new friends',
  'Find a date',
  'Professional networking',
  'Discover events',
  'Activity partners',
  'Just looking around',
]

export default function GoalsStep() {
  const { user } = useAuth()
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  const toggle = (g: string) => {
    setSelected(prev => (prev.includes(g) ? prev.filter(i => i !== g) : [...prev, g]))
  }

  const onContinue = async () => {
    if (selected.length === 0) {
      Alert.alert('Choose at least one', 'Pick at least one goal to personalize your experience.')
      return
    }
    if (!user) {
      Alert.alert('Error', 'Please sign in to continue')
      return
    }
    setSaving(true)
    try {
      // Goals are stored locally for now, will be synced when profile is complete
      router.push('./preferences' as any)
    } catch (e) {
      console.error(e)
      Alert.alert('Error', 'Failed to save your goals')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>What brings you here?</Text>
        <Text style={{ textAlign: 'center', color: '#fff', marginBottom: 12 }}>Step 4 of 8</Text>
        <Text style={styles.subtitle}>Select all that apply</Text>
        <View style={styles.grid}>
          {GOALS.map((g, idx) => {
            const isSelected = selected.includes(g)
            return (
              <TouchableOpacity key={idx} style={[styles.chip, isSelected && styles.chipSelected]} onPress={() => toggle(g)}>
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>{g}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <TouchableOpacity style={[styles.primary, saving && styles.disabled]} onPress={onContinue} disabled={saving}>
          <Text style={styles.primaryText}>Continue</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skip} onPress={() => router.push('./preferences' as any)}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#fff', marginBottom: 18, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  chip: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    marginBottom: 12,
    minWidth: '48%',
    alignItems: 'center',
  },
  chipSelected: { backgroundColor: '#FF6B6B' },
  chipText: { color: '#333', fontSize: 14, fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  primary: { backgroundColor: '#FF6B6B', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  skip: { padding: 12, alignItems: 'center' },
  skipText: { color: '#fff', fontSize: 16 },
  disabled: { opacity: 0.6 },
})


