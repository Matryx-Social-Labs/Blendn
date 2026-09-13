// Dynamic Expo config layered over app.json.
//
// react-native-maps on Android renders through the Google Maps SDK and needs
// `com.google.android.geo.API_KEY` in the manifest. Without it the map band in
// the event Location card is blank on Android (iOS falls back to Apple Maps,
// which is why it worked there). Expo injects that meta-data from
// `android.config.googleMaps.apiKey`.
//
// Read from env, never committed: the key lives in .env / .env.local as
// EXPO_PUBLIC_GOOGLE_MAPS_API_KEY. Takes effect on a NATIVE rebuild of the dev
// client (prebuild + build) — a Metro reload cannot change the manifest.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...(config.android && config.android.config),
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
  },
})
