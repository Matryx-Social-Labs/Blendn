import { MaterialIcons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { gridCardBox } from '../../lib/gridCardContent'
import { pseudonymAvatar } from '../../lib/pseudonymAvatar'
import { CONTROL, EMBER, EMBER_GRADIENT, EMBER_RADIUS, ICON, SPACE, TYPE } from '../../lib/theme'
import { OptimizedImage } from '../OptimizedImage'

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
 * ## Two actions, and they are not the same thing
 *
 *   Like     "I would talk to you"    private, symmetric, stays pseudonymous
 *   Connect  "here is who I am, why"  immediate, one-sided, and it reveals you
 *
 * A like reaches nobody unless it is returned, and the conversation it opens is
 * pseudonymous. A request returns `sender.name` and `sender.image` ungated, so
 * it hands over a real name and face — deliberately, because the anonymity
 * exists to stop people being identified, not to let people send unsolicited
 * messages without accountability.
 *
 * **Like is the prominent one.** The safe, reversible, symmetric action should
 * be the easy one; the action with a cost should take a moment. Making the
 * heavier button the more attractive one is how people end up revealing
 * themselves by reflex.
 *
 * The profile is the card itself. Three buttons for three actions would make
 * the two that matter compete, and tapping a card to open the thing it
 * describes needs no teaching.
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
  /** You are both in this field. Already computed server-side for ranking. */
  sharedWorkField?: boolean
  /** Nights you were both at, before this one. 0 when suppressed. */
  sharedEvents?: number
  /** Future events you are both going to, excluding this one. */
  sharedPlans?: number
  /** Empty unless they have revealed. */
  photo?: string | null
  /** In the venue right now, as opposed to checked in earlier. */
  insideNow?: boolean
  /** Whether *you* liked them. Never whether they liked you. */
  liked?: boolean
  /**
   * You have already sent a request. One per pair for all time
   * (`@@unique([sender_id, recipient_id])`), so this never resets.
   */
  requested?: boolean
  pending?: boolean
}

