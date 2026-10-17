/**
 * Searchable multi-select of the map's countries (onboarding: "Where have you been?").
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Text, TextInput, View } from 'react-native';

import { resolveLanguage } from '../../i18n';
import { PressableScale } from '../../ui/PressableScale';
import { makeStyles, useTheme } from '../../ui/theme';
import { usePreferences } from '../preferences/store';
import { mapCountries, type MapCountry } from './mapCountries';

const ROW = 56;

export function CountryMultiPicker({ selected, onToggle }: { selected: ReadonlySet<string>; onToggle: (code: string) => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const lang = resolveLanguage(usePreferences((s) => s.language));
  const [query, setQuery] = useState('');
  const all = useMemo(() => mapCountries(lang), [lang]);
  const q = query.trim().toLocaleLowerCase();
  const shown = useMemo(() => (q ? all.filter((c) => c.name.toLocaleLowerCase().includes(q) || c.code.toLowerCase() === q) : all), [all, q]);

  return (
    <View style={styles.wrap}>
      <View style={styles.search}>
        <MaterialCommunityIcons name="magnify" size={22} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('map.searchCountries')}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={t('map.searchCountries')}
          style={styles.input}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
      <FlatList<MapCountry>
        data={shown}
        keyExtractor={(c) => c.code}
        extraData={selected}
        keyboardShouldPersistTaps="handled"
        getItemLayout={(_, i) => ({ length: ROW, offset: ROW * i, index: i })}
        renderItem={({ item }) => {
          const on = selected.has(item.code);
          return (
            <PressableScale
              haptic="selection"
              pressEffect="opacity"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={item.name}
              style={styles.row}
              onPress={() => onToggle(item.code)}
              testID={`visited-${item.code}`}
            >
              <Text style={styles.flag}>{item.flag}</Text>
              <Text style={[styles.name, on && styles.nameOn]} numberOfLines={1}>
                {item.name}
              </Text>
              <MaterialCommunityIcons
                name={on ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                size={24}
                color={on ? colors.link : colors.textTertiary}
              />
            </PressableScale>
          );
        }}
      />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  wrap: { flex: 1, gap: t.spacing.sm },
  search: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, backgroundColor: t.colors.surface, borderRadius: t.radius.control, paddingHorizontal: t.spacing.md, minHeight: 48 },
  input: { flex: 1, color: t.colors.textPrimary, fontSize: 16 },
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, borderBottomWidth: 1, borderBottomColor: t.colors.divider },
  flag: { fontSize: 24 },
  name: { ...t.type.body, color: t.colors.textPrimary, flex: 1 },
  nameOn: { fontWeight: '600' },
}));
