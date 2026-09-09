import { ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { BroadcastNotice } from '../../components/chat/BroadcastNotice'
import { ChatBubble } from '../../components/chat/ChatBubble'
import { ChatComposer } from '../../components/chat/ChatComposer'
import { SystemNotice } from '../../components/chat/SystemNotice'
import { TypingIndicator } from '../../components/chat/TypingIndicator'
import { EMBER } from '../../lib/theme'

/**
 * Every kind of row the room can draw, on fixtures. Frame `1141:5498`.
 *
 * Deep-link `exp+blendn:///preview/chat`. Dev-only, like its siblings — see
 * `app/preview/scene.tsx`.
 *
 * ## Why a harness and not just the screen
 *
 * The real room needs a check-in, a chat group and other people talking in it.
 * Half these rows — a sponsored broadcast, an edited message, a reply with
 * reactions — need a *particular* room to exist before they can be looked at
 * even once, which in practice means they get built and never seen.
 *
 * The Scene learned this the expensive way and `docs/SCENE.md` records it: what
 * cannot be looked at cheaply does not get looked at.
 *
 * **Fixtures only.** Nothing here touches the network, and no row is styled
 * differently from the real screen's — these are the same components with
 * literal props, so if the harness looks right and the room does not, the
 * difference is data rather than layout.
 */
export default function ChatPreview() {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.feed}>
        <SystemNotice label="Today" />

        <ChatBubble
          mine={false}
          senderId="user-julian"
          roomId="preview-room"
          senderName="Cosmic Panda"
          time="14:02"
          text="Hey everyone! Super excited for tonight. Just finished setting up the main stage. The visuals are looking absolutely mental. Who's bringing the film cameras? 📸"
        />

        <ChatBubble
          mine
          senderId="me"
          roomId="preview-room"
          senderName="Me"
          time="14:05"
          text="I'm coming straight from the studio with my Leica. Can't wait to see that lighting rig in action! Are we still meeting at the lounge first?"
        />

        {/* A reply, an edit and reactions at once — the three the frame omits. */}
        <ChatBubble
          mine={false}
          senderId="user-sarah"
          roomId="preview-room"
          senderName="Velvet Heron"
          time="14:10"
          edited
          replyTo={{ senderName: 'Me', text: 'Are we still meeting at the lounge first?' }}
          reactions={{ '🔥': ['a', 'b', 'c'], '👏': ['d'] }}
          text="Lounge at nine, yes. I'll be by the back bar."
        />

        <SystemNotice label="Cosmic Panda pinned a location for the after-party" />

        <BroadcastNotice
          kind="announcement"
          time="14:20"
          text="Doors close at 23:00 sharp — if you're running late, message us here."
        />

        <BroadcastNotice
          kind="sponsored"
          time="14:22"
          text="Riso Bar next door is keeping the kitchen open for anyone from tonight."
        />

        <TypingIndicator label="Velvet Heron is typing..." />

        {/*
          The direct variant, below the room's. Same component, no avatar and no
          name -- a DM has one other person in it, so a disc and a name on every
          inbound row repeat the screen's title once per message.
        */}
        <SystemNotice label="Direct messages" />

        <ChatBubble
          variant="direct"
          mine={false}
          senderId="user-sarah"
          roomId="preview-room"
          senderName="Velvet Heron"
          time="14:31"
          text="That was a good night. Same again next month?"
        />

        <ChatBubble
          variant="direct"
          mine
          senderId="me"
          roomId="preview-room"
          senderName="Me"
          time="14:32"
          receipt="sent"
          text="Definitely. I'll watch for it on the Pulse."
        />

        <ChatBubble
          variant="direct"
          mine
          senderId="me"
          roomId="preview-room"
          senderName="Me"
          time="14:33"
          receipt="read"
          text="Read receipt on this one."
        />
      </ScrollView>

      <View style={styles.composer}>
        <ChatComposer value="" sending={false} onChangeText={() => {}} onSend={() => {}} />
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  feed: { padding: 16, gap: 24 },
  composer: { paddingBottom: 8 },
})
