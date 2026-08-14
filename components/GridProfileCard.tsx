import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import GlassSurface from './ui/GlassSurface'
import Avatar from './ui/Avatar'
import GradientButton from './ui/GradientButton'
import ScalePress from './motion/ScalePress'
import { Ionicons } from '@expo/vector-icons'
import { APP_COLORS, APP_FONTS, APP_RADIUS, APP_SPACING } from '../lib/theme'

export interface GridAttendee {
  user_id: string
  name?: string
  age?: number
  bio?: string
  interests?: string[]
  occupation?: string
  profile_photos?: string[]
  last_seen?: string
}

interface GridProfileCardProps {
  attendee: GridAttendee
  featured?: boolean
  sharedInterestNames?: string[]
  onOpenProfile: () => void
  onSafetyPress: () => void
}

// Figma rotates a per-person accent (ring tint, first expertise pill) across the coral/pink/violet
// trio rather than using one fixed color for every card — derive a stable pick from user_id.
const ACCENT_ROTATION = [APP_COLORS.accent, APP_COLORS.accentSecondary, APP_COLORS.highlight]
function pickAccent(userId: string): string {
  let hash = 0
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0
  return ACCENT_ROTATION[hash % ACCENT_ROTATION.length]
}

function getDisplayName(name?: string) {
  return name?.trim() || 'Attendee'
}

function formatCheckedInAgo(lastSeen?: string): string {
  if (!lastSeen) return 'Recently checked in'
  const minutes = Math.max(0, Math.round((Date.now() - new Date(lastSeen).getTime()) / 60000))
  if (minutes < 1) return 'Checked in just now'
  if (minutes < 60) return `Checked in ${minutes}m ago`
  const hours = Math.round(minutes / 60)
  return `Checked in ${hours}h ago`
}

function getExpertisePills(attendee: GridAttendee): string[] {
  const pills: string[] = []
  if (attendee.occupation) pills.push(attendee.occupation)
  for (const interest of attendee.interests || []) {
    if (pills.length >= 2) break
    if (!pills.includes(interest)) pills.push(interest)
  }
  return pills.slice(0, 2)
}

export default function GridProfileCard({
  attendee,
  featured = false,
  sharedInterestNames = [],
  onOpenProfile,
  onSafetyPress,
}: GridProfileCardProps) {
  const expertise = getExpertisePills(attendee)
  const hasSharedInterests = sharedInterestNames.length > 0
  const accent = pickAccent(attendee.user_id)

  return (
    <View style={styles.wrapper}>
      <GlassSurface intensity={16} tint="rgba(20,19,19,0.7)" borderRadius={APP_RADIUS['2xl']} style={styles.card}>
        {featured && (
          <View style={styles.featuredTagWrap} pointerEvents="none">
            <Text style={styles.featuredTagText}>FEATURED</Text>
          </View>
        )}

        <ScalePress onPress={onOpenProfile} style={styles.headerRow} accessibilityRole="button" accessibilityLabel={`Open ${getDisplayName(attendee.name)}'s profile`}>
          <View style={styles.avatarWrap}>
            <Avatar
              source={attendee.profile_photos?.[0]}
              size={80}
              ringColor={`${accent}33`}
              ringWidth={2}
            />
            <View style={[styles.checkBadge, { backgroundColor: accent }]}>
              <Ionicons name="checkmark" size={12} color={APP_COLORS.onAccent} />
            </View>
          </View>
          <View style={styles.headerText}>
            <Text style={styles.name} numberOfLines={1}>
              {getDisplayName(attendee.name)}
              {attendee.age ? `, ${attendee.age}` : ''}
            </Text>
            {!!attendee.occupation && (
              <Text style={styles.role} numberOfLines={1}>
                {attendee.occupation}
              </Text>
            )}
          </View>
          <ScalePress
            onPress={onSafetyPress}
            style={styles.safetyButton}
            accessibilityRole="button"
            accessibilityLabel="Safety options"
            haptic={false}
          >
            <Ionicons name="ellipsis-horizontal" size={18} color={APP_COLORS.textSecondary} />
          </ScalePress>
        </ScalePress>

        {expertise.length > 0 && (
          <View style={styles.expertiseSection}>
            <Text style={styles.expertiseLabel}>CORE EXPERTISE</Text>
            <View style={styles.expertiseRow}>
              {expertise.map((tag, idx) => (
                <View key={tag} style={styles.expertiseChip}>
                  <Text style={[styles.expertiseChipText, idx === 0 && { color: accent }]}>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.infoPanel}>
          <View style={styles.infoPanelHeader}>
            <Ionicons
              name={hasSharedInterests ? 'sparkles' : 'radio-outline'}
              size={12}
              color={APP_COLORS.textPrimary}
            />
            <Text style={styles.infoPanelLabel}>{hasSharedInterests ? 'SHARED INTERESTS' : 'ATTENDING LIVE'}</Text>
          </View>
          <Text style={styles.infoPanelText} numberOfLines={2}>
            {hasSharedInterests ? sharedInterestNames.join(', ') : formatCheckedInAgo(attendee.last_seen)}
          </Text>
        </View>

        <GradientButton label="View Dossier" onPress={onOpenProfile} variant="secondary" fullWidth style={styles.dossierButton} />
      </GlassSurface>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: APP_SPACING.lg,
  },
  card: {
    padding: APP_SPACING['2xl'],
    gap: APP_SPACING.xl,
  },
  featuredTagWrap: {
    position: 'absolute',
    top: APP_SPACING.md,
    right: APP_SPACING.md,
    zIndex: 1,
  },
  featuredTagText: {
    fontFamily: APP_FONTS.bodyBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: 'rgba(255,144,109,0.5)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: APP_SPACING.md,
  },
  avatarWrap: {
    width: 80,
    height: 80,
  },
  checkBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 4,
    borderColor: APP_COLORS.backgroundBase,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontFamily: APP_FONTS.heading,
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: -0.6,
    color: APP_COLORS.textPrimary,
  },
  role: {
    fontFamily: APP_FONTS.bodyMedium,
    fontSize: 14,
    color: APP_COLORS.textSecondary,
  },
  safetyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: APP_COLORS.backgroundElevated,
  },
  expertiseSection: {
    gap: APP_SPACING.sm,
  },
  expertiseLabel: {
    fontFamily: APP_FONTS.bodyBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: APP_COLORS.textSecondary,
  },
  expertiseRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: APP_SPACING.xs,
  },
  expertiseChip: {
    backgroundColor: APP_COLORS.backgroundInput,
    borderRadius: APP_RADIUS.pill,
    paddingHorizontal: APP_SPACING.sm,
    paddingVertical: APP_SPACING.xxs,
  },
  expertiseChipText: {
    fontFamily: APP_FONTS.bodyMedium,
    fontSize: 12,
    fontWeight: '500',
    color: APP_COLORS.textSecondary,
  },
  infoPanel: {
    backgroundColor: APP_COLORS.backgroundElevated,
    borderRadius: APP_RADIUS['2xl'],
    padding: APP_SPACING.md,
    gap: APP_SPACING.xxs,
  },
  infoPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: APP_SPACING.xs,
  },
  infoPanelLabel: {
    fontFamily: APP_FONTS.bodyBold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: APP_COLORS.textPrimary,
  },
  infoPanelText: {
    fontFamily: APP_FONTS.body,
    fontSize: 14,
    lineHeight: 20,
    color: APP_COLORS.textSecondary,
  },
  dossierButton: {
    backgroundColor: APP_COLORS.backgroundInput,
    borderRadius: APP_RADIUS.pill,
  },
})
