import { Platform, Text as RNText, TextStyle } from 'react-native'

// Set global defaults for Text to use SF Pro where available.
// iOS: 'System' maps to San Francisco.
// Android: use 'sans-serif' unless custom SF Pro fonts are added.
const defaultFontFamily: TextStyle['fontFamily'] = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default: undefined,
})

if (!RNText.defaultProps) {
  RNText.defaultProps = {}
}

RNText.defaultProps.allowFontScaling = RNText.defaultProps.allowFontScaling ?? false

RNText.defaultProps.style = [
  RNText.defaultProps.style as TextStyle,
  {
    fontFamily: defaultFontFamily,
    // Align Android vertical metrics closer to iOS
    includeFontPadding: Platform.OS === 'android' ? false : undefined,
    textAlignVertical: Platform.OS === 'android' ? 'center' : undefined,
  } as TextStyle,
]


