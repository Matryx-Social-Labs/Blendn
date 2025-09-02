import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useRef, useState } from 'react'
import {
  Alert,
  Clipboard,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { ChatHeader, SegmentedControl } from './AppHeader'

interface Message {
  id: string
  text: string
  sender: string
  timestamp: string
  isCurrentUser: boolean
  replyTo?: Message
}

interface ModernChatProps {
  groupName?: string
  participantCount?: number
  onBack?: () => void
  onSettings?: () => void
}

export default function ModernChat({
  groupName = "Bobs Chat Room",
  participantCount = 5,
  onBack,
  onSettings
}: ModernChatProps) {
  const [selectedTab, setSelectedTab] = useState(0)
  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hello ! Nazrul How are you?',
      sender: 'Attendee #1',
      timestamp: '09:25 AM',
      isCurrentUser: false,
    },
    {
      id: '2',
      text: 'Have a great working week!! Hope you like it',
      sender: 'You',
      timestamp: '09:26 AM',
      isCurrentUser: true,
    },
    {
      id: '3',
      text: 'Hello! Jhon abraham',
      sender: 'Attendee #2',
      timestamp: '09:27 AM',
      isCurrentUser: false,
    },
    {
      id: '4',
      text: 'You did your job well!',
      sender: 'You',
      timestamp: '09:28 AM',
      isCurrentUser: true,
    },
  ])

  // Message interaction states
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null)
  const [showMessageMenu, setShowMessageMenu] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)

  const flatListRef = useRef<FlatList>(null)

  const handleSendMessage = () => {
    if (message.trim()) {
      const newMessage: Message = {
        id: Date.now().toString(),
        text: message.trim(),
        sender: 'You',
        timestamp: new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }),
        isCurrentUser: true,
        replyTo: replyingTo || undefined,
      }
      setMessages(prev => [...prev, newMessage])
      setMessage('')
      setReplyingTo(null) // Clear reply state after sending
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 100)
    }
  }

  // Message interaction handlers
  const handleMessageLongPress = (message: Message) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setSelectedMessage(message)
    setShowMessageMenu(true)
  }

  const handleReply = () => {
    if (selectedMessage) {
      setReplyingTo(selectedMessage)
      setShowMessageMenu(false)
      setSelectedMessage(null)
    }
  }

  const handleCopyMessage = async () => {
    if (selectedMessage) {
      await Clipboard.setString(selectedMessage.text)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setShowMessageMenu(false)
      setSelectedMessage(null)
      // You could show a toast notification here
    }
  }

  const handleReportMessage = () => {
    Alert.alert(
      'Report Message',
      'Are you sure you want to report this message?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Report',
          style: 'destructive',
          onPress: () => {
            // Handle report logic here
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
            setShowMessageMenu(false)
            setSelectedMessage(null)
          }
        }
      ]
    )
  }

  const renderMessage = ({ item }: { item: Message }) => (
    <TouchableOpacity
      style={[
        styles.messageRow,
        item.isCurrentUser ? styles.currentUserRow : styles.otherUserRow
      ]}
      onLongPress={() => handleMessageLongPress(item)}
      delayLongPress={500}
      activeOpacity={0.7}
    >
      {!item.isCurrentUser && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.sender.split(' ').map(word => word[0]).join('').toUpperCase()}
          </Text>
        </View>
      )}
      <View style={styles.messageContainer}>
        {!item.isCurrentUser && (
          <Text style={styles.senderName}>{item.sender}</Text>
        )}

        {/* Reply indicator */}
        {item.replyTo && (
          <View style={styles.replyContainer}>
            <View style={styles.replyLine} />
            <Text style={styles.replyText}>
              Replying to {item.replyTo.sender}: {item.replyTo.text.length > 50
                ? `${item.replyTo.text.substring(0, 50)}...`
                : item.replyTo.text}
            </Text>
          </View>
        )}

        <View style={[
          styles.messageBubble,
          item.isCurrentUser ? styles.currentUserBubble : styles.otherUserBubble
        ]}>
          <Text style={[
            styles.messageText,
            item.isCurrentUser ? styles.currentUserText : styles.otherUserText
          ]}>
            {item.text}
          </Text>
        </View>
        <Text style={[
          styles.messageTime,
          item.isCurrentUser ? styles.currentUserTime : styles.otherUserTime
        ]}>
          {item.timestamp}
        </Text>
      </View>
    </TouchableOpacity>
  )

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={["#480D37", "#000000"]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.gradientBackground}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <ChatHeader
          groupName={groupName}
          participantCount={participantCount}
          onBack={onBack}
          onSettings={onSettings}
        />

        {/* Segmented Control */}
        <SegmentedControl
          options={['Messages', 'Media', 'Links']}
          selectedIndex={selectedTab}
          onSelectionChange={setSelectedTab}
        />

        {/* Messages List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContainer}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {/* Reply indicator above input */}
        {replyingTo && (
          <View style={styles.replyInputContainer}>
            <View style={styles.replyInputContent}>
              <View style={styles.replyInputLine} />
              <View style={styles.replyInputText}>
                <Text style={styles.replyInputLabel}>Replying to {replyingTo.sender}</Text>
                <Text style={styles.replyInputMessage} numberOfLines={1}>
                  {replyingTo.text}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setReplyingTo(null)}
                style={styles.replyInputClose}
              >
                <Ionicons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.inputIcon}>
              <Ionicons name="attach" size={24} color="#666" />
            </TouchableOpacity>

            <TextInput
              style={styles.textInput}
              value={message}
              onChangeText={setMessage}
              placeholder="Write your message"
              placeholderTextColor="#999"
              multiline
              maxLength={1000}
            />

            <TouchableOpacity style={styles.inputIcon}>
              <Ionicons name="camera" size={24} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.inputIcon}>
              <Ionicons name="mic" size={24} color="#666" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.sendButton,
                !message.trim() && styles.sendButtonDisabled
              ]}
              onPress={handleSendMessage}
              disabled={!message.trim()}
            >
              <Ionicons name="send" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Message Menu Modal */}
      <Modal
        visible={showMessageMenu}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowMessageMenu(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowMessageMenu(false)}
        >
          <View style={styles.messageMenu}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleReply}
            >
              <Ionicons name="return-up-back" size={24} color="#FFFFFF" />
              <Text style={styles.menuItemText}>Reply</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuItem}
              onPress={handleCopyMessage}
            >
              <Ionicons name="copy" size={24} color="#FFFFFF" />
              <Text style={styles.menuItemText}>Copy</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuItem, styles.menuItemDestructive]}
              onPress={handleReportMessage}
            >
              <Ionicons name="flag" size={24} color="#FF6B6B" />
              <Text style={[styles.menuItemText, styles.menuItemTextDestructive]}>Report</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradientBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  messagesList: {
    flex: 1,
  },
  messagesContainer: {
    padding: 16,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginVertical: 4,
  },
  currentUserRow: {
    justifyContent: 'flex-end',
  },
  otherUserRow: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E9ECF2',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarText: {
    fontSize: 12,
    color: '#556070',
    fontWeight: '600',
  },
  messageContainer: {
    maxWidth: '75%',
  },
  senderName: {
    fontSize: 12,
    color: '#B5B5B5',
    marginBottom: 4,
    marginLeft: 8,
  },
  messageBubble: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginVertical: 2,
  },
  currentUserBubble: {
    backgroundColor: '#FF6B6B',
    borderBottomRightRadius: 6,
  },
  otherUserBubble: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e9e9e9',
    borderBottomLeftRadius: 6,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  currentUserText: {
    color: '#fff',
  },
  otherUserText: {
    color: '#333',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
  },
  currentUserTime: {
    color: '#B5B5B5',
    textAlign: 'right',
    marginRight: 8,
  },
  otherUserTime: {
    color: '#B5B5B5',
    marginLeft: 8,
  },
  inputContainer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
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
    borderColor: '#e0e0e0',
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },

  // Reply functionality styles
  replyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingLeft: 12,
  },
  replyLine: {
    width: 2,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1,
    marginRight: 8,
  },
  replyText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    flex: 1,
    fontStyle: 'italic',
  },

  // Reply input styles
  replyInputContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  replyInputContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#FF6B6B',
  },
  replyInputLine: {
    width: 2,
    height: 20,
    backgroundColor: '#FF6B6B',
    borderRadius: 1,
    marginRight: 8,
  },
  replyInputText: {
    flex: 1,
  },
  replyInputLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  replyInputMessage: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  replyInputClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  // Message menu modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageMenu: {
    backgroundColor: 'rgba(30,30,30,0.95)',
    borderRadius: 12,
    padding: 8,
    minWidth: 200,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
  },
  menuItemText: {
    fontSize: 16,
    color: '#FFFFFF',
    marginLeft: 12,
    fontWeight: '500',
  },
  menuItemDestructive: {
    // Destructive styling handled in the TouchableOpacity style array
  },
  menuItemTextDestructive: {
    color: '#FF6B6B',
  },
})
