/**
 * Icons are pictures beside words, or inside buttons with names of their own, so screen
 * readers skip them: otherwise they read out the icon font's glyph, a private-use character
 * (friends and chat step 10). An icon that says something by itself passes
 * importantForAccessibility="yes" with its accessibilityLabel. Imported once, by the root layout.
 */

import { MaterialCommunityIcons, MaterialIcons } from '@expo/vector-icons';

const hidden = { importantForAccessibility: 'no-hide-descendants', accessibilityElementsHidden: true } as const;

for (const Icon of [MaterialCommunityIcons, MaterialIcons]) {
  Icon.defaultProps = { ...Icon.defaultProps, ...hidden };
}
