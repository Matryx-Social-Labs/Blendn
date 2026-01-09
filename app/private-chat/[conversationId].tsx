import { Ionicons } from '@expo/vector-icons'
import { Audio } from 'expo-av'
import * as FileSystem from 'expo-file-system'
import { LinearGradient } from 'expo-linear-gradient'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useRef, useState } from 'react'
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import AppHeader from '../../components/AppHeader'
import OptimizedImage from '../../components/OptimizedImage'
import { NotificationHelpers } from '../../lib/notifications'
import { pickImage, uploadPhoto } from '../../lib/photoUtils'
import { showMessageReportOptions, showUserSafetyActions } from '../../lib/safetyUtils'
import { callRpc, supabase } from '../../lib/supabase'
import { setConversationLastRead } from '../../lib/unread'

interface PrivateMessage {
  message_id: string
  sender_id: string
  message_text: string
  created_at: string
  updated_at: string
}

type ChatListItem =
  | ({ kind: 'message' } & PrivateMessage)
  | { kind: 'separator'; id: string; label: string }

export default function PrivateChat() {
  const { conversationId, otherUserName, otherUserId } = useLocalSearchParams()
  const [messages, setMessages] = useState<PrivateMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const flatListRef = useRef<FlatList>(null)
  const insets = useSafeAreaInsets()
  const [isRecording, setIsRecording] = useState(false)
  const [recording, setRecording] = useState<Audio.Recording | null>(null)

  const getInitials = (name: string) => {
    if (!name) return '?'
    const trimmed = String(name).trim()
    if (!trimmed) return '?'
    const parts = trimmed.split(/\s+/)
    const first = parts[0]?.charAt(0) || ''
    const last = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) : ''
    const combined = (first + last).toUpperCase()
    return combined || '?'
  }

  useEffect(() => {
    initializeChat()
  }, [conversationId])

  useEffect(() => {
    if (!conversationId) return
    const cleanup = subscribeToMessages()
    return cleanup
  }, [conversationId])

  const initializeChat = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      setCurrentUser(user)

      if (user && conversationId) {
        await loadMessages()
      }
    } catch (error) {
      console.error('Error initializing chat:', error)
      Alert.alert('Error', 'Failed to load conversation')
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async () => {
    try {
      // Respect centralized routing; if unauthenticated, skip work silently
      if (!currentUser) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          return
        }
      }
      const { data, error } = await supabase.rpc('get_private_conversation_messages', {
        p_conversation_id: conversationId,
        p_limit: 50,
        p_offset: 0
      })

      if (error) {
        console.error('Error loading messages:', error)
        return
      }

      // Reverse to show oldest first
      setMessages((data || []).reverse())
      // Mark as read now that the user has viewed
      if (conversationId) {
        setConversationLastRead(String(conversationId)).catch(() => {})
      }
      setTimeout(() => scrollToBottom(), 100)
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
  }

  const subscribeToMessages = () => {
    // Subscribe to real-time message updates
    const channel = supabase
      .channel(`private_messages_${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'private_messages',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          const row: any = payload.new
          const newMessage: PrivateMessage = {
            message_id: row.id,
            sender_id: row.sender_id,
            message_text: row.message_text,
            created_at: row.created_at,
            updated_at: row.updated_at || row.created_at,
          }
          setMessages(prev => {
            const exists = prev.some(m => m.message_id === newMessage.message_id)
            if (exists) return prev
            return [...prev, newMessage]
          })
          setTimeout(() => scrollToBottom(), 100)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true })
    }
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || sending || !currentUser) return

    setSending(true)
    const messageText = newMessage.trim()
    setNewMessage('')

    // Optimistic UI
    const optimistic: PrivateMessage = {
      message_id: `temp-${Date.now()}`,
      sender_id: currentUser.id,
      message_text: messageText,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, optimistic])
    setTimeout(() => scrollToBottom(), 50)

    try {
      const { data, error } = await callRpc('send_private_message', {
        p_conversation_id: conversationId,
        p_message_text: messageText
      })

      if (error) {
        console.error('Error sending message:', error)
        Alert.alert('Error', 'Failed to send message')
        // Rollback optimistic
        setMessages(prev => prev.filter(m => m.message_id !== optimistic.message_id))
        setNewMessage(messageText)
        return
      }

      const result = Array.isArray(data) ? data[0] : data
      if (!result?.success) {
        Alert.alert('Error', result?.message || 'Failed to send message')
        // Rollback optimistic
        setMessages(prev => prev.filter(m => m.message_id !== optimistic.message_id))
        setNewMessage(messageText)
        return
      }

      // Notification (best-effort)
      try {
        const { data: senderProfile } = await supabase
          .from('user_profiles')
          .select('display_name')
          .eq('user_id', currentUser.id)
          .single()
        const senderName = senderProfile?.display_name || 'Someone'
        await NotificationHelpers.messageNotification(
          senderName,
          messageText,
          otherUserId as string,
          conversationId as string
        )
      } catch (notificationError) {
        console.error('Failed to send message notification:', notificationError)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      // Rollback optimistic
      setMessages(prev => prev.filter(m => m.message_id !== optimistic.message_id))
      setNewMessage(messageText)
    } finally {
      setSending(false)
    }
  }

  const formatTime = (timeString: string) => {
    const messageTime = new Date(timeString)
    const now = new Date()
    const diffMs = now.getTime() - messageTime.getTime()
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffHours < 1) {
      const diffMins = Math.floor(diffMs / 60000)
      return diffMins < 1 ? 'now' : `${diffMins}m ago`
    }
    if (diffHours < 24) {
      return `${diffHours}h ago`
    }
    if (diffDays < 7) {
      return `${diffDays}d ago`
    }
    
    return messageTime.toLocaleDateString()
  }

  const renderMessage = ({ item }: { item: PrivateMessage }) => {
    const isCurrentUser = item.sender_id === currentUser?.id
    
    const handleMessageLongPress = () => {
      if (!isCurrentUser) {
        Alert.alert(
          'Message Options',
          'What would you like to do with this message?',
          [
            {
              text: 'Report Message',
              onPress: () => {
                showMessageReportOptions(item.message_id, 'private')
              }
            },
            {
              text: 'Cancel',
              style: 'cancel'
            }
          ]
        )
      }
    }
    
    // Simple type inference from URL for media
    const lower = String(item.message_text || '').toLowerCase()
    const isImage = lower.startsWith('http') && /(\.jpg|\.jpeg|\.png|\.webp)$/i.test(lower)
    const isAudio = lower.startsWith('http') && /(\.m4a|\.mp3|\.aac|\.wav|\.ogg)$/i.test(lower)

    return (
      <TouchableOpacity
        style={[styles.messageRow, isCurrentUser ? styles.myRow : styles.otherRow]}
        onLongPress={handleMessageLongPress}
        delayLongPress={500}
        activeOpacity={0.7}
      >
        {!isCurrentUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(String(otherUserName || 'User'))}</Text>
          </View>
        )}
        <View style={[styles.messageContainer, isCurrentUser ? styles.myMessageContainer : styles.otherMessageContainer]}>
          <View style={[
            styles.messageBubble,
            isCurrentUser ? styles.myMessageBubble : styles.otherMessageBubble
          ]}>
            {isImage ? (
              <OptimizedImage
                source={item.message_text}
                style={{ width: 220, height: 160, borderRadius: 14 }}
                contentFit="cover"
              />
            ) : isAudio ? (
              <VoiceNote uri={item.message_text} />
            ) : (
              <Text style={[
                styles.messageText,
                isCurrentUser ? styles.myMessageText : styles.otherMessageText
              ]}>
                {item.message_text}
              </Text>
            )}
          </View>
          <Text style={[
            styles.messageTime,
            isCurrentUser ? styles.myMessageTime : styles.otherMessageTime
          ]}>
            {formatTime(item.created_at)}
          </Text>
        </View>
      </TouchableOpacity>
    )
  }

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>💬</Text>
      <Text style={styles.emptyTitle}>Start the conversation!</Text>
      <Text style={styles.emptyText}>
        You matched with {otherUserName}. Say hi and break the ice!
      </Text>
    </View>
  )

  const toDayKey = (iso: string) => {
    const d = new Date(iso)
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
  }

  const formatDayLabel = (iso: string) => {
    const d = new Date(iso)
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)
    const sameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
    if (sameDay(d, today)) return 'Today'
    if (sameDay(d, yesterday)) return 'Yesterday'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })
  }

  const chatItems: ChatListItem[] = React.useMemo(() => {
    const items: ChatListItem[] = []
    let lastDayKey: string | null = null
    for (const m of messages) {
      const dayKey = toDayKey(m.created_at)
      if (dayKey !== lastDayKey) {
        items.push({ kind: 'separator', id: `sep-${dayKey}`, label: formatDayLabel(m.created_at) })
        lastDayKey = dayKey
      }
      items.push({ kind: 'message', ...m })
    }
    return items
  }, [messages])

  const renderSeparator = (label: string) => (
    <View style={styles.dateSeparatorContainer}>
      <View style={styles.dateSeparatorLine} />
      <Text style={styles.dateSeparatorText}>{label}</Text>
    </View>
  )

  const renderChatItem = ({ item }: { item: ChatListItem }) => {
    if (item.kind === 'separator') return renderSeparator(item.label)
    return renderMessage({ item })
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <StatusBar style="light" backgroundColor="transparent" translucent />
        <LinearGradient
          colors={["#480D37", "#000000"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* Gradient top inset to fill the status bar area on iOS */}
        <LinearGradient
          colors={["#480D37", "#000000"]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ height: insets.top, position: 'absolute', top: 0, left: 0, right: 0 }}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF6B6B" />
          <Text style={styles.loadingText}>Loading conversation...</Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="light" backgroundColor="transparent" translucent />
      <LinearGradient
        colors={["#480D37", "#000000"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Gradient top inset to fill the status bar area on iOS */}
      <LinearGradient
        colors={["#480D37", "#000000"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ height: insets.top, position: 'absolute', top: 0, left: 0, right: 0 }}
      />
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <AppHeader
          title={(otherUserName as string) || 'Chat'}
          onBack={() => router.back()}
          rightIconButton={{
            name: 'settings-outline',
            onPress: () => {
              if (otherUserId) {
                showUserSafetyActions(
                  (otherUserName as string) || 'User',
                  otherUserId as string,
                  () => router.back()
                )
              } else {
                Alert.alert('Coming Soon!', 'User profile view will be available soon!')
              }
            },
            accessibilityLabel: 'Safety options',
          }}
        />

        {/* Messages */}
        {messages.length === 0 ? (
          <View style={[styles.messagesContainer, styles.emptyListContainer]}>
            {renderEmptyState()}
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={chatItems}
            keyExtractor={(item) => item.kind === 'separator' ? item.id : item.message_id}
            renderItem={renderChatItem}
            style={styles.messagesList}
            contentContainerStyle={styles.messagesContainer}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => scrollToBottom()}
          />
        )}

        {/* Input */}
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.inputIcon} onPress={async () => {
            if (!currentUser) return
            try {
              const picked = await pickImage('library')
              if (!picked || picked.canceled) return
              const asset = picked.assets[0]
              const result = await uploadPhoto(asset.uri, currentUser.id, `pm_${conversationId}_${Date.now()}.jpg`, 'chat-media')
              if (result.success && (result.url || result.path)) {
                await callRpc('send_private_message', { p_conversation_id: conversationId, p_message_text: (result.url || result.path) })
              } else {
                Alert.alert('Upload failed', result.error || 'Could not upload image')
              }
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to send image')
            }
          }}>
            <Ionicons name="attach" size={22} color="#CFCFCF" />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={newMessage}
            onChangeText={setNewMessage}
            placeholder=""
            placeholderTextColor="rgba(255,255,255,0.6)"
            multiline
            maxLength={1000}
            editable={!sending}
          />
          <TouchableOpacity style={styles.inputIcon} onPress={async () => {
            if (!currentUser) return
            try {
              const picked = await pickImage('camera')
              if (!picked || picked.canceled) return
              const asset = picked.assets[0]
              const result = await uploadPhoto(asset.uri, currentUser.id, `pm_${conversationId}_${Date.now()}.jpg`, 'chat-media')
              if (result.success && (result.url || result.path)) {
                await callRpc('send_private_message', { p_conversation_id: conversationId, p_message_text: (result.url || result.path) })
              } else {
                Alert.alert('Upload failed', result.error || 'Could not upload image')
              }
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to send image')
            }
          }}>
            <Ionicons name="camera" size={22} color="#CFCFCF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.inputIcon} onPress={async () => {
            if (isRecording) {
              try {
                await recording?.stopAndUnloadAsync()
                const uri = recording ? recording.getURI() : null
                setIsRecording(false)
                setRecording(null)
                if (uri && currentUser) {
                  try {
                    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
                    const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
                    const { data: { session } } = await supabase.auth.getSession()
                    if (!supabaseUrl || !supabaseAnonKey || !session?.access_token) throw new Error('Missing config')
                    const fileName = `voice_${conversationId}_${Date.now()}.m4a`
                    const path = `${currentUser.id}/${fileName}`
                    const bucket = 'chat-media'
                    const uploadUrl = `${supabaseUrl}/storage/v1/object/${bucket}/${path}`
                    const result = await FileSystem.uploadAsync(uploadUrl, uri, {
                      httpMethod: 'POST',
                      headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'apikey': supabaseAnonKey,
                        'Content-Type': 'audio/m4a',
                        'x-upsert': 'false',
                      },
                      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                    })
                    if (result.status >= 200 && result.status < 300) {
                      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
                      await callRpc('send_private_message', { p_conversation_id: conversationId, p_message_text: publicUrl })
                    } else {
                      Alert.alert('Upload failed', `HTTP ${result.status}`)
                    }
                  } catch (e: any) {
                    Alert.alert('Error', e?.message || 'Failed to upload audio')
                  }
                }
              } catch (e: any) {
                setIsRecording(false)
                setRecording(null)
              }
            } else {
              try {
                const { status } = await Audio.requestPermissionsAsync()
                if (status !== 'granted') {
                  Alert.alert('Permission required', 'Microphone access is needed to record voice notes')
                  return
                }
                await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true })
                const rec = new Audio.Recording()
                await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY)
                await rec.startAsync()
                setRecording(rec)
                setIsRecording(true)
              } catch (e: any) {
                Alert.alert('Error', e?.message || 'Failed to start recording')
              }
            }
          }}>
            <Ionicons name={isRecording ? 'stop' : 'mic'} size={22} color="#CFCFCF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sendButton,
              (!newMessage.trim() || sending) && styles.sendButtonDisabled
            ]}
            onPress={sendMessage}
            disabled={!newMessage.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// Simple inline voice note player
const VoiceNote = ({ uri }: { uri: string }) => {
  const [sound, setSound] = React.useState<Audio.Sound | null>(null)
  const [playing, setPlaying] = React.useState(false)
  const [duration, setDuration] = React.useState<number | null>(null)
  const [position, setPosition] = React.useState(0)

  React.useEffect(() => {
    let isMounted = true
    const load = async () => {
      try {
        const { sound: s } = await Audio.Sound.createAsync({ uri }, { shouldPlay: false })
        if (!isMounted) return
        setSound(s)
        s.setOnPlaybackStatusUpdate((status: any) => {
          if (!status) return
          if ('durationMillis' in status && status.durationMillis != null) setDuration(status.durationMillis)
          if ('positionMillis' in status && status.positionMillis != null) setPosition(status.positionMillis)
          if ('didJustFinish' in status && status.didJustFinish) setPlaying(false)
        })
      } catch {}
    }
    load()
    return () => {
      isMounted = false
      try { sound?.unloadAsync() } catch {}
    }
  }, [uri])

  const toggle = async () => {
    try {
      if (!sound) return
      const status = await sound.getStatusAsync()
      if ((status as any).isPlaying) {
        await sound.pauseAsync()
        setPlaying(false)
      } else {
        await sound.playAsync()
        setPlaying(true)
      }
    } catch {}
  }

  const seconds = Math.floor((duration || 0) / 1000)
  const posSeconds = Math.floor(position / 1000)

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TouchableOpacity onPress={toggle} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#7B2DFA', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
        <Ionicons name={playing ? 'pause' : 'play'} size={18} color="#fff" />
      </TouchableOpacity>
      <Text style={{ color: '#FFFFFF' }}>{posSeconds}s / {seconds || 0}s</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
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
  
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    padding: 16,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 24,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 6,
  },
  myRow: {
    justifyContent: 'flex-end',
  },
  otherRow: {
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  messageContainer: {
    marginVertical: 4,
    maxWidth: '80%',
  },
  myMessageContainer: {
    alignSelf: 'flex-end',
  },
  otherMessageContainer: {
    alignSelf: 'flex-start',
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  myMessageBubble: {
    backgroundColor: '#7B2DFA',
    borderBottomRightRadius: 6,
  },
  otherMessageBubble: {
    backgroundColor: '#1F2B24',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderBottomLeftRadius: 6,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  myMessageText: {
    color: '#FFFFFF',
  },
  otherMessageText: {
    color: '#FFFFFF',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
  },
  myMessageTime: {
    color: '#B5B5B5',
    textAlign: 'right',
    marginRight: 12,
  },
  otherMessageTime: {
    color: '#B5B5B5',
    marginLeft: 12,
  },
  dateSeparatorContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  dateSeparatorLine: {
    position: 'absolute',
    top: '50%',
    left: 16,
    right: 16,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dateSeparatorText: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  inputIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#FFFFFF',
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#7B2DFA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#555',
  },
}) 