import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useRef, useState } from 'react'
import {
    FlatList,
    KeyboardAvoidingView,
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
      }
      setMessages(prev => [...prev, newMessage])
      setMessage('')
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 100)
    }
  }

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[
      styles.messageRow,
      item.isCurrentUser ? styles.currentUserRow : styles.otherUserRow
    ]}>
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
    </View>
  )

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
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
})
