import React, { memo } from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'
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
  onPress,
  onCheckIn,
  onToggleInterest
}) => {
  const handlePress = () => onPress(event)
  const handleCheckIn = () => onCheckIn(event)
  const handleToggleInterest = () => onToggleInterest(event)

  return (
    <TouchableOpacity style={styles.eventCard} onPress={handlePress}>
      {event.cover_image_url && (
        <OptimizedImage
          source={event.cover_image_url}
          style={styles.eventImage}
          contentFit="cover"
          width={400}
          height={200}
          enableProgressive
          enableWebP
          cachePolicy="memory-disk"
        />
      )}
      
      <View style={styles.eventContent}>
        <Typography variant="h3" style={styles.eventTitle}>{event.title}</Typography>
        <Typography variant="body2" style={styles.eventVenue}>{event.venue_name}</Typography>
        <Typography variant="body2" style={styles.eventDescription} numberOfLines={2}>
          {event.short_description || event.description}
        </Typography>
        
        <View style={styles.eventMeta}>
          <Typography variant="caption" style={styles.eventTime}>
            {new Date(event.start_time).toLocaleDateString()} at{' '}
            {new Date(event.start_time).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </Typography>
          <Typography variant="body2" style={styles.eventPrice}>
            {event.price_cents > 0 ? `₹${event.price_cents / 100}` : 'Free'}
          </Typography>
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
                📍 {Math.round((proximity.distance_km || 0) * 1000)}m away 
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
      </View>
    </TouchableOpacity>
  )
})

EventCard.displayName = 'EventCard'

const styles = StyleSheet.create({
  eventCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  eventVenue: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  eventDescription: {
    fontSize: 14,
    color: '#777',
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
    color: '#888',
    flex: 1,
  },
  eventPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#007AFF',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  statusBadge: {
    backgroundColor: '#E8F5E8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '500',
  },
  distanceBadge: {
    backgroundColor: '#f0f0f0',
  },
  distanceText: {
    color: '#666',
  },
  checkinButton: {
    backgroundColor: '#007AFF',
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
    backgroundColor: '#fde7ef',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  interestButtonActive: {
    backgroundColor: '#f8cfe0',
  },
  interestButtonText: {
    color: '#D81B60',
    fontSize: 14,
    fontWeight: '600',
  },
  interestButtonTextActive: {
    color: '#C2185B',
  },
})

export default EventCard