/**
 * Searchable single-choice country list (home country). Uses FlatList with
 * fixed-height rows; ~250 rows don't need FlashList.
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Text, TextInput, View } from 'react-native';

import { resolveLanguage } from '../../i18n';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { usePreferences } from '../preferences/store';
import { countryList, searchCountries, type Country } from './countries';

const ROW_HEIGHT = 56;

export function CountryList({ selected, onSelect }: { selected: string | null; onSelect: (code: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const lang = resolveLanguage(usePreferences((s) => s.language));
  const [query, setQuery] = useState('');
  const all = useMemo(() => countryList(lang), [lang]);
  const shown = useMemo(() => searchCountries(all, query), [all, query]);

  return (
    <View style={styles.wrap}>
      <View style={styles.search}>
        <MaterialCommunityIcons name="magnify" size={22} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('onboarding.search')}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={t('onboarding.search')}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          testID="country-search"
        />
      </View>
      <FlatList<Country>
        data={shown}
        keyExtractor={(c) => c.code}
        keyboardShouldPersistTaps="handled"
        getItemLayout={(_, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        initialNumToRender={20}
        renderItem={({ item }) => {
          const on = item.code === selected;
          return (
            <PressableScale
              haptic="selection"
              pressEffect="opacity"
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={item.name}
              style={styles.row}
              onPress={() => onSelect(item.code)}
              testID={`country-${item.code}`}
            >
              <Text style={styles.flag}>{item.flag}</Text>
              <Text style={[styles.name, on && styles.nameOn]} numberOfLines={1}>
                {item.name}
              </Text>
              {on ? <MaterialCommunityIcons name="check" size={22} color={colors.link} /> : null}
            </PressableScale>
          );
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, gap: t.spacing.sm },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.control,
    paddingHorizontal: t.spacing.md,
    minHeight: 48,
  },
  searchInput: { flex: 1, color: t.colors.textPrimary, fontSize: 16 },
  row: { height: ROW_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  flag: { fontSize: 24 },
  name: { ...t.type.body, color: t.colors.textPrimary, flex: 1 },
  nameOn: { color: t.colors.link, fontWeight: '600' },
}));
