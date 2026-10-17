/** Transport modes for trip stops (prompt §6.8): an icon and a translated label each. */

import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';

import type { TransportMode } from '../../types';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export const TRANSPORT_MODES: { mode: TransportMode; icon: IconName }[] = [
  { mode: 'plane', icon: 'airplane' },
  { mode: 'bus', icon: 'bus' },
  { mode: 'train', icon: 'train' },
  { mode: 'car', icon: 'car' },
  { mode: 'boat', icon: 'ferry' },
  { mode: 'walk', icon: 'walk' },
];

export function transportIcon(mode: TransportMode | null | undefined): IconName {
  return TRANSPORT_MODES.find((m) => m.mode === mode)?.icon ?? 'map-marker-outline';
}
