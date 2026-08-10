import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import * as Haptics from 'expo-haptics'
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native'
import { apiClient } from '../../lib/apiClient'
import { Logger } from '../../lib/logger'
import { useAuth } from '../../lib/useAuth'
import OnboardingProgressBar from '../../components/OnboardingProgressBar'
import { useToast } from '../../components/Toast'

/**
 * Interests come from the server, not from here.
 *
 * This screen used to offer 28 hardcoded emoji strings and write them to
 * `profiles.interests`, a free-text column. Matching ranks on the structured
 * `user_interests -> categories` graph, which nothing wrote to -- so every match
 * card came back with no shared interests, for everyone, and had done for
 * weeks. The ranking, the rarity weighting and the overlap card were all
 * correct and all fed by an empty table.
 *
 * `GET /categories` is the same taxonomy events are filed under, so an interest
 * and an event category are now the same vocabulary and can actually be
 * compared.
 *
 * ## The shape the endpoint actually returns
 *
 * A tree, not a flat list: 13 top-level categories, each carrying its leaves in
 * `children`, because the route selects `where: { parent_id: null }`. This
 * screen previously read the response flat and kept rows with a non-null
 * `parent_id` -- which is every row the endpoint does *not* return. It
 * discarded 100% of the response every time, showed "Couldn't load interests",
 * and left Continue disabled with nothing selectable. Onboarding could not be
 * completed at all, which is why `user_interests` was still empty across every
 * account.
 *
 * So: flatten `children`. Leaves are what we want anyway -- "Music" is a
 * grouping half the room would tick, and an overlap on it says nothing, whereas
 * "Modular synths" says a great deal.
 */
type Category = { id: string; name: string; icon?: string | null }

/** One tier of the tree as the endpoint sends it. */
type CategoryNode = {
  id: unknown
  name: unknown
  icon?: unknown
  children?: { id: unknown; name: unknown; icon?: unknown }[]
}

/**
 * Tree -> selectable leaves.
 *
 * A parent with no children contributes itself rather than vanishing: dropping
 * it would silently remove a whole branch of the taxonomy from onboarding, and
 * a coarse interest beats a missing one.
 */
export function flattenToLeaves(nodes: CategoryNode[]): Category[] {
  const out: Category[] = []
  for (const node of nodes) {
    const children = Array.isArray(node.children) ? node.children : []
    if (children.length > 0) {
      for (const child of children) {
        out.push({ id: String(child.id), name: String(child.name), icon: (child.icon as string | null) ?? null })
      }
    } else if (node.id != null) {
      out.push({ id: String(node.id), name: String(node.name), icon: (node.icon as string | null) ?? null })
    }
  }
  return out
}

const MAX_INTERESTS = 10

export default function Interests() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    apiClient
      .getCategories()
      .then((res) => {
        if (cancelled) return
        if (res.success && Array.isArray(res.data)) {
          setCategories(flattenToLeaves(res.data as unknown as CategoryNode[]))
        } else {
          showToast('Could not load interests', 'error')
        }
      })
      .catch((e) => {
        Logger.error('profile', 'Category load failed', { error: e })
        if (!cancelled) showToast('Could not load interests', 'error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])

  const handleInterestToggle = (interest: string) => {
    if (selectedInterests.includes(interest)) {
      Haptics.selectionAsync().catch(() => {})
      setSelectedInterests(prev => prev.filter(i => i !== interest))
    } else if (selectedInterests.length < MAX_INTERESTS) {
      Haptics.selectionAsync().catch(() => {})
      setSelectedInterests(prev => [...prev, interest])
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
      showToast(`You can select up to ${MAX_INTERESTS} interests`, 'info')
    }
  }

  const handleContinue = async () => {
    if (!user) {
      showToast('Please sign in to continue', 'error')
      return
    }
    try {
      // Writes to the structured graph the ranking actually reads. Skipping
      // the call entirely when nothing is picked -- the route requires at
      // least one id and would 400.
      if (selectedInterests.length > 0) {
        const result = await apiClient.addProfileInterests(user.id, selectedInterests)
        if (!result.success) {
          throw new Error(result.error || 'Failed to save')
        }
      }
      router.push('./goals' as any)
    } catch (e) {
      Logger.error('profile', 'Onboarding interests save error', { error: e })
      showToast('Failed to save interests', 'error')
    }
  }

  const handleBack = () => {
    router.back()
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <OnboardingProgressBar currentStep={3} totalSteps={8} />
        </View>

        <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>What are you into? 🎯</Text>
          <Text style={styles.subtitle}>
            Select up to 10 interests to help us find your perfect matches
          </Text>

          <View style={styles.selectedContainer}>
            <Text style={styles.selectedText}>
              Selected: {selectedInterests.length}/{MAX_INTERESTS}
            </Text>
          </View>

          {loading ? (
            <Text style={styles.selectedText}>Loading interests…</Text>
          ) : categories.length === 0 ? (
            // Failing closed with an honest message beats an empty grid that
            // looks like the app has nothing to offer.
            <Text style={styles.selectedText}>
              Couldn&apos;t load interests. You can add them later from your profile.
            </Text>
          ) : null}

          <View style={styles.interestsGrid}>
            {categories.map((category) => (
              <TouchableOpacity
                key={category.id}
                style={[
                  styles.interestChip,
                  selectedInterests.includes(category.id) ? styles.selectedInterest : styles.unselectedInterest
                ]}
                onPress={() => handleInterestToggle(category.id)}
              >
                <Text style={[
                  styles.interestText,
                  selectedInterests.includes(category.id) ? styles.selectedInterestText : styles.unselectedInterestText
                ]}>
                  {category.icon ? `${category.icon} ${category.name}` : category.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/*
          * Only gated while there is something to pick.
          *
          * `disabled={selected.length === 0}` on its own made an empty list a
          * dead end: no chips to tap, so the button could never enable, and
          * onboarding is hard-gated with no skip and no back. Whatever the
          * cause -- the response shape, a flaky network, a bad deploy -- the
          * user was stuck in the app forever. That is a far worse outcome than
          * an account with no interests, and it contradicted the message right
          * above, which already promises they can add them later.
          *
          * `handleContinue` already skips the write when nothing is selected,
          * so this needs no other change.
          */}
        <View style={styles.bottomSection}>
          <TouchableOpacity
            style={[
              styles.continueButton,
              categories.length > 0 && selectedInterests.length === 0 ? styles.disabledButton : null
            ]}
            onPress={handleContinue}
            disabled={categories.length > 0 && selectedInterests.length === 0}
            activeOpacity={0.9}
          >
            <Text style={styles.continueButtonText}>
              {categories.length === 0 ? 'Skip for now' : 'Continue'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 16,
    paddingBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 20,
    color: '#111827',
  },
  progressText: {
    fontSize: 14,
    color: '#fff',
  },
  scrollContent: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 24,
    lineHeight: 22,
  },
  selectedContainer: {
    marginBottom: 16,
  },
  selectedText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '500',
  },
  interestsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: 20,
  },
  interestChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginBottom: 12,
    minWidth: '45%',
    alignItems: 'center',
  },
  selectedInterest: {
    backgroundColor: '#FF6B6B',
  },
  unselectedInterest: {
    backgroundColor: '#f0f0f0',
  },
  interestText: {
    fontSize: 14,
    fontWeight: '500',
  },
  selectedInterestText: {
    color: '#fff',
  },
  unselectedInterestText: {
    color: '#333',
  },
  bottomSection: {
    paddingBottom: 32,
  },
  continueButton: {
    backgroundColor: '#FF6B6B',
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  continueButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
}) 
