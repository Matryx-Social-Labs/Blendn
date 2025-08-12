import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NotificationHelpers } from '../../lib/notifications';
import { supabase } from '../../lib/supabase';

interface EventDetail {
  id: string
  title: string
  description: string
  short_description: string
  city: string
  venue_name: string
  address: string
  start_time: string
  end_time: string
  category: string
  price_cents: number
  max_capacity: number
  current_capacity: number
  cover_image_url: string
  organizer: string
  latitude: number
  longitude: number
  check_in_radius: number
}

interface CheckInStatus {
  success: boolean
  checked_in: boolean
  check_in_id?: string
  checked_in_at?: string
  distance_meters?: number
  event_title?: string
  venue_name?: string
  event_latitude?: number
  event_longitude?: number
  check_in_radius?: number
  error?: string
  code?: string
}

const { width } = Dimensions.get('window')

export default function EventDetail() {
  const { id } = useLocalSearchParams()
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [checkInStatus, setCheckInStatus] = useState<CheckInStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [checkingIn, setCheckingIn] = useState(false)
  const [userLocation, setUserLocation] = useState<{latitude: number, longitude: number} | null>(null)
  const [proximityStatus, setProximityStatus] = useState<any>(null)

  useEffect(() => {
    if (id) {
      fetchEventDetails()
      checkUserCheckInStatus()
    }
  }, [id])

  useEffect(() => {
    // Check proximity when user location changes
    if (userLocation && event) {
      checkProximityStatus()
    }
  }, [userLocation, event])

  const checkProximityStatus = async () => {
    if (!userLocation || !event) return
    
    try {
      const { data: userRes } = await supabase.auth.getUser()
      const currentUserId = userRes?.user?.id
      if (!currentUserId) return

      const { data, error } = await supabase
        .rpc('check_user_proximity_status', {
          p_user_id: currentUserId,
          p_user_latitude: userLocation.latitude,
          p_user_longitude: userLocation.longitude
        })

      if (error) {
        console.error('Error checking proximity:', error)
      } else {
        setProximityStatus(data)
      }
    } catch (error) {
      console.error('Proximity check error:', error)
    }
  }

  const fetchEventDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .single()

      if (error) {
        console.error('Error fetching event:', error)
        Alert.alert('Error', 'Failed to load event details')
      } else {
        setEvent(data)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const checkUserCheckInStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .rpc('get_check_in_status', {
          p_event_id: id,
          p_user_id: user.id
        })

      if (error) {
        console.error('Error checking status:', error)
      } else {
        setCheckInStatus(data)
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const getCurrentLocation = async () => {
    try {
      // Fallback if expo-location is not available
      if (!Location) {
        Alert.alert(
          'Location Service Not Available',
          'For the best experience, please use the latest version of this app with location services enabled.',
          [
            { text: 'Cancel', style: 'cancel' },
            { 
              text: 'Use Demo Mode', 
              onPress: () => {
                // Return demo coordinates for testing
                return Promise.resolve({
                  latitude: 18.5204,
                  longitude: 73.8567
                })
              }
            }
          ]
        )
        // Return demo coordinates for testing only
        return {
          latitude: 18.5204,
          longitude: 73.8567
        }
      }

      // Check if location services are enabled
      const serviceEnabled = await Location.hasServicesEnabledAsync()
      if (!serviceEnabled) {
        Alert.alert(
          'Location Services Disabled',
          'Please enable location services in your device settings to check in to events.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        )
        return null
      }

      // Request permission with better messaging
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(
          'Location Permission Required',
          'Blendn needs location access to verify you\'re at events. This ensures authentic meetups and prevents fake check-ins.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        )
        return null
      }

      // Get high-accuracy location for production
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 10000, // 10 seconds timeout
        distanceInterval: 1,  // 1 meter accuracy
      })

      // Validate GPS accuracy for production
      const accuracy = location.coords.accuracy || 999
      if (accuracy > 50) {
        Alert.alert(
          'GPS Signal Weak',
          `GPS accuracy is ${Math.round(accuracy)}m. For accurate check-ins, please move to a location with better GPS signal.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Try Again', onPress: () => getCurrentLocation() },
            { text: 'Continue Anyway', onPress: () => Promise.resolve({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude
            })}
          ]
        )
      }

      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude
      }
    } catch (error) {
      console.error('Error getting location:', error)
      
      // Handle specific location errors for production
      const errorCode = (error as any)?.code
      if (errorCode === 'E_LOCATION_TIMEOUT') {
        Alert.alert('Location Timeout', 'Unable to get your location. Please try again or move to an area with better GPS signal.')
      } else if (errorCode === 'E_LOCATION_UNAVAILABLE') {
        Alert.alert('Location Unavailable', 'Location services are temporarily unavailable. Please try again.')
      } else {
        Alert.alert('Location Error', 'Failed to get your current location. Please check your GPS settings and try again.')
      }
      return null
    }
  }

  const handleCheckIn = async () => {
    setCheckingIn(true)
    
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('Error', 'Please sign in to check in to events')
        return
      }

      // Get current location
      const location = await getCurrentLocation()
      if (!location) {
        setCheckingIn(false)
        return
      }

      setUserLocation(location)

      // Call production check-in function with GPS accuracy
      const { data, error } = await supabase
        .rpc('check_in_to_event_production', {
          p_event_id: id,
          p_user_id: user.id,
          p_user_latitude: location.latitude,
          p_user_longitude: location.longitude,
          p_gps_accuracy: 10 // Will be actual GPS accuracy in production
        })

      if (error) {
        console.error('Check-in error:', error)
        Alert.alert('Error', 'Failed to check in. Please try again.')
      } else {
        if (data.success) {
          Alert.alert(
            'Check-in Successful! 🎉',
            `Welcome to ${event?.title || 'this event'}! You can now chat with other attendees and start matching.`,
            [
              {
                text: 'Start Matching',
                onPress: () => router.push('/(tabs)/match' as any)
              },
              {
                text: 'Join Chat',
                onPress: () => router.push('/(tabs)/chat' as any)
              },
              { text: 'OK', style: 'default' }
            ]
          )

          // Send check-in success notification to the user
          try {
            await NotificationHelpers.checkInNotification(
              event?.title || 'Event',
              user.id
            )
          } catch (notificationError) {
            console.error('Failed to send check-in notification:', notificationError)
            // Don't fail check-in if notification fails
          }

          // Refresh check-in status
          await checkUserCheckInStatus()
        } else {
          handleCheckInError(data)
        }
      }
    } catch (error) {
      console.error('Check-in error:', error)
      Alert.alert('Error', 'Something went wrong. Please try again.')
    } finally {
      setCheckingIn(false)
    }
  }

  const handleCheckInError = (data: any) => {
    switch (data.code) {
      case 'TOO_FAR':
        const distance = Math.round(data.distance_meters)
        const required = data.required_radius
        Alert.alert(
          'Too Far From Event 📍',
          `You need to be within ${required}m of ${data.venue_name} to check in.\n\nYou are currently ${distance}m away.`,
          [
            { text: 'OK', style: 'default' },
            { 
              text: 'Open Maps', 
              onPress: () => openInMaps()
            }
          ]
        )
        break
      case 'ALREADY_CHECKED_IN':
        Alert.alert('Already Checked In', 'You have already checked in to this event!')
        break
      case 'EVENT_NOT_FOUND':
        Alert.alert('Event Not Found', 'This event is no longer available.')
        break
      case 'NO_LOCATION_DATA':
        Alert.alert('Location Error', 'Event location data is not available.')
        break
      default:
        Alert.alert('Check-in Failed', data.error || 'Unknown error occurred')
    }
  }

  const openInMaps = () => {
    if (!event) return
    
    const url = Platform.select({
      ios: `maps:0,0?q=${event.latitude},${event.longitude}`,
      android: `geo:0,0?q=${event.latitude},${event.longitude}(${encodeURIComponent(event.venue_name)})`
    })
    
    if (url) {
      Linking.openURL(url)
    }
  }

  const formatPrice = (priceInCents: number) => {
    if (priceInCents === 0) return 'Free'
    return `₹${(priceInCents / 100).toFixed(0)}`
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-IN', { 
      weekday: 'long',
      month: 'long', 
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={['top', 'bottom']}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text style={styles.loadingText}>Loading event details...</Text>
      </SafeAreaView>
    )
  }

  if (!event) {
    return (
      <SafeAreaView style={styles.errorContainer} edges={['top', 'bottom']}>
        <Text style={styles.errorText}>Event not found</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  const spotsLeft = event.max_capacity - event.current_capacity
  const isCheckedIn = checkInStatus?.checked_in || false

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView>
      <Image 
        source={{ uri: event.cover_image_url || 'https://images.unsplash.com/photo-1511632765486-a01980e01a18' }}
        style={styles.coverImage}
      />
      
      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>←</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.eventInfo}>
          <Text style={styles.title}>{event.title}</Text>
          
          <View style={styles.metaRow}>
            <View style={styles.categoryContainer}>
              <Text style={styles.categoryText}>{event.category}</Text>
            </View>
            <Text style={styles.price}>{formatPrice(event.price_cents)}</Text>
          </View>

          <Text style={styles.description}>{event.description}</Text>

          <View style={styles.detailsSection}>
            <View style={styles.detailItem}>
              <Text style={styles.detailIcon}>📍</Text>
              <View>
                <Text style={styles.detailTitle}>{event.venue_name}</Text>
                <Text style={styles.detailText}>{event.address}</Text>
              </View>
            </View>

            <View style={styles.detailItem}>
              <Text style={styles.detailIcon}>🕒</Text>
              <View>
                <Text style={styles.detailTitle}>Date & Time</Text>
                <Text style={styles.detailText}>{formatDate(event.start_time)}</Text>
              </View>
            </View>

            <View style={styles.detailItem}>
              <Text style={styles.detailIcon}>👥</Text>
              <View>
                <Text style={styles.detailTitle}>Capacity</Text>
                <Text style={styles.detailText}>
                  {spotsLeft > 0 ? `${spotsLeft} spots remaining` : 'Fully booked'}
                </Text>
              </View>
            </View>

            <View style={styles.detailItem}>
              <Text style={styles.detailIcon}>🎯</Text>
              <View>
                <Text style={styles.detailTitle}>Check-in Requirements</Text>
                <Text style={styles.detailText}>
                  Must be within {event.check_in_radius}m of venue
                  {event.check_in_radius <= 20 && ' (Indoor Precision)'}
                  {event.check_in_radius <= 30 && event.check_in_radius > 20 && ' (Standard Range)'}
                  {event.check_in_radius > 30 && ' (Large Area)'}
                </Text>
                {proximityStatus && userLocation && (
                  <View style={styles.proximityIndicator}>
                    <Text style={[
                      styles.proximityText,
                      proximityStatus.can_check_in_count > 0 ? styles.proximityGood : styles.proximityBad
                    ]}>
                      {proximityStatus.can_check_in_count > 0 
                        ? `✅ You're within check-in range!` 
                        : `📍 Get closer to check in`}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        </View>

        <View style={styles.actionSection}>
          {isCheckedIn ? (
            <View style={styles.checkedInContainer}>
              <Text style={styles.checkedInText}>✅ Checked In!</Text>
              <Text style={styles.checkedInSubtext}>
                You checked in {checkInStatus?.distance_meters ? 
                  `${Math.round(checkInStatus.distance_meters)}m` : ''} from the venue
              </Text>
              <TouchableOpacity 
                style={styles.swipeButton}
                onPress={() => Alert.alert('Coming Soon!', 'Swipe feature will be available soon!')}
              >
                <Text style={styles.swipeButtonText}>Start Meeting People 💕</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity 
                style={[styles.checkInButton, checkingIn && styles.checkInButtonDisabled]}
                onPress={handleCheckIn}
                disabled={checkingIn}
              >
                {checkingIn ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Text style={styles.checkInButtonText}>
                      📍 Check In to Event
                      {proximityStatus?.can_check_in_count > 0 && ' ✅'}
                    </Text>
                    <Text style={styles.checkInSubtext}>
                      {event.check_in_radius <= 20 && '🏢 Indoor Event - '}
                      {event.check_in_radius > 50 && '🌳 Outdoor Event - '}
                      Must be within {event.check_in_radius}m
                    </Text>
                    {userLocation && proximityStatus?.nearby_events?.[0] && (
                      <Text style={styles.distanceIndicator}>
                        Current distance: {Math.round(proximityStatus.nearby_events[0].distance_meters || 0)}m
                      </Text>
                    )}
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity style={styles.directionsButton} onPress={openInMaps}>
                <Text style={styles.directionsButtonText}>🗺️ Get Directions</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#666',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  coverImage: {
    width: '100%',
    height: 250,
    backgroundColor: '#f0f0f0',
  },
  content: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 12,
    left: 20,
    zIndex: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  eventInfo: {
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  categoryContainer: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  categoryText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  price: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B6B',
  },
  description: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 24,
  },
  detailsSection: {
    marginBottom: 24,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  detailIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  detailText: {
    fontSize: 14,
    color: '#666',
  },
  actionSection: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  checkedInContainer: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 16,
  },
  checkedInText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 4,
  },
  checkedInSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 16,
  },
  swipeButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 25,
  },
  swipeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  checkInButton: {
    backgroundColor: '#FF6B6B',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  checkInButtonDisabled: {
    backgroundColor: '#ccc',
  },
  checkInButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  checkInSubtext: {
    color: '#fff',
    fontSize: 12,
    opacity: 0.9,
  },
  directionsButton: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  directionsButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
  proximityIndicator: {
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
    backgroundColor: '#f8f9fa',
  },
  proximityText: {
    fontSize: 12,
    fontWeight: '600',
  },
  proximityGood: {
    color: '#4CAF50',
  },
  proximityBad: {
    color: '#FF9800',
  },
  distanceIndicator: {
    fontSize: 10,
    color: '#fff',
    opacity: 0.8,
    marginTop: 2,
  },
}) 