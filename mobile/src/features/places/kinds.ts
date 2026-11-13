/**
 * Kinds of places outside Vromon's list (trip upgrades step 6): the icon and the words for each kind the
 * places index (backend app/core/poi-kinds.yaml) and the address search use, plus a pin you name yourself.
 */

import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import type { Place, SearchResult } from '../../types';

type Icon = ComponentProps<typeof MaterialCommunityIcons>['name'];
/** i18next's t, or anything that translates a key the same way */
type T = (key: string, options?: Record<string, unknown>) => string;

const KIND_ICON: Record<string, Icon> = {
  college: 'school',
  school: 'school-outline',
  madrasa: 'book-open-variant',
  education: 'book-education-outline',
  library: 'library',
  hospital: 'hospital-building',
  clinic: 'medical-bag',
  diagnostic: 'test-tube',
  pharmacy: 'pill',
  bank: 'bank',
  atm: 'cash',
  market: 'basket-outline',
  shopping_mall: 'shopping-outline',
  shop: 'storefront-outline',
  mosque: 'mosque',
  temple: 'temple-hindu',
  church: 'church',
  pagoda: 'temple-buddhist',
  place_of_worship: 'hands-pray',
  park: 'tree-outline',
  government_office: 'office-building-outline',
  police: 'police-badge-outline',
  fire_station: 'fire-truck',
  post_office: 'email-outline',
  bus_station: 'bus',
  train_station: 'train',
  airport: 'airplane',
  ferry_terminal: 'ferry',
  transit: 'bus-stop',
  fuel: 'gas-station-outline',
  historic_site: 'pillar',
  museum: 'image-frame',
  nature: 'pine-tree',
  stadium: 'stadium',
  entertainment: 'drama-masks',
  community: 'account-group-outline',
  office: 'briefcase-outline',
  service: 'wrench-outline',
  business: 'domain',
  bridge: 'bridge',
  cemetery: 'grave-stone',
  other: 'map-marker-outline',
  address: 'home-map-marker',
  street: 'road-variant',
  area: 'map-marker-radius-outline',
  pin: 'map-marker-star-outline',
  restaurant: 'silverware-fork-knife',
  hotel: 'bed-outline',
};

export const PIN_ICON: Icon = 'map-marker-plus-outline';

/** A result's icon: its kind, else Vromon's own place (a sight). */
export function kindIcon(kind: string | null | undefined): Icon {
  return (kind && KIND_ICON[kind]) || 'map-marker-outline';
}

/** "College" (or "Colleges" with count 2); an unknown kind isn't named. */
export function kindLabel(kind: string | null | undefined, t: T, count = 1): string | null {
  if (!kind || !(kind in KIND_ICON)) return null;
  return t(`search.kinds.${kind}`, { count });
}

/** A stop from outside Vromon's list: the traveller's own (a search result or a pin). */
export function isPrivatePlace(place: Pick<Place, 'listed'> | null | undefined): boolean {
  return place?.listed === false;
}

/** "Not checked": your own stop from data Vromon hasn't checked (the places index, an address, a pin).
 * A restaurant or hotel of Vromon's that you added from search is your own stop too, but checked. */
export function isUnchecked(place: Pick<Place, 'listed' | 'checked'> | null | undefined): boolean {
  return place?.listed === false && place.checked === false;
}

/** What a result is, in words: its kind, a restaurant's food, or Vromon's category. */
export function resultWhat(r: SearchResult, t: T): string | null {
  return kindLabel(r.kind, t) ?? (r.category ? r.category.replace(/_/g, ' ') : null);
}