export function GridCard({
  person,
  onOpenProfile,
  onLike,
  onConnect,
  onSafety,
}: {
  person: GridPerson
  onOpenProfile: () => void
  /** The like. Private until mutual. */
  onLike: () => void
  /** Opens the composer. Sending reveals you — see `ConnectSheet`. */
  onConnect: () => void
  /** Report and block. Never optional — see below. */
  onSafety: () => void
}) {
  const mark = pseudonymAvatar(person.name)
  const title = person.age ? `${person.name}, ${person.age}` : person.name

  /*
   * The one labelled block, and which of three things fills it. Their
   * attributes go above the name; this is what you SHARE. See
   * `lib/gridCardContent.ts` for why those are kept apart.
   */
  const box = gridCardBox(person)

  return (
    <Pressable
      onPress={onOpenProfile}
      accessibilityRole="button"
      accessibilityLabel={`View ${person.name}'s profile`}
      style={({ pressed }) => pressed && styles.pressed}
    >
    <LinearGradient
      // Frame `1141:4978`: 147deg, #141313 → #0F0E0E.
      colors={[EMBER.surfaceMedia, EMBER.bg]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={styles.card}
    >
      {/*
        Report and block.
        
        The frame puts "FEATURED" in this corner and nothing is featured, so the
        slot was free. It is used for safety rather than left empty because the
        rebuild otherwise dropped the old card's safety control, and the fastest
        route to "this person is making me uncomfortable" would have gone from
        one tap here to opening a profile and finding a menu.
        
        Low contrast on purpose: always reachable, never the thing your eye
        lands on.
      */}
      <Pressable
        onPress={onSafety}
        accessibilityRole="button"
        accessibilityLabel={`Report or block ${person.name}`}
        hitSlop={12}
        style={({ pressed }) => [styles.safety, pressed && styles.pressed]}
      >
        <MaterialIcons name="more-horiz" size={ICON.md} color={EMBER.textTertiary} />
      </Pressable>

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
              {/* design-exception: glyph inside the 16pt well of a 24pt ringed dot */}
              <MaterialIcons name="place" size={12} color={EMBER.onGradient} />
            </View>
          ) : null}
        </View>

        <View style={styles.headText}>
          {/* The card's title: `TYPE.title`. */}
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

      {box ? (
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
          {/* Frame `1141:5039`: icon and label, 8 apart. */}
          <View style={styles.overlapHead}>
            <MaterialIcons
              name={
                box.kind === 'plans'
                  ? 'event-available'
                  : box.kind === 'history'
                    ? 'history'
                    : box.kind === 'interests'
                      ? 'join-inner'
                      : box.kind === 'field'
                        ? 'work-outline'
                        : 'place'
              }
              size={ICON.sm}
              color={EMBER.textSecondary}
            />
            <Text style={styles.boxLabel} maxFontSizeMultiplier={1.3}>
              {box.label}
            </Text>
          </View>

          {/* `TYPE.meta`, wraps. */}
          <Text style={styles.boxValue} maxFontSizeMultiplier={1.4}>
            {box.value}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {/*
          The like, and the prominent one. Nothing reaches them unless they tap
          it too — so the action with no cost is the action with no friction.
        */}
        <Pressable
          onPress={onLike}
          disabled={person.liked || person.pending}
          accessibilityRole="button"
          accessibilityLabel={
            person.liked
              ? `You liked ${person.name}`
              : `Like ${person.name}. They are only told if they like you back`
          }
          accessibilityState={{ disabled: person.liked || person.pending }}
          style={({ pressed }) => [
            styles.button,
            person.liked && styles.liked,
            (pressed || person.pending) && styles.pressed,
          ]}
        >
          {person.liked ? (
            <Text style={styles.likedLabel} maxFontSizeMultiplier={1.3}>
              Liked
            </Text>
          ) : (
            <>
              <LinearGradient
                colors={[...EMBER_GRADIENT.colors]}
                start={EMBER_GRADIENT.start}
                end={EMBER_GRADIENT.end}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.likeLabel} maxFontSizeMultiplier={1.3}>
                Like
              </Text>
            </>
          )}
        </Pressable>

        {/*
          The request. Quieter than the like on purpose: it reveals you, and the
          sheet says so before anything is typed.
        */}
        <Pressable
          onPress={onConnect}
          disabled={person.requested}
          accessibilityRole="button"
          accessibilityLabel={
            person.requested
              ? `You have already sent ${person.name} a request`
              : `Connect with ${person.name}. Sends a message and shows them your name and photo`
          }
          accessibilityState={{ disabled: person.requested }}
          style={({ pressed }) => [
            styles.button,
            styles.secondary,
            (pressed || person.requested) && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryLabel} maxFontSizeMultiplier={1.3}>
            {person.requested ? 'Requested' : 'Connect'}
          </Text>
        </Pressable>
      </View>
    </LinearGradient>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.7 },

  card: { borderRadius: EMBER_RADIUS.card, padding: SPACE.xl, gap: SPACE.xl, overflow: 'hidden' },
  safety: {
    position: 'absolute',
    top: SPACE.sm,
    right: SPACE.sm,
    width: CONTROL.sm,
    height: CONTROL.sm,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },

  head: { flexDirection: 'row', gap: SPACE.xl, alignItems: 'center' },
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
  // design-exception: emoji glyph sized to the 80pt avatar disc
  avatarGlyph: { fontSize: 36, lineHeight: 44 },
  // Frame `1141:4985`: 24pt, 4pt `#0F0E0E` ring, offset -4.
  presence: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: EMBER_RADIUS.pill,
    borderWidth: 4,
    borderColor: EMBER.bg,
    backgroundColor: EMBER.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headText: { flex: 1, gap: SPACE.xs },
  name: { ...TYPE.title },
  workField: { ...TYPE.meta },

  overlap: { backgroundColor: EMBER.surfaceMedia, borderRadius: EMBER_RADIUS.lg, padding: SPACE.lg, gap: SPACE.md },
  overlapHead: { flexDirection: 'row', gap: SPACE.sm, alignItems: 'center' },
  // Uppercase in the string (`lib/gridCardContent.ts`).
  boxLabel: { ...TYPE.label, color: EMBER.textPrimary },
  boxValue: { ...TYPE.meta },

  // Frame `1141:5018` is one full-width button; this is two, so they share the row.
  actions: { flexDirection: 'row', gap: SPACE.md },
  button: {
    flex: 1,
    minHeight: CONTROL.md,
    borderRadius: EMBER_RADIUS.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.md,
    overflow: 'hidden',
  },
  secondary: { backgroundColor: EMBER.surface },
  secondaryLabel: { ...TYPE.button },
  likeLabel: { ...TYPE.button, color: EMBER.onGradient },
  liked: { backgroundColor: EMBER.surface },
  likedLabel: { ...TYPE.button, color: EMBER.textSecondary },
})
