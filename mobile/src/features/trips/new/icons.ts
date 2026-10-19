/** Icons for interests and place categories (the database has no place photos yet). */

import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

const ICONS: Record<string, IconName> = {
  beach: 'beach',
  nature: 'pine-tree',
  adventure: 'hiking',
  culture: 'bank-outline',
  history: 'castle',
  food: 'silverware-fork-knife',
  shopping: 'shopping-outline',
  photography: 'camera-outline',
  relaxation: 'spa-outline',
  family: 'account-group-outline',
  wildlife: 'paw',
  scenic: 'image-filter-hdr',
  sunset: 'weather-sunset',
  nightlife: 'weather-night',
};

/** The icon of an interest or a place category ("Beach", "Nature"…). */
export function topicIcon(name?: string): IconName {
  return ICONS[(name ?? '').toLowerCase()] ?? 'map-marker-outline';
}
