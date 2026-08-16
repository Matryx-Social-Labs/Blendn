import { useState } from 'react'
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  PROFILE_GUTTER,
  PROFILE_SECTION_GAP,
  ProfileActions,
  ProfileBio,
  ProfileDetail,
  ProfileGallery,
  ProfileHeading,
  ProfileHero,
  ProfileInterests,
} from '../../components/profile/ProfileSections'
import { EMBER, EMBER_FONTS } from '../../lib/theme'

/**
 * The attendee profile against fixtures — frame `1141:5163`.
 *
 * Deep-link `exp+blendn:///__preview-profile`.
 *
 * The real screen needs a login, a match and a person who exists, and none of
 * those decides whether a chip wraps. What this one *does* need is the toggle:
 * the whole point of this screen is that it has two faces, and a harness that
 * only ever shows the revealed one would hide the half most likely to be wrong.
 */
const W = Dimensions.get('window').width

const PHOTOS = [
  /* Portraits, because a blurred landscape and a blurred face are not the
     same test — the face is the thing the anonymity is protecting. */
  'https://i.pravatar.cc/900?img=12',
  'https://i.pravatar.cc/900?img=33',
  'https://i.pravatar.cc/900?img=51',
]

const INTERESTS = [
  'Generative Art',
  'Editorial Design',
  'UI Architecture',
  'Cinematography',
  'Tech Ethics',
]

/* Two of theirs are yours. The gradient chip marks those, not a random one. */
const SHARED = ['UI Architecture', 'Tech Ethics']

const BIO =
  'Curating digital experiences at the intersection of bioluminescent art and functional architecture. I believe in the "No-Line" rule and the power of internal heat gradients. Currently exploring the voids of the digital gallery space.'

export default function ProfilePreview() {
  const insets = useSafeAreaInsets()
  const [revealed, setRevealed] = useState(true)

  const photos = PHOTOS
  const columnWidth = (W - PROFILE_GUTTER * 2 - 16) / 2

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 132 }}
        showsVerticalScrollIndicator={false}
      >
        <ProfileHero
          width={W}
          photos={photos}
          blurred={!revealed}
          title={revealed ? 'Julian Ember, 24' : 'Cosmic Panda'}
          subtitle={revealed ? 'Design • London' : 'Design • London'}
          pseudonym="Cosmic Panda"
        />

        <View style={styles.canvas}>
          {revealed ? (
            <View style={styles.section}>
              <ProfileHeading title="Bio" />
              <ProfileBio text={BIO} />
            </View>
          ) : null}

          <View style={styles.section}>
            <ProfileHeading title="Interests" />
            <ProfileInterests interests={INTERESTS} sharedInterests={SHARED} />
          </View>

          {revealed ? (
            <View style={styles.details}>
              <ProfileDetail label="OCCUPATION" value="Senior Creative Lead" />
              <ProfileDetail label="EDUCATION" value="Interaction Design" variant="ruled" />
            </View>
          ) : null}

          {revealed ? (
            <View style={styles.section}>
              <ProfileHeading title="Gallery" trailing={`${PHOTOS.length} photos`} />
              <ProfileGallery photos={PHOTOS.slice(1)} columnWidth={columnWidth} />
            </View>
          ) : (
            <View style={styles.section}>
              <ProfileHeading title="Still anonymous" />
              <ProfileBio text="Cosmic Panda has not revealed who they are yet. Connect, talk, and either of you can reveal when you want to." />
            </View>
          )}
        </View>
        <View style={styles.action}>
          <ProfileActions
            label="Connect"
            onPress={() => {}}
            hint="Send a request to start chatting."
          />
        </View>
      </ScrollView>

      <Pressable
        onPress={() => setRevealed((r) => !r)}
        style={[styles.toggle, { top: insets.top + 12 }]}
        accessibilityRole="button"
        accessibilityLabel="Toggle revealed state"
      >
        <Text style={styles.toggleLabel}>{revealed ? 'revealed' : 'anonymous'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  canvas: { paddingHorizontal: PROFILE_GUTTER, paddingTop: 32, gap: PROFILE_SECTION_GAP },
  section: { gap: 24 },
  details: { gap: 48 },
  action: { paddingHorizontal: PROFILE_GUTTER, paddingTop: 48 },
  toggle: {
    position: 'absolute',
    right: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(15,14,14,0.7)',
  },
  toggleLabel: {
    fontFamily: EMBER_FONTS.bodySemiBold,
    fontSize: 12,
    lineHeight: 16,
    color: EMBER.accent,
  },
})
