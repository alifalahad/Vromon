// https://docs.expo.dev/guides/using-eslint/
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Every interactive element goes through src/ui/PressableScale (press animation +
// haptic) and every haptic through src/ui/haptics (respects the Settings toggle).
const interactionRules = {
  'no-restricted-imports': [
    'error',
    {
      paths: [
        {
          name: 'expo-haptics',
          message: "Use haptics from 'src/ui/haptics' so the Haptic feedback setting is respected.",
        },
        {
          name: 'react-native',
          importNames: ['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback', 'TouchableNativeFeedback'],
          message: "Use PressableScale from 'src/ui/PressableScale' (press animation + haptic).",
        },
      ],
    },
  ],
};

module.exports = defineConfig([
  globalIgnores(['dist/*', '.expo/*', 'node_modules/*', 'android/*', 'ios/*']),
  expoConfig,
  { files: ['app/**/*.{ts,tsx}', 'src/**/*.{ts,tsx}'], rules: interactionRules },
  { files: ['jest.setup.js'], languageOptions: { globals: { jest: 'readonly' } } },
  // The primitives themselves are the only place allowed to use the raw APIs
  { files: ['src/ui/haptics.ts', 'src/ui/PressableScale.tsx', 'src/__tests__/**'], rules: { 'no-restricted-imports': 'off' } },
]);
