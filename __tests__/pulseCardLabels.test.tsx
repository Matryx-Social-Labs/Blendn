/**
 * The Pulse cards read their people line to VoiceOver and TalkBack (drive 6:
 * the label left out "12 here now"), Upcoming and Featured alike.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))
jest.mock('../components/pulse/FeedMedia', () => ({ FeedMedia: () => null }))

/* eslint-disable import/first */
import { FeaturedCard } from '../components/pulse/FeaturedCard'
import { UpcomingCard } from '../components/pulse/UpcomingCard'
/* eslint-enable import/first */

it('Upcoming: title, time, place and "12 here now" in one label', async () => {
  await render(<UpcomingCard title="Evening Ragas" timeLabel="Happening now" placeLabel="at Chowdiah Memorial Hall" peopleLabel="12 here now" onPress={jest.fn()} />)
  expect(screen.getByLabelText('Evening Ragas, Happening now, at Chowdiah Memorial Hall, 12 here now')).toBeTruthy()
})

it('Featured: the date, place and "39 going" after the title', async () => {
  await render(<FeaturedCard title="Jazz Brunch" dateLabel="Sun 19 Oct" placeLabel="at Olive Beach" peopleLabel="39 going" onPress={jest.fn()} />)
  expect(screen.getByLabelText('Jazz Brunch. Sun 19 Oct, at Olive Beach, 39 going')).toBeTruthy()
})

it('no people line, no trailing comma', async () => {
  await render(<UpcomingCard title="Founders" timeLabel="Tomorrow" onPress={jest.fn()} />)
  expect(screen.getByLabelText('Founders, Tomorrow')).toBeTruthy()
})
