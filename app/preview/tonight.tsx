import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { RoomStage } from '../../components/blendn/RoomStage'
import { TonightView } from '../../components/blendn/TonightView'
import type { TonightEvent } from '../../lib/useTonight'

/**
 * The Blend'n screen's Tonight mode, with fixtures.
 *
 * Deep-link `exp+blendn:///preview/tonight`.
 *
 * The real Tonight needs you *not* checked in, and the seeded staging account
 * is live in a room — checking it out to look at a deck would spend the demo
 * state. This draws the deck and the venue pass (you are standing inside the
 * first event) with no network, in the worst case first: a long title on the
 * top card.
 */
const unsplash = (id: string) => `https://images.unsplash.com/${id}?w=900&q=80&auto=format&fit=crop`
const at = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString()

const EVENTS: TonightEvent[] = [
  {
    id: 'jazz',
    title: 'Sunday Jazz Brunch at The Humming Tree — Late Session',
    venue: 'The Humming Tree',
    photo: unsplash('photo-1783496116757-cf1fd14a4621'),
    startsAt: at(-40),
    endsAt: at(120),
    distanceKm: 0.3,
    hereCount: 23,
    capacity: 80,
    going: true,
    tasteMatchCount: 4,
  },
  {
    id: 'founders',
    title: 'Founders Breakfast Club',
    venue: 'Third Wave, Indiranagar',
    photo: unsplash('photo-1590650046871-92c887180603'),
    startsAt: at(35),
    endsAt: at(155),
    distanceKm: 1.4,
    hereCount: 6,
    capacity: 30,
    going: false,
    tasteMatchCount: null,
  },
  {
    id: 'comedy',
    title: 'Open Mic Comedy Night',
    venue: 'Canvas Laugh Club',
    photo: unsplash('photo-1728674115193-6febdf9fe365'),
    startsAt: at(150),
    endsAt: at(270),
    distanceKm: 3.8,
    hereCount: 0,
    capacity: 120,
    going: false,
    tasteMatchCount: null,
  },
  {
    id: 'founders-2',
    title: 'Product Folks Mixer',
    venue: 'Bhive, HSR Layout',
    photo: unsplash('photo-1568992687947-868a62a9f521'),
    startsAt: at(-10),
    endsAt: at(100),
    distanceKm: 5.2,
    hereCount: 41,
    capacity: 60,
    going: false,
    tasteMatchCount: 7,
  },
]

export default function TonightPreview() {
  const insets = useSafeAreaInsets()
  return (
    <RoomStage onClosed={() => router.back()}>
      <TonightView
        events={EVENTS}
        loading={false}
        insideEvent={EVENTS[0]}
        tasteMatchCount={4}
        checkingIn={false}
        onOpenEvent={() => {}}
        onSeeAll={() => {}}
        onBrowse={() => {}}
        onCheckIn={() => {}}
        topInset={insets.top + 64}
        bottomInset={insets.bottom}
      />
    </RoomStage>
  )
}
