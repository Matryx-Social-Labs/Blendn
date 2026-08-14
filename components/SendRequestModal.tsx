import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native'
import Avatar from './ui/Avatar'
import GlassSurface from './ui/GlassSurface'
import Typography from './Typography'
import { APP_COLORS, APP_RADIUS, APP_SPACING } from '../lib/theme'

const NOTE_MAX_LENGTH = 120
const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 }

interface SendRequestModalProps {
  visible: boolean
  recipientName: string
  recipientAvatar?: string | null
  onClose: () => void
  onSend: (note: string) => Promise<void>
}

// Centered "Send Request" modal — matches Figma's rounded-all-corners glass panel
// (not a bottom sheet, unlike ActionTray.tsx's tray pattern).
export default function SendRequestModal({
  visible,
  recipientName,
  recipientAvatar,
  onClose,
  onSend,
}: SendRequestModalProps) {
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (visible) {
      setNote('')
      setSending(false)
    }
  }, [visible])

  const handleSend = async () => {
    if (sending) return
    setSending(true)
    try {
      await onSend(note.trim())
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.fullscreen}>
        <Pressable style={styles.backdrop} onPress={sending ? undefined : onClose} />
        <GlassSurface intensity={20} tint="rgba(15,14,14,0.4)" borderRadius={APP_RADIUS['3xl']} style={styles.panel}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Typography variant="h3" style={styles.title}>Send Request</Typography>
              <Typography variant="caption" style={styles.subtitle}>
                Start a conversation with {recipientName}
              </Typography>
            </View>
            <Pressable onPress={sending ? undefined : onClose} hitSlop={HIT_SLOP} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={18} color={APP_COLORS.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.content}>
            {!!recipientAvatar && (
              <View style={styles.contextCard}>
                <Avatar source={recipientAvatar} size={40} />
                <View style={styles.contextText}>
                  <Typography variant="tiny" style={styles.contextLabel}>Connecting</Typography>
                  <Typography variant="body2" style={styles.contextValue}>You&apos;re reaching out</Typography>
                </View>
              </View>
            )}

            <View style={styles.noteSection}>
              <View style={styles.noteHeader}>
                <Typography variant="tiny" style={styles.noteLabel}>Personal Note</Typography>
                <Typography variant="tiny" style={styles.noteCount}>
                  Optional • {note.length}/{NOTE_MAX_LENGTH}
                </Typography>
              </View>
              <TextInput
                style={styles.textarea}
                placeholder="Say something nice..."
                placeholderTextColor={APP_COLORS.textTertiary}
                value={note}
                onChangeText={(text) => setNote(text.slice(0, NOTE_MAX_LENGTH))}
                multiline
                maxLength={NOTE_MAX_LENGTH}
                editable={!sending}
              />
            </View>
          </View>

          <View style={styles.footer}>
            <Pressable onPress={handleSend} disabled={sending} style={styles.sendBtnWrap} accessibilityRole="button" accessibilityLabel="Send request">
              <LinearGradient
                colors={APP_COLORS.accentGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendBtn}
              >
                {sending ? (
                  <ActivityIndicator size="small" color={APP_COLORS.onAccent} />
                ) : (
                  <>
                    <Typography variant="h4" style={styles.sendBtnText}>Send request</Typography>
                    <Ionicons name="send" size={16} color={APP_COLORS.onAccent} />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </View>
        </GlassSurface>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: APP_SPACING.xl,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: {
    width: '100%',
    maxWidth: 420,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: APP_SPACING.xl,
    paddingTop: APP_SPACING.xl,
    paddingBottom: APP_SPACING.md,
  },
  headerText: {
    flex: 1,
    gap: APP_SPACING.xxs,
  },
  title: {
    color: APP_COLORS.textPrimary,
  },
  subtitle: {
    color: APP_COLORS.textSecondary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: APP_COLORS.backgroundInput,
  },
  content: {
    paddingHorizontal: APP_SPACING.xl,
    paddingVertical: APP_SPACING.md,
    gap: APP_SPACING['2xl'],
  },
  contextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: APP_SPACING.md,
    backgroundColor: 'rgba(39,37,37,0.4)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    borderRadius: APP_RADIUS['2xl'],
    padding: APP_SPACING.md,
  },
  contextText: {
    gap: 2,
  },
  contextLabel: {
    color: APP_COLORS.accent,
  },
  contextValue: {
    color: APP_COLORS.textPrimary,
  },
  noteSection: {
    gap: APP_SPACING.sm,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteLabel: {
    color: APP_COLORS.textSecondary,
  },
  noteCount: {
    color: APP_COLORS.textTertiary,
    textTransform: 'none',
    letterSpacing: 0,
  },
  textarea: {
    backgroundColor: APP_COLORS.backgroundElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: APP_COLORS.separator,
    borderRadius: APP_RADIUS['2xl'],
    padding: APP_SPACING.md,
    minHeight: 100,
    color: APP_COLORS.textPrimary,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  footer: {
    paddingHorizontal: APP_SPACING.xl,
    paddingBottom: APP_SPACING['2xl'],
    paddingTop: APP_SPACING.sm,
  },
  sendBtnWrap: {
    borderRadius: APP_RADIUS.pill,
    overflow: 'hidden',
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: APP_SPACING.xs,
    minHeight: 56,
    borderRadius: APP_RADIUS.pill,
  },
  sendBtnText: {
    color: APP_COLORS.onAccent,
  },
})
