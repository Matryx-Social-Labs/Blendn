/**
 * The longest VARIABLE values the Pulse and N1 must hold (owner 2026-11-05): city, venue and event names, people's names,
 * counts and prices. Static copy is designed in place and is not here. A slot that holds these holds the rest.
 */
export const WORST = {
  cities: ['Thiruvananthapuram', 'Saint-Jean-sur-Richelieu', 'Vancouver North Shore'],
  city: 'Saint-Jean-sur-Richelieu',
  venue: 'Pebble, The Jungle Lounge at Palace Grounds, Jayamahal Main Road',
  title: 'Midnight Bass: a four-deck takeover with three guests from Goa, Pune and the far side of the Western Ghats',
  distance: '14 km',
  counts: { weekend: 12_480, going: 1_240 },
} as const
