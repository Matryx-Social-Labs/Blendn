/**
 * The Pulse cards read their people line to VoiceOver and TalkBack (drive 6:
 * the label left out "12 here now"), rows and Featured alike.
 */
import { render, screen } from '@testing-library/react-native'
import React from 'react'

jest.mock('../components/OptimizedImage', () => ({ OptimizedImage: () => null }))

/* eslint-disable import/first */
import { leadLabel } from '../components/pulse/LeadPager'
import { EventCard } from '../components/ds/EventCard'
/* eslint-enable import/first */

it('Row: title, place and "12 here now" in one label, led by Live', async () => {
  await render(<EventCard kind="row" title="Evening Ragas" time="Live" venue="Chowdiah Memorial Hall" here={12} onPress={jest.fn()} />)
  expect(screen.getByLabelText('Live. Evening Ragas, at Chowdiah Memorial Hall, 12 here now')).toBeTruthy()
})

it('Featured (the lead card): "Featured, 1 of 3", then the card with "39 going"', () => {
  expect(leadLabel({ id: 'a', title: 'Jazz Brunch', time: 'Sun · 11 AM', venue: 'Olive Beach', going: 39 }, 0, 3)).toBe('Featured, 1 of 3. Jazz Brunch, Sun · 11 AM, at Olive Beach, 39 going')
})

it('no people line, no trailing comma', async () => {
  await render(<EventCard kind="row" title="Founders" time="Tomorrow" venue="Toit" onPress={jest.fn()} />)
  expect(screen.getByLabelText('Founders, Tomorrow, at Toit')).toBeTruthy()
})
