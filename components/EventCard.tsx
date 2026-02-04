import React, { memo, useEffect, useMemo, useRef } from 'react'
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native'
import { formatEventDateTime } from '../lib/time'
import OptimizedImage from './OptimizedImage'
import Typography from './Typography'

interface Event {
  id: string
  title: string
  description: string
  short_description: string
  venue_name: string
  address: string
  start_time: string
  end_time: string
  price_cents: number
  max_capacity: number
  current_capacity: number
  cover_image_url: string | null
  category: string
  city?: string
  check_in_radius: number
  latitude: number
  longitude: number
}

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
  capacityHint?: string
  tags?: string[]
  onPress: (event: Event) => void
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
  onPress,
  onCheckIn,
  onToggleInterest
}) => {
  const handlePress = () => onPress(event)
  const handleCheckIn = () => onCheckIn(event)
  const handleToggleInterest = () => onToggleInterest(event)

  const formattedStart = useMemo(() => formatEventDateTime(event.start_time, { showTimezoneIfDifferent: true }), [event.start_time])
  const distanceLabel = useMemo(() => {
    if (!proximity || typeof proximity.distance_km !== 'number') return ''
    const meters = Math.round(proximity.distance_km * 1000)
    if (meters < 1000) return `${meters}m`
    const km = (meters / 1000)
    return `${km.toFixed(km >= 10 ? 0 : 1)} km`
  }, [proximity])

  const fadeIn = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start()
  }, [fadeIn])

  return (
    <Animated.View style={{ opacity: fadeIn, transform: [{ translateY: fadeIn.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }}>
      <TouchableOpacity style={styles.eventCard} onPress={handlePress}>
      {event.cover_image_url ? (
        <OptimizedImage
          source={event.cover_image_url}
          style={styles.eventImage}
          contentFit="cover"
          width={400}
          height={200}
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={[styles.eventImage, { backgroundColor: '#1f1f1f' }]} />
      )}
      
      <View style={styles.eventContent}>
        <Typography variant="h3" style={styles.eventTitle}>{event.title}</Typography>
        <Typography variant="body2" style={styles.eventVenue}>{event.venue_name}</Typography>
        <Typography variant="body2" style={styles.eventDescription} numberOfLines={2}>
          {event.short_description || event.description}
        </Typography>
        
        <View style={styles.eventMeta}>
          <Typography variant="caption" style={styles.eventTime}>{formattedStart}</Typography>
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
              style={styles.checkinButton}
              onPress={handleCheckIn}
            >
              <Typography variant="button" uppercaseButton style={styles.checkinButtonText}>Check In</Typography>
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
              style={[styles.interestButton, interested && styles.interestButtonActive]}
              onPress={handleToggleInterest}
            >
              <Typography variant="body2" style={[styles.interestButtonText, interested && styles.interestButtonTextActive]}>
                {interested ? '♥︎' : '♡'}
              </Typography>
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
                <Typography variant="caption" style={[styles.chipText, (event.current_capacity / event.max_capacity) > 0.7 && styles.chipWarningText]}>
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
    </Animated.View>
  )
})

EventCard.displayName = 'EventCard'

const styles = StyleSheet.create({
  eventCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 18,
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
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  eventContent: {
    padding: 16,
  },
  eventTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  eventVenue: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 20,
    marginBottom: 12,
  },
  eventMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  eventTime: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    flex: 1,
  },
  eventPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  chipWarning: {
    backgroundColor: 'rgba(255,188,92,0.16)',
  },
  chipWarningText: {
    color: '#FFB24A',
  },
  chipText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
  },
  statusBadge: {
    backgroundColor: 'rgba(88, 201, 119, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#7DE59C',
    fontWeight: '500',
  },
  distanceBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  distanceText: {
    color: 'rgba(255,255,255,0.75)',
  },
  checkinButton: {
    backgroundColor: '#2F6BFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  checkinButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  interestButton: {
    backgroundColor: 'rgba(255,45,85,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  interestButtonActive: {
    backgroundColor: 'rgba(255,45,85,0.28)',
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
})

export default EventCard

function capacityLabel(current: number, max: number): string {
  if (!max || max <= 0) return 'Capacity'
  const pct = current / max
  if (pct >= 0.95) return 'Almost full'
  if (pct >= 0.7) return 'Filling fast'
  return `${current}/${max}`
}
