import { MaterialIcons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { EMBER, EMBER_FONTS, EMBER_GRADIENT } from '../../lib/theme'
import OptimizedImage from '../OptimizedImage'

/**
 * One person in the room — frame `1141:4978`.
 *
 * ## The frame draws somebody this screen never has
 *
 * The card is composed for a **revealed, verified, socially-connected** person:
 * a photograph, "Principal @ Arclight Labs", a verified tick, "FEATURED", and
 * "12 MUTUAL CONNECTIONS" over a stack of faces.
 *
 * The Grid is a pseudonymous roster. `rankMatches` sends a pseudonym, an age, a
 * coarse `workField`, the shared interests, and **no photograph** for anyone who
 * has not revealed. There is no verification, no featured attendee, and the
 * friend graph is deferred — so the mutual-connections block cannot be built at
 * all.
 *
 * What survives is the card's *structure*, and it happens to fit:
 *
 *   frame slot                     what goes in it
 *   ─────────────────────────      ──────────────────────────────────────
 *   "Principal @ Arclight Labs"    `workField` — the ungated coarse bucket
 *   CORE EXPERTISE tags            the interests you actually share
 *   "12 MUTUAL CONNECTIONS" box    how many interests overlap
 *   "View Dossier"                 View Profile, plus Connect
 *
 * The mutual-connections box is the useful accident: a count above a row of
 * small things is exactly the shape an overlap needs. When the friend graph
 * lands it takes the slot back and the overlap moves up beside the name.
 *
 * ## Two buttons, one meaning each
 *
 * **Connect is the like.** It is private until it is mutual — nothing reaches
 * the other person unless they tap it too, and then the conversation opens
 * pseudonymously. It is deliberately *not* a message request: a request carries
 * your real name and photograph (`message-requests/route.ts` returns
 * `sender.name` and `sender.image` ungated), which is a strange thing to send
 * one tap from a roster of strangers you know only as pseudonyms.
 */

/** Frame `1141:4984`: 80pt, 2pt `rgba(255,144,109,0.2)`. */
const AVATAR = 80

export interface GridPerson {
  userId: string
  /** The pseudonym until they reveal. Never a real name before that. */
  name: string
  age?: number
  /** The coarse bucket — "Design", not "Principal at Swiggy". Null under 8 people. */
  workField?: string | null
  /** Names, already intersected by the server. Never their whole list. */
  sharedInterests?: string[]
  /** Empty unless they have revealed. */
  photo?: string | null
  /** In the venue right now, as opposed to checked in earlier. */
  insideNow?: boolean
  /** Whether *you* liked them. Never whether they liked you. */
  liked?: boolean
  pending?: boolean
}

export function GridCard({
  person,
  onOpenProfile,
  onConnect,
}: {
  person: GridPerson
  onOpenProfile: () => void
  onConnect: () => void
}) {
  const mark = pseudonymAvatar(person.name)
  const shared = person.sharedInterests ?? []
  const title = person.age ? `${person.name}, ${person.age}` : person.name

  return (
    <LinearGradient
      // Frame `1141:4978`: 147deg, #141313 → #0F0E0E.
      colors={[EMBER.surfaceMedia, EMBER.bg]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={styles.card}
    >
      <View style={styles.head}>
        <View>
          {person.photo ? (
            <OptimizedImage
              source={person.photo}
              recyclingKey={person.photo}
              style={styles.avatar as never}
              width={AVATAR}
              height={AVATAR}
              contentFit="cover"
            />
          ) : (
            /*
             * The generated mark, not an empty ring. Same colour and creature as
             * their match sheet and their Banter row, so one person is one face
             * across the product for as long as they are that pseudonym.
             */
            <LinearGradient colors={mark.colors} style={styles.avatar}>
              <Text style={styles.avatarGlyph} maxFontSizeMultiplier={1}>
                {mark.character}
              </Text>
            </LinearGradient>
          )}

          {/*
            Frame `1141:4985` is a verified tick, and nothing verifies anybody.
            The slot draws presence instead — the one thing about somebody in a
            room that is both true and worth knowing right now.
          */}
          {person.insideNow ? (
            <View style={styles.presence} accessibilityLabel="Here now">
              <MaterialIcons name="place" size={12} color={EMBER.onGradient} />
            </View>
          ) : null}
        </View>

        <View style={styles.headText}>
          {/* Frame `1141:4990`: Plus Jakarta Bold 24/32, tracking -0.6. */}
          <Text style={styles.name} numberOfLines={1} maxFontSizeMultiplier={1.3}>
            {title}
          </Text>
          {person.workField ? (
            /*
             * Frame `1141:4992` reads "Principal @ Arclight Labs". That is
             * `occupation`, which sits behind the identity gate and is absent
             * here. `workField` is the coarse bucket that deliberately does not:
             * "works in design" is an attribute, "Principal at Swiggy" is an
             * address.
             */
            <Text style={styles.workField} numberOfLines={1} maxFontSizeMultiplier={1.3}>
              {person.workField}
            </Text>
          ) : null}
        </View>
      </View>

      {shared.length > 0 ? (
        /*
          Frame `1141:5002` is "12 MUTUAL CONNECTIONS" over a stack of faces —
          the friend graph, which is deferred. The slot takes the interest
          overlap, which needs the same shape: a count, then the things.

          The frame's CORE EXPERTISE label above it is gone. It labelled their
          expertise, separate from the social-proof box below; both now hold the
          same thing, so keeping the label put "IN COMMON" directly above
          "2 SHARED INTERESTS" — one fact, announced twice.
        */
        <View style={styles.overlap}>
            <View style={styles.overlapHead}>
              <MaterialIcons name="join-inner" size={14} color={EMBER.accent} />
              <Text style={styles.overlapCount} maxFontSizeMultiplier={1.3}>
                {shared.length} SHARED {shared.length === 1 ? 'INTEREST' : 'INTERESTS'}
              </Text>
            </View>

            <View style={styles.tags}>
              {shared.map((interest) => (
                <View key={interest} style={styles.tag}>
                  <Text style={styles.tagLabel} maxFontSizeMultiplier={1.3}>
                    {interest}
                  </Text>
                </View>
              ))}
          </View>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          onPress={onOpenProfile}
          accessibilityRole="button"
          accessibilityLabel={`View ${person.name}'s profile`}
          style={({ pressed }) => [styles.button, styles.secondary, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryLabel} maxFontSizeMultiplier={1.3}>
            View Profile
          </Text>
        </Pressable>

        {/*
          Connect is the like. Private until mutual, and it opens a pseudonymous
          conversation — never a message request, which would hand over a real
          name and face one tap from a roster of pseudonyms.
        */}
        <Pressable
          onPress={onConnect}
          disabled={person.liked || person.pending}
          accessibilityRole="button"
          accessibilityLabel={
            person.liked
              ? `You have connected with ${person.name}`
              : `Connect with ${person.name}. They are only told if they connect back`
          }
          accessibilityState={{ disabled: person.liked || person.pending }}
          style={({ pressed }) => [
            styles.button,
            person.liked && styles.connected,
            (pressed || person.pending) && styles.pressed,
          ]}
        >
          {person.liked ? (
            <Text style={styles.connectedLabel} maxFontSizeMultiplier={1.3}>
              Connected
            </Text>
          ) : (
            <>
              <LinearGradient
                colors={[...EMBER_GRADIENT.colors]}
                start={EMBER_GRADIENT.start}
                end={EMBER_GRADIENT.end}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.connectLabel} maxFontSizeMultiplier={1.3}>
                Connect
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </LinearGradient>
  )
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },

  // Frame `1141:4978`: radius 32, p32.
  card: { borderRadius: 32, padding: 32, gap: 24, overflow: 'hidden' },

  // Frame `1141:4982`: gap 24.
  head: { flexDirection: 'row', gap: 24, alignItems: 'center' },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 2,
    borderColor: 'rgba(255,144,109,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarGlyph: { fontSize: 36, lineHeight: 44 },
  // Frame `1141:4985`: 24pt, 4pt `#0F0E0E` ring, offset -4.
  presence: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 4,
    borderColor: EMBER.bg,
    backgroundColor: EMBER.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { flex: 1, gap: 4 },
  name: {
    fontFamily: EMBER_FONTS.displayBold,
    fontSize: 24,
    lineHeight: 32,
    letterSpacing: -0.6,
    color: EMBER.textPrimary,
  },
  workField: {
    fontFamily: EMBER_FONTS.bodyMedium,
    fontSize: 14,
    lineHeight: 20,
    color: EMBER.textSecondary,
  },

  // Frame `1141:5002`: `#141313`, radius 32, p16, gap 8.
  overlap: { backgroundColor: EMBER.surfaceMedia, borderRadius: 32, padding: 16, gap: 12 },
  overlapHead: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  overlapCount: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.3,
    color: EMBER.textPrimary,
  },

  // Frame `1141:4998`: `#272525`, px12 py4, radius full.
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    backgroundColor: EMBER.surface,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  tagLabel: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 12,
    lineHeight: 16,
    // The frame's first tag is `#FF6D8D`. Every tag here is a shared interest,
    // so every one earns the accent rather than the first one arbitrarily.
    color: EMBER.gradientTo,
  },

  // Frame `1141:5018` is one full-width button; this is two, so they share the row.
  actions: { flexDirection: 'row', gap: 12 },
  button: {
    flex: 1,
    minHeight: 52,
    borderRadius: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  secondary: { backgroundColor: EMBER.surface },
  secondaryLabel: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 14,
    lineHeight: 20,
    color: EMBER.textPrimary,
  },
  connectLabel: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 14,
    lineHeight: 20,
    color: EMBER.onGradient,
  },
  connected: { backgroundColor: EMBER.surfaceSunken },
  connectedLabel: {
    fontFamily: EMBER_FONTS.bodyBold,
    fontSize: 14,
    lineHeight: 20,
    color: EMBER.accent,
  },
})
