import { router } from 'expo-router'
import React, { useState } from 'react'
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { supabase } from '../../lib/supabase'

const LOOKING_FOR = ['Dating', 'Friendship', 'Networking', 'Mentorship', 'Collaboration']

export default function PreferencesStep() {
  const [selected, setSelected] = useState<string[]>([])
  const [industry, setIndustry] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [company, setCompany] = useState('')
  const [saving, setSaving] = useState(false)

  const toggle = (v: string) => setSelected(prev => (prev.includes(v) ? prev.filter(i => i !== v) : [...prev, v]))

  const onContinue = async () => {
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Error', 'Please sign in to continue')
        return
      }
      await supabase
        .from('user_profiles')
        .update({
          looking_for: selected,
          industry: industry || null,
          job_title: jobTitle || null,
          company: company || null,
        })
        .eq('user_id', user.id)
      router.push('./photos' as any)
    } catch (e) {
      console.error(e)
      Alert.alert('Error', 'Failed to save your preferences')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Your preferences</Text>
        <Text style={{ textAlign: 'center', color: '#666', marginBottom: 12 }}>Step 5 of 8</Text>
        <Text style={styles.subtitle}>Help us tailor your experience</Text>

        <Text style={styles.sectionTitle}>What are you looking for?</Text>
        <View style={styles.grid}>
          {LOOKING_FOR.map((v, idx) => {
            const isSel = selected.includes(v)
            return (
              <TouchableOpacity key={idx} style={[styles.chip, isSel && styles.chipSelected]} onPress={() => toggle(v)}>
                <Text style={[styles.chipText, isSel && styles.chipTextSelected]}>{v}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <Text style={styles.sectionTitle}>Professional details (optional)</Text>
        <TextInput style={styles.input} placeholder="Industry" value={industry} onChangeText={setIndustry} />
        <TextInput style={styles.input} placeholder="Job title" value={jobTitle} onChangeText={setJobTitle} />
        <TextInput style={styles.input} placeholder="Company" value={company} onChangeText={setCompany} />

        <TouchableOpacity style={[styles.primary, saving && styles.disabled]} onPress={onContinue} disabled={saving}>
          <Text style={styles.primaryText}>Continue</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skip} onPress={() => router.push('./photos' as any)}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 24 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#666', marginBottom: 18, textAlign: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333', marginTop: 8, marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  chip: { paddingVertical: 12, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#f0f0f0', marginBottom: 12, minWidth: '48%', alignItems: 'center' },
  chipSelected: { backgroundColor: '#FF6B6B' },
  chipText: { color: '#333', fontSize: 14, fontWeight: '600' },
  chipTextSelected: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 12 },
  primary: { backgroundColor: '#FF6B6B', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  skip: { padding: 12, alignItems: 'center' },
  skipText: { color: '#666', fontSize: 16 },
  disabled: { opacity: 0.6 },
})


