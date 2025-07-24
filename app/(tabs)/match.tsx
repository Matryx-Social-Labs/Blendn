import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native'
import { NotificationHelpers } from '../../lib/notifications'
import { showUserSafetyActions } from '../../lib/safetyUtils'
import { AuthHelper, supabase } from '../../lib/supabase'

const { width, height } = Dimensions.get('window')
const CARD_HEIGHT = height * 0.7
const CARD_WIDTH = width * 0.9

interface UserProfile {
  user_id: string
  name: string
  age: number
  bio: string
  interests: string[]
  profile_photos: string[]
  distance_km: number
  mutual_events: string[]
}

export default function Match() {
  const [loading, setLoading] = useState(true)
  const [swipeLoading, setSwipeLoading] = useState(false)
  const [candidates, setCandidates] = useState<UserProfile[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [currentUser, setCurrentUser] = useState<any>(null)

  useEffect(() => {
    loadInitialData()
  }, [])

  const loadInitialData = async () => {
    try {
      console.log('🔍 [MATCH_INIT] Starting loadInitialData...');
      console.log('🔍 [MATCH_INIT] Supabase client initialized:', !!supabase);
      
      console.log('🔍 [MATCH_INIT] Getting authenticated user...');
      const authStartTime = Date.now();
      
      // Try cached session first, fallback to network call if needed
      let user = AuthHelper.getCurrentUser()
      
      if (user) {
        console.log('✅ [MATCH_INIT] Using cached user session:', user.id);
        const authEndTime = Date.now();
        console.log(`🔍 [MATCH_INIT] Auth query completed in ${authEndTime - authStartTime}ms (cached)`);
      } else {
        console.log('⚠️ [MATCH_INIT] No cached session, falling back to network call...');
        const { data: { user: networkUser }, error } = await AuthHelper.getUserWithFallback(3000)
        const authEndTime = Date.now();
        console.log(`🔍 [MATCH_INIT] Auth query completed in ${authEndTime - authStartTime}ms (network)`);
        
        if (error) {
          console.error('❌ [MATCH_INIT] Auth error:', error);
          Alert.alert('Error', 'Unable to load matching data. Please restart the app.')
          return
        }
        
        user = networkUser
      }
      
      if (!user) {
        console.error('❌ [MATCH_INIT] No authenticated user found');
        Alert.alert('Error', 'Please sign in to continue')
        return
      }

      console.log('✅ [MATCH_INIT] Authenticated user found:', user.id);
      console.log('✅ [MATCH_INIT] User email:', user.email);
      
      setCurrentUser(user)
      console.log('🔍 [MATCH_INIT] Loading swipe candidates...');
      await loadCandidates(user.id)
    } catch (error) {
      console.error('💥 [MATCH_INIT] Unexpected error:', error);
      console.error('💥 [MATCH_INIT] Error type:', typeof error);
      console.error('💥 [MATCH_INIT] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      Alert.alert('Error', 'Failed to load matching data')
    } finally {
      console.log('🏁 [MATCH_INIT] loadInitialData completed');
      setLoading(false)
    }
  }

  const loadCandidates = async (userId: string) => {
    try {
      console.log('🔍 [MATCH] Starting loadCandidates...');
      console.log('🔍 [MATCH] User ID:', userId);
      console.log('🔍 [MATCH] Supabase client initialized:', !!supabase);
      
      console.log('🔍 [MATCH] Calling RPC: get_swipe_candidates');
      console.log('🔍 [MATCH] Parameters:', {
        p_user_id: userId,
        p_limit: 10
      });
      
      const rpcStartTime = Date.now();
      
      // Add timeout wrapper to prevent infinite hanging
      const rpcPromise = supabase.rpc('get_swipe_candidates', {
        p_user_id: userId,
        p_limit: 10
      })
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Match candidates RPC timeout after 8000ms')), 8000)
      )
      
      const { data, error } = await Promise.race([rpcPromise, timeoutPromise]) as any

      const rpcEndTime = Date.now();
      console.log(`🔍 [MATCH] RPC completed in ${rpcEndTime - rpcStartTime}ms`);

      if (error) {
        console.error('❌ [MATCH] RPC error:', error);
        console.error('❌ [MATCH] Error code:', error.code);
        console.error('❌ [MATCH] Error message:', error.message);
        console.error('❌ [MATCH] Error details:', error.details);
        console.log('🔄 [MATCH] Setting empty candidates array');
        setCandidates([]);
        return
      }

      console.log('✅ [MATCH] SUCCESS: get_swipe_candidates worked!');
      console.log('✅ [MATCH] Raw candidates data:', data);
      console.log('✅ [MATCH] Data type:', typeof data);
      console.log('✅ [MATCH] Candidates count:', data?.length || 0);
      
      if (data && data.length > 0) {
        console.log('✅ [MATCH] First candidate sample:', JSON.stringify(data[0], null, 2));
      }

      setCandidates(data || [])
      setCurrentIndex(0)
      console.log(`✅ [MATCH] Successfully loaded ${data?.length || 0} candidates from database`);
    } catch (error) {
      console.error('💥 [MATCH] Unexpected error:', error);
      console.error('💥 [MATCH] Error type:', typeof error);
      console.error('💥 [MATCH] Error message:', error instanceof Error ? error.message : 'Unknown error');
      console.log('🔄 [MATCH] Setting empty candidates array due to error');
      setCandidates([]);
    }
  }

  const startPrivateConversation = async (candidate: UserProfile) => {
    try {
      const { data, error } = await supabase.rpc('get_or_create_private_conversation', {
        p_user1_id: currentUser.id,
        p_user2_id: candidate.user_id
      })

      if (error) {
        console.error('Error creating conversation:', error)
        Alert.alert('Error', 'Failed to start conversation')
        return
      }

      const result = data[0]
      if (result.success) {
        router.push({
          pathname: '/private-chat/[conversationId]' as any,
          params: {
            conversationId: result.conversation_id,
            otherUserName: candidate.name,
            otherUserId: candidate.user_id
          }
        })
      } else {
        Alert.alert('Error', result.message)
      }
    } catch (error) {
      console.error('Error starting conversation:', error)
      Alert.alert('Error', 'Something went wrong')
    }
  }

  const handleSwipe = async (isLike: boolean) => {
    if (!currentUser || currentIndex >= candidates.length) return

    const currentCandidate = candidates[currentIndex]
    setSwipeLoading(true)

    try {
      const { data, error } = await supabase.rpc('record_swipe', {
        p_swiper_id: currentUser.id,
        p_swiped_id: currentCandidate.user_id,
        p_is_like: isLike
      })

      if (error) {
        console.error('Error recording swipe:', error)
        Alert.alert('Error', 'Failed to record swipe')
        return
      }

      const result = data[0]
      
      if (result.success) {
        if (result.is_match) {
          // Send match notification to the other user
          try {
            await NotificationHelpers.matchNotification(
              'Someone', // We don't have current user's name here, could be improved
              currentCandidate.user_id
            );
          } catch (error) {
            console.error('Failed to send match notification:', error);
          }

          Alert.alert(
            '🎉 It\'s a Match!',
            `You and ${currentCandidate.name} liked each other! Start chatting now.`,
            [
              { text: 'Keep Swiping', style: 'cancel' },
              { 
                text: 'Start Chat', 
                onPress: async () => {
                  await startPrivateConversation(currentCandidate)
                }
              }
            ]
          )
        }

        // Move to next candidate
        if (currentIndex < candidates.length - 1) {
          setCurrentIndex(currentIndex + 1)
        } else {
          // Load more candidates
          await loadCandidates(currentUser.id)
        }
      } else {
        Alert.alert('Info', result.message)
      }
    } catch (error) {
      console.error('Error handling swipe:', error)
      Alert.alert('Error', 'Something went wrong')
    } finally {
      setSwipeLoading(false)
    }
  }

  const renderProfileCard = () => {
    if (currentIndex >= candidates.length) {
      return (
        <View style={styles.noMoreContainer}>
          <Text style={styles.noMoreIcon}>🔍</Text>
          <Text style={styles.noMoreTitle}>No More Profiles</Text>
          <Text style={styles.noMoreText}>
            Check back later for new people to match with!
          </Text>
          <TouchableOpacity 
            style={styles.refreshButton}
            onPress={() => loadCandidates(currentUser.id)}
          >
            <Text style={styles.refreshButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      )
    }

    const profile = candidates[currentIndex]
    const photoUrl = profile.profile_photos && profile.profile_photos.length > 0 
      ? profile.profile_photos[0] 
      : 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=400' // Placeholder

    return (
      <View style={styles.cardContainer}>
        <View style={styles.card}>
          <Image 
            source={{ uri: photoUrl }}
            style={styles.profileImage}
            resizeMode="cover"
          />
          
          <View style={styles.gradient} />
          
          <View style={styles.profileInfo}>
            <View style={styles.nameSection}>
              <Text style={styles.name}>
                {profile.name}, {profile.age}
              </Text>
              {profile.distance_km > 0 && (
                <View style={styles.distanceTag}>
                  <Ionicons name="location" size={14} color="#fff" />
                  <Text style={styles.distance}>{profile.distance_km}km away</Text>
                </View>
              )}
            </View>
            
            <Text style={styles.bio}>{profile.bio}</Text>
            
            {profile.mutual_events && profile.mutual_events.length > 0 && (
              <View style={styles.mutualEvents}>
                <Text style={styles.mutualTitle}>🎉 Mutual Events</Text>
                {profile.mutual_events.slice(0, 2).map((event, index) => (
                  <Text key={index} style={styles.mutualEvent}>• {event}</Text>
                ))}
              </View>
            )}
            
            {profile.interests && profile.interests.length > 0 && (
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.interestsContainer}
              >
                {profile.interests.map((interest, index) => (
                  <View key={index} style={styles.interestTag}>
                    <Text style={styles.interestText}>{interest}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </View>
    )
  }

  const renderActionButtons = () => {
    if (currentIndex >= candidates.length) return null

    const currentCandidate = candidates[currentIndex]

    return (
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={[styles.actionButton, styles.passButton]}
          onPress={() => handleSwipe(false)}
          disabled={swipeLoading}
        >
          <Ionicons name="close" size={32} color="#FF6B6B" />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.actionButton, styles.safetyButton]}
          onPress={() => showUserSafetyActions(
            currentCandidate.name, 
            currentCandidate.user_id,
            () => {
              // On block, move to next candidate
              if (currentIndex < candidates.length - 1) {
                setCurrentIndex(currentIndex + 1)
              } else {
                loadCandidates(currentUser.id)
              }
            }
          )}
          disabled={swipeLoading}
        >
          <Ionicons name="shield-outline" size={24} color="#666" />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.actionButton, styles.superLikeButton]}
          onPress={() => Alert.alert('Coming Soon!', 'Super Like feature will be available soon!')}
          disabled={swipeLoading}
        >
          <Ionicons name="star" size={28} color="#00D4FF" />
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.actionButton, styles.likeButton]}
          onPress={() => handleSwipe(true)}
          disabled={swipeLoading}
        >
          <Ionicons name="heart" size={32} color="#4CAF50" />
        </TouchableOpacity>
      </View>
    )
  }

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>💕</Text>
      <Text style={styles.emptyTitle}>Start Matching!</Text>
      <Text style={styles.emptyText}>
        Check in to events to start seeing profiles of other attendees and make meaningful connections!
      </Text>
      <TouchableOpacity 
        style={styles.eventsButton}
        onPress={() => router.push('/(tabs)/events' as any)}
      >
        <Text style={styles.eventsButtonText}>Browse Events</Text>
      </TouchableOpacity>
    </View>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B6B" />
        <Text style={styles.loadingText}>Finding potential matches...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Match 💕</Text>
        <Text style={styles.headerSubtitle}>
          {candidates.length > 0 
            ? `${candidates.length - currentIndex} people nearby`
            : 'Connect with people at your events'
          }
        </Text>
      </View>
      
      {swipeLoading && (
        <View style={styles.swipeLoadingOverlay}>
          <ActivityIndicator size="large" color="#FF6B6B" />
        </View>
      )}

      {candidates.length === 0 ? (
        renderEmptyState()
      ) : (
        <View style={styles.matchContainer}>
          {renderProfileCard()}
          {renderActionButtons()}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#666',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  swipeLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  matchContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  cardContainer: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    marginBottom: 30,
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  profileInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
  },
  nameSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  name: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  distanceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  distance: {
    marginLeft: 4,
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  bio: {
    fontSize: 16,
    color: '#fff',
    lineHeight: 22,
    marginBottom: 12,
  },
  mutualEvents: {
    marginBottom: 12,
  },
  mutualTitle: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: '600',
    marginBottom: 4,
  },
  mutualEvent: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.9,
  },
  interestsContainer: {
    flexDirection: 'row',
    marginTop: 8,
  },
  interestTag: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    marginRight: 8,
  },
  interestText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  actionButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  passButton: {
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#FF6B6B',
  },
  superLikeButton: {
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#00D4FF',
    width: 50,
    height: 50,
    borderRadius: 25,
  },
  safetyButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ddd',
    width: 45,
    height: 45,
    borderRadius: 22.5,
  },
  likeButton: {
    backgroundColor: '#fff',
    borderWidth: 3,
    borderColor: '#4CAF50',
  },
  noMoreContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  noMoreIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  noMoreTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  noMoreText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  refreshButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  },
  refreshButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 80,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 40,
  },
  eventsButton: {
    backgroundColor: '#FF6B6B',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 25,
  },
  eventsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
}) 