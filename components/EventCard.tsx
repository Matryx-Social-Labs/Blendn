import { Ionicons } from '@expo/vector-icons'
import type { BlendnEvent } from '../lib/api'
import * as Haptics from 'expo-haptics'
import React, { memo, useMemo } from 'react'
import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native'
import { formatEventDateTime } from '../lib/time'
import { CONTROL, EMBER, EMBER_RADIUS, GUTTER, ICON, SPACE, TYPE } from '../lib/theme'
import { OptimizedImage } from './OptimizedImage'
import { Text } from './ui/Text'

/*
 * One shared definition, in `lib/api.ts`, derived from the API mapping itself.
 *
 * This was a hand-written interface duplicated across three files that pass
 * events to each other. TypeScript compared them structurally, so they drifted
 * silently until a correction in one broke a call site in another.
 */
type Event = BlendnEvent

interface EventCardProps {
  event: Event
  isCheckedIn: boolean
  canCheckIn: boolean
  interested: boolean
  isEnded: boolean
  proximity?: {
    within_radius: boolean
    distance_km: number
    can_check_in: boolean
  }
  interestCount?: number
  checkInLoading?: boolean
  interestLoading?: boolean
  capacityHint?: string
  tags?: string[]
  onPress: (event: Event) => void
  onLongPress?: (event: Event) => void
  onCheckIn: (event: Event) => void
  onToggleInterest: (event: Event) => void
}

