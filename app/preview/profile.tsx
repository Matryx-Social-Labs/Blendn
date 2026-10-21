import { useState } from 'react'
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Button } from '../../components/ds/Button'
import { ProfileDock } from '../../components/profile/ProfileDock'
import { ProfileHeroStage } from '../../components/profile/ProfileHeroStage'
import { ProfileBio, ProfileDetail, ProfileGallery, ProfileInterests, ProfileSection } from '../../components/profile/ProfileSections'
import { EMBER, EMBER_RADIUS, GUTTER, SPACE, TYPE } from '../../lib/theme'

/**
 * The attendee profile against fixtures — frame `1141:5163`.
 *
 * Deep-link `exp+blendn:///preview/profile`.
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
  const columnWidth = (W - GUTTER * 2 - SPACE.lg) / 2

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 132 }}
        showsVerticalScrollIndicator={false}
      >
        <ProfileHeroStage
          width={W}
          photos={revealed ? photos : []}
          name={revealed ? 'Julian Ember' : 'Cosmic Panda'}
          age={24}
          subtitle="Design • London"
          seed="Cosmic Panda"
          anonymous={!revealed}
        />

        <View style={styles.canvas}>
          {revealed ? (
            <ProfileSection title="Bio">
              <ProfileBio text={BIO} />
            </ProfileSection>
          ) : null}

          <ProfileSection title="Interests" trailing="2 shared">
            <ProfileInterests interests={INTERESTS} sharedInterests={SHARED} />
          </ProfileSection>

          {revealed ? (
            <View style={styles.details}>
              <ProfileDetail label="OCCUPATION" value="Senior Creative Lead" />
              <ProfileDetail label="EDUCATION" value="Interaction Design" variant="ruled" />
            </View>
          ) : null}

          {revealed ? (
            <ProfileSection title="Photos" trailing={`${PHOTOS.length} photos`}>
              <ProfileGallery photos={PHOTOS.slice(1)} columnWidth={columnWidth} />
            </ProfileSection>
          ) : (
            <ProfileSection title="Still anonymous">
              <ProfileBio text="Cosmic Panda has not revealed who they are yet. Connect, talk, and either of you can reveal when you want to." />
            </ProfileSection>
          )}
        </View>
      </ScrollView>
      <ProfileDock note="Connect sends a request and reveals your name and photo.">
        <Button kind="primary" icon="heart" label="Like" onPress={() => {}} style={styles.flex} />
        <Button kind="secondary" label="Connect" onPress={() => {}} style={styles.flex} />
      </ProfileDock>

      <Pressable
        onPress={() => setRevealed((r) => !r)}
        style={[styles.toggle, { top: insets.top + SPACE.md }]}
        accessibilityRole="button"
        accessibilityLabel="Toggle revealed state"
      >
        <Text style={styles.toggleLabel}>{revealed ? 'REVEALED' : 'ANONYMOUS'}</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EMBER.bg },
  canvas: { paddingHorizontal: GUTTER, paddingTop: SPACE.xxl, gap: SPACE.xxl },
  section: { gap: SPACE.lg },
  details: { gap: SPACE.xl },
  flex: { flex: 1 },
  toggle: {
    position: 'absolute',
    right: GUTTER,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.scrim,
  },
  toggleLabel: { ...TYPE.label, color: EMBER.textPrimary },
})
