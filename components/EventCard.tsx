import { Ionicons } from '@expo/vector-icons'
import type { BlendnEvent } from '../lib/api'
import * as Haptics from 'expo-haptics'
import React, { memo, useEffect, useMemo, useRef } from 'react'
import { ActivityIndicator, Animated as RNAnimated, StyleSheet, TouchableOpacity, View } from 'react-native'
import Reanimated from 'react-native-reanimated'
import { formatEventDateTime } from '../lib/time'
import { APP_COLORS, EMBER } from '../lib/theme'
import { OptimizedImage } from './OptimizedImage'
import { Typography } from './Typography'

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

  const fadeIn = useRef(new RNAnimated.Value(0)).current

  useEffect(() => {
    RNAnimated.timing(fadeIn, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [fadeIn])

  return (
    <RNAnimated.View style={{ opacity: fadeIn, transform: [{ translateY: fadeIn.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }}>
      <TouchableOpacity style={styles.eventCard} onPress={handlePress} onLongPress={handleLongPress} delayLongPress={320} accessibilityRole="button" accessibilityLabel={event.title}>
      <Reanimated.View sharedTransitionTag={`event-image-${event.id}`}>
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
      </Reanimated.View>
      
      <View style={styles.eventContent}>
        <Reanimated.Text sharedTransitionTag={`event-title-${event.id}`} style={styles.eventTitle}>
          {event.title}
        </Reanimated.Text>
        <Typography variant="body2" style={styles.eventVenue}>{event.venue_name}</Typography>
        <Typography variant="body2" style={styles.eventDescription} numberOfLines={2}>
          {event.short_description || event.description}
        </Typography>
        
        <View style={styles.eventMeta}>
          <Reanimated.Text sharedTransitionTag={`event-date-${event.id}`} style={styles.eventTime}>
            {formattedStart}
          </Reanimated.Text>
          <Typography variant="body2" style={styles.eventPrice}>
            {event.price_cents > 0 ? `₹${event.price_cents / 100}` : 'Free'}
          </Typography>
        </View>

        {/* Quick metadata row */}
        <View style={styles.metaChipsRow}>
          {!!distanceLabel && (
            <View style={[styles.chip, styles.chipNeutral]}>
              <Typography variant="caption" style={styles.chipText}>📍 {distanceLabel} away</Typography>
            </View>
          )}
          {typeof proximity?.within_radius === 'boolean' && !proximity.within_radius && (
            <View style={[styles.chip, styles.chipWarning]}>
              <Typography variant="caption" style={[styles.chipText, styles.chipWarningText]}>Move closer to venue</Typography>
            </View>
          )}
        </View>

        {/* Status indicators */}
        <View style={styles.statusRow}>
          {isCheckedIn && (
            <View style={styles.statusBadge}>
              <Typography variant="caption" style={styles.statusText}>✅ Checked In</Typography>
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
                <Typography variant="button" uppercaseButton style={styles.checkinButtonText}>Check In</Typography>
              )}
            </TouchableOpacity>
          )}
          
          {proximity && typeof proximity.distance_km === 'number' && !proximity.within_radius && (
            <View style={[styles.statusBadge, styles.distanceBadge]}>
              <Typography variant="caption" style={[styles.statusText, styles.distanceText]}>
                📍 {distanceLabel} away • within {Math.round(event.check_in_radius)}m required
              </Typography>
            </View>
          )}

          {!isEnded && (
            <TouchableOpacity 
              style={[styles.interestButton, interested && styles.interestButtonActive, interestLoading && styles.actionDisabled]}
              onPress={handleToggleInterest}
              disabled={interestLoading}
              accessibilityRole="button"
              accessibilityLabel={interested ? 'Remove from interested events' : 'Mark as interested'}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {interestLoading ? (
                <ActivityIndicator size="small" color={EMBER.accent} />
              ) : (
                <Ionicons
                  name={interested ? 'heart' : 'heart-outline'}
                  size={16}
                  color={EMBER.accent}
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
                <Typography variant="caption" style={styles.chipText}>⭐ {interestCount}</Typography>
              </View>
            )}
            {(event.max_capacity > 0) && (
              <View style={[styles.chip, (event.current_capacity / event.max_capacity) > 0.7 ? styles.chipWarning : styles.chipNeutral]}>
                <Typography variant="caption" style={(event.current_capacity / event.max_capacity) > 0.7 ? [styles.chipText, styles.chipWarningText] : styles.chipText}>
                  {capacityLabel(event.current_capacity, event.max_capacity)}
                </Typography>
              </View>
            )}
            {(event as any).tags?.slice?.(0, 3)?.map((t: string) => (
              <View key={t} style={[styles.chip, styles.chipNeutral]}>
                <Typography variant="caption" style={styles.chipText}>{t}</Typography>
              </View>
            ))}
          </View>
        </View>
      </View>
    </TouchableOpacity>
    </RNAnimated.View>
  )
})

EventCard.displayName = 'EventCard'

const styles = StyleSheet.create({
  eventCard: {
    backgroundColor: EMBER.surfaceSunken,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    marginHorizontal: 16,
    marginVertical: 10,
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  eventContent: {
    padding: 16,
  },
  eventTitle: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '700',
    color: EMBER.textPrimary,
    marginBottom: 6,
  },
  eventVenue: {
    fontSize: 13,
    color: EMBER.textSecondary,
    marginBottom: 10,
  },
  eventDescription: {
    fontSize: 14,
    color: EMBER.textSecondary,
    lineHeight: 20,
    marginBottom: 14,
  },
  eventMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  eventTime: {
    fontSize: 13,
    color: EMBER.textTertiary,
    flex: 1,
  },
  eventPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: EMBER.textPrimary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  metaChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  chipNeutral: {
    backgroundColor: EMBER.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
  },
  chipWarning: {
    backgroundColor: 'rgba(255,188,92,0.16)',
  },
  chipWarningText: {
    color: EMBER.textPrimary,
  },
  chipText: {
    fontSize: 12,
    color: EMBER.textSecondary,
  },
  statusBadge: {
    backgroundColor: 'rgba(52,199,89,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: APP_COLORS.success,
    fontWeight: '500',
  },
  distanceBadge: {
    backgroundColor: EMBER.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
  },
  distanceText: {
    color: EMBER.textSecondary,
  },
  checkinButton: {
    backgroundColor: EMBER.accent,
    paddingHorizontal: 16,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  checkinButtonText: {
    // Dark on warm, per `EMBER.onGradient`. `textPrimary` is white and was
    // legible on the old blue; it is not on this one.
    color: EMBER.onGradient,
    fontSize: 14,
    fontWeight: '600',
  },
  interestButton: {
    // The accent at low alpha, so the heart sits in a tint of the colour it is
    // drawn in rather than a tint of the previous design's.
    backgroundColor: 'rgba(255,144,109,0.15)',
    paddingHorizontal: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  interestButtonActive: {
    backgroundColor: 'rgba(255,144,109,0.26)',
  },
  interestButtonText: {
    color: '#FF7BA2',
    fontSize: 14,
    fontWeight: '600',
  },
  interestButtonTextActive: {
    color: '#FF8FB3',
  },
  secondaryRow: {
    marginTop: 8,
  },
  inlineChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