const EventCard = memo<EventCardProps>(({
  event,
  isCheckedIn,
  canCheckIn,
  interested,
  isEnded,
  proximity,
  interestCount,
  checkInLoading = false,
  interestLoading = false,
  onPress,
  onLongPress,
  onCheckIn,
  onToggleInterest
}) => {
  const handlePress = () => onPress(event)
  const handleLongPress = () => onLongPress?.(event)
  const handleCheckIn = () => onCheckIn(event)
  const handleToggleInterest = () => {
    Haptics.selectionAsync()
    onToggleInterest(event)
  }

  const formattedStart = useMemo(() => formatEventDateTime(event.start_time, { showTimezoneIfDifferent: true, timezone: event.timezone }), [event.start_time, event.timezone])
  const distanceLabel = useMemo(() => {
    if (!proximity || typeof proximity.distance_km !== 'number') return ''
    const meters = Math.round(proximity.distance_km * 1000)
    if (meters < 1000) return `${meters}m`
    const km = (meters / 1000)
    return `${km.toFixed(km >= 10 ? 0 : 1)} km`
  }, [proximity])

  return (
    <TouchableOpacity style={styles.eventCard} onPress={handlePress} onLongPress={handleLongPress} delayLongPress={320} accessibilityRole="button" accessibilityLabel={event.title}>
      <View>
        {event.cover_image_url ? (
          <OptimizedImage
            source={event.cover_image_url}
            recyclingKey={event.cover_image_url ?? undefined}
            style={styles.eventImage}
            contentFit="cover"
            width={400}
            height={200}
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.eventImage, { backgroundColor: EMBER.surface }]} />
        )}
      </View>
      
      <View style={styles.eventContent}>
        <Text variant="title" style={styles.eventTitle}>
          {event.title}
        </Text>
        <Text variant="meta" style={styles.eventVenue}>{event.venue_name}</Text>
        <Text variant="body" color={EMBER.textSecondary} style={styles.eventDescription} numberOfLines={2}>
          {event.short_description || event.description}
        </Text>
        
        <View style={styles.eventMeta}>
          <Text variant="meta" color={EMBER.textTertiary} style={styles.eventTime}>
            {formattedStart}
          </Text>
          <Text variant="meta" color={EMBER.textPrimary}>
            {event.price_cents > 0 ? `₹${event.price_cents / 100}` : 'Free'}
          </Text>
        </View>

        {/* Quick metadata row */}
        <View style={styles.metaChipsRow}>
          {!!distanceLabel && (
            <View style={[styles.chip, styles.chipNeutral]}>
              <Text variant="caption" style={styles.chipText}>📍 {distanceLabel} away</Text>
            </View>
          )}
          {typeof proximity?.within_radius === 'boolean' && !proximity.within_radius && (
            <View style={[styles.chip, styles.chipWarning]}>
              <Text variant="caption" style={[styles.chipText, styles.chipWarningText]}>Move closer to venue</Text>
            </View>
          )}
        </View>

        {/* Status indicators */}
        <View style={styles.statusRow}>
          {isCheckedIn && (
            <View style={styles.statusBadge}>
              <Text variant="caption" style={styles.statusText}>✅ Checked In</Text>
            </View>
          )}
          
          {canCheckIn && (
            <TouchableOpacity
              style={[styles.checkinButton, checkInLoading && styles.actionDisabled]}
              onPress={handleCheckIn}
              disabled={checkInLoading}
              accessibilityRole="button"
              accessibilityLabel="Check in to event"
            >
              {checkInLoading ? (
                /*
                 * `onGradient`, matching the label beside it.
                 *
                 * This was `#FFFFFF`, which was legible while the button was
                 * iOS blue and is ~2.2:1 once the fill became `EMBER.accent`
                 * (#FF906D). The static label was moved to the dark token and
                 * the loading state was missed — so the button met contrast
                 * except at the moment it was working.
                 */
                <ActivityIndicator size="small" color={EMBER.onGradient} />
              ) : (
                <Text variant="button" color={EMBER.onGradient}>Check In</Text>
              )}
            </TouchableOpacity>
          )}
          
          {proximity && typeof proximity.distance_km === 'number' && !proximity.within_radius && (
            <View style={[styles.statusBadge, styles.distanceBadge]}>
              <Text variant="caption" style={[styles.statusText, styles.distanceText]}>
                📍 {distanceLabel} away • within {Math.round(event.check_in_radius)}m required
              </Text>
            </View>
          )}

          {!isEnded && (
            <TouchableOpacity 
              style={[styles.interestButton, interestLoading && styles.actionDisabled]}
              onPress={handleToggleInterest}
              disabled={interestLoading}
              accessibilityRole="button"
              accessibilityLabel={interested ? 'Remove from interested events' : 'Mark as interested'}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {interestLoading ? (
                <ActivityIndicator size="small" color={EMBER.textPrimary} />
              ) : (
                <Ionicons
                  name={interested ? 'heart' : 'heart-outline'}
                  size={ICON.md}
                  color={EMBER.textPrimary}
                />
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Secondary metadata: interest count, capacity, tags */}
        <View style={styles.secondaryRow}>
          <View style={styles.inlineChips}>
            {typeof interestCount === 'number' && (
              <View style={[styles.chip, styles.chipNeutral]}>
                <Text variant="caption" style={styles.chipText}>⭐ {interestCount}</Text>
              </View>
            )}
            {(event.max_capacity > 0) && (
              <View style={[styles.chip, (event.current_capacity / event.max_capacity) > 0.7 ? styles.chipWarning : styles.chipNeutral]}>
                <Text variant="caption" style={(event.current_capacity / event.max_capacity) > 0.7 ? [styles.chipText, styles.chipWarningText] : styles.chipText}>
                  {capacityLabel(event.current_capacity, event.max_capacity)}
                </Text>
              </View>
            )}
            {(event as any).tags?.slice?.(0, 3)?.map((t: string) => (
              <View key={t} style={[styles.chip, styles.chipNeutral]}>
                <Text variant="caption" style={styles.chipText}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  )
})

EventCard.displayName = 'EventCard'

const styles = StyleSheet.create({
  eventCard: {
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: EMBER_RADIUS.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EMBER.separator,
    marginHorizontal: GUTTER,
    marginVertical: SPACE.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
    overflow: 'hidden',
  },
  eventImage: {
    width: '100%',
    height: 200,
    borderTopLeftRadius: EMBER_RADIUS.lg,
    borderTopRightRadius: EMBER_RADIUS.lg,
  },
  eventContent: {
    padding: SPACE.lg,
  },
  eventTitle: {
    marginBottom: SPACE.xs,
  },
  eventVenue: {
    marginBottom: SPACE.sm,
  },
  eventDescription: {
    marginBottom: SPACE.md,
  },
  eventMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.md,
  },
  eventTime: {
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    flexWrap: 'wrap',
  },
  metaChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    marginBottom: SPACE.sm,
    flexWrap: 'wrap',
  },
  chip: {
    height: CONTROL.sm,
    paddingHorizontal: SPACE.md,
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
  },
  chipNeutral: {
    backgroundColor: EMBER.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EMBER.separator,
  },
  chipWarning: {
    backgroundColor: 'rgba(255,188,92,0.16)',
  },
  chipWarningText: {
    color: EMBER.textPrimary,
  },
  chipText: {
    ...TYPE.caption,
  },
  statusBadge: {
    backgroundColor: 'rgba(52,199,89,0.18)',
    height: CONTROL.sm,
    paddingHorizontal: SPACE.md,
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
  },
  statusText: {
    ...TYPE.caption,
    color: EMBER.success,
  },
  distanceBadge: {
    backgroundColor: EMBER.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: EMBER.separator,
  },
  distanceText: {
    color: EMBER.textSecondary,
  },
  // The check-in and heart buttons share a row, so they share a height.
  checkinButton: {
    backgroundColor: EMBER.accent,
    paddingHorizontal: SPACE.lg,
    height: CONTROL.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
  },
  interestButton: {
    backgroundColor: EMBER.surface,
    width: CONTROL.md,
    height: CONTROL.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: EMBER_RADIUS.pill,
  },
  secondaryRow: {
    marginTop: SPACE.sm,
  },
  inlineChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    flexWrap: 'wrap',
  },
  actionDisabled: {
    opacity: 0.72,
  },
})

export default EventCard

function capacityLabel(current: number, max: number): string {
  if (!max || max <= 0) return 'Capacity'
  const pct = current / max
  if (pct >= 0.95) return 'Almost full'
  if (pct >= 0.7) return 'Filling fast'
  return `${current}/${max}`
}
