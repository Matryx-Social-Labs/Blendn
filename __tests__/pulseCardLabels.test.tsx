/**
 * The Pulse cards read their people line to VoiceOver and TalkBack (drive 6:
 * the label left out "12 here now"), rows and Featured alike.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))
jest.mock('../components/pulse/FeedMedia', () => ({ FeedMedia: () => null }))

/* eslint-disable import/first */
import { FeaturedCard } from '../components/pulse/FeaturedCard'
import { EventCard } from '../components/ds/EventCard'
/* eslint-enable import/first */

it('Row: title, place and "12 here now" in one label, led by Live', async () => {
  await render(<EventCard kind="row" title="Evening Ragas" time="Live" venue="Chowdiah Memorial Hall" here={12} onPress={jest.fn()} />)
  expect(screen.getByLabelText('Live. Evening Ragas, at Chowdiah Memorial Hall, 12 here now')).toBeTruthy()
})

it('Featured: the date, place and "39 going" after the title', async () => {
  await render(<FeaturedCard title="Jazz Brunch" dateLabel="Sun 19 Oct" placeLabel="at Olive Beach" peopleLabel="39 going" onPress={jest.fn()} />)
  expect(screen.getByLabelText('Jazz Brunch. Sun 19 Oct, at Olive Beach, 39 going')).toBeTruthy()
})

it('no people line, no trailing comma', async () => {
  await render(<EventCard kind="row" title="Founders" time="Tomorrow" venue="Toit" onPress={jest.fn()} />)
  expect(screen.getByLabelText('Founders, Tomorrow, at Toit')).toBeTruthy()
})
