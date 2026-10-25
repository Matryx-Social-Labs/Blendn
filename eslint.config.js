// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    // Reanimated's hook is read once at launch; lib/motion's follows the setting live (a11y audit M1).
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native-reanimated',
              importNames: ['useReducedMotion'],
              message: "Import useReducedMotion from lib/motion: Reanimated's is read once at launch and never follows the setting.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ['lib/motion.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
]);
