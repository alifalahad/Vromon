/**
 * Vromon Mobile — Add friend (prompt §6.4): Search by username (or type a code) ·
 * Scan QR · My code (QR + code, Copy, Share, Regenerate).
 */

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { useIsFocused, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, ScrollView, Text, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ME_QUERY_KEY, useMe } from '../../src/features/account/useMe';
import { formatFriendCode, inviteLink, parseFriendCode } from '../../src/features/friends/friendCode';
import { PersonRow } from '../../src/features/friends/PersonRow';
import { QrScanner } from '../../src/features/friends/QrScanner';
import { friendKeys } from '../../src/features/friends/queries';
import { shareInvite } from '../../src/features/friends/share';
import { friendsApi } from '../../src/services/api';
import { Button } from '../../src/ui/Button';
import { haptics } from '../../src/ui/haptics';
import { PressableScale } from '../../src/ui/PressableScale';
import { SegmentedControl } from '../../src/ui/SegmentedControl';
import { makeStyles, useTheme } from '../../src/ui/theme';
import { confirm, notify } from '../../src/utils/dialogs';

type Tab = 'search' | 'scan' | 'code';
const TABS: Tab[] = ['search', 'scan', 'code'];

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function AddFriendScreen() {
  const styles = useStyles();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ tab?: Tab }>();
  const [tab, setTab] = useState<Tab>(TABS.includes(params.tab as Tab) ? (params.tab as Tab) : 'search');
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <SegmentedControl<Tab>
        options={TABS.map((v) => ({ value: v, label: t(`friends.tabs.${v}`) }))}
        value={tab}
        onChange={setTab}
        style={styles.segment}
        testID="add-friend-tab"
      />
      {tab === 'search' ? <SearchTab /> : tab === 'scan' ? <ScanTab /> : <MyCodeTab />}
    </View>
  );
}

function SearchTab() {
  const styles = useStyles();
  const { colors } = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const q = useDebounced(query.trim().replace(/^@/, '').toLowerCase(), 300);
  const code = parseFriendCode(query);
  const results = useQuery({ queryKey: friendKeys.search(q), queryFn: () => friendsApi.search(q), enabled: q.length >= 2 });

  return (
    <View style={styles.flex}>
      <View style={styles.search}>
        <MaterialCommunityIcons name="magnify" size={22} color={colors.textTertiary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('friends.searchPlaceholder')}
          placeholderTextColor={colors.textTertiary}
          accessibilityLabel={t('friends.searchPlaceholder')}
          style={styles.searchInput}
          autoFocus
          autoCorrect={false}
          autoCapitalize="none"
          testID="friend-search"
        />
        {results.isFetching ? <ActivityIndicator color={colors.link} /> : null}
      </View>
      <FlatList
        data={results.data ?? []}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          code ? (
            <PressableScale pressEffect="opacity" style={styles.codeRow} onPress={() => router.push(`/add/${code}`)} testID="use-code">
              <MaterialCommunityIcons name="ticket-confirmation-outline" size={24} color={colors.link} />
              <Text style={styles.codeText}>{t('friends.useCode', { code: formatFriendCode(code) })}</Text>
            </PressableScale>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.hint}>
            {q.length < 2 ? t('friends.searchHint') : results.isFetching ? '' : `${t('friends.noResults')}\n\n${t('friends.hiddenHint')}`}
          </Text>
        }
        renderItem={({ item }) => <PersonRow person={item} onPress={item.relation === 'friends' ? () => router.push(`/friends/${item.id}`) : undefined} />}
      />
    </View>
  );
}

function ScanTab() {
  const styles = useStyles();
  const router = useRouter();
  const focused = useIsFocused();
  return (
    <ScrollView contentContainerStyle={styles.padded}>
      {/* The camera only runs while this tab is on screen */}
      {focused ? <QrScanner onCode={(code) => router.push(`/add/${code}`)} /> : null}
    </ScrollView>
  );
}

function MyCodeTab() {
  const styles = useStyles();
  const { t } = useTranslation();
  const client = useQueryClient();
  const { data: me } = useMe();
  const [rotating, setRotating] = useState(false);
  if (!me) return null;

  const copy = async () => {
    await Clipboard.setStringAsync(me.friend_code);
    notify(t('friends.copied'), formatFriendCode(me.friend_code), 'success');
  };

  const rotate = () =>
    confirm(t('friends.regenerateTitle'), t('friends.regenerateBody'), t('friends.regenerate'), async () => {
      setRotating(true);
      try {
        client.setQueryData(ME_QUERY_KEY, await friendsApi.rotateCode());
        haptics.success();
      } catch (e) {
        notify(t('common.error'), e instanceof Error ? e.message : '', 'error');
      } finally {
        setRotating(false);
      }
    }, true);

  return (
    <ScrollView contentContainerStyle={[styles.padded, styles.center]}>
      {/* White quiet zone so any scanner reads it, in dark appearance too */}
      <View style={styles.qr} accessible accessibilityLabel={t('friends.qrLabel', { code: formatFriendCode(me.friend_code) })} testID="my-qr">
        <QRCode value={inviteLink(me.friend_code)} size={220} color="#000000" backgroundColor="#FFFFFF" ecl="M" />
      </View>
      <Text style={styles.code} selectable testID="my-code">
        {formatFriendCode(me.friend_code)}
      </Text>
      <Text style={styles.hint}>{t('friends.myCodeHint')}</Text>
      <View style={styles.buttons}>
        <Button variant="secondary" label={t('friends.copy')} onPress={copy} style={styles.flex} testID="copy-code" />
        <Button label={t('friends.share')} haptic="medium" onPress={() => shareInvite(me.friend_code, t)} style={styles.flex} testID="share-code" />
      </View>
      <Button variant="danger" label={t('friends.regenerate')} onPress={rotate} loading={rotating} testID="rotate-code" style={styles.rotate} />
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  container: { flex: 1, backgroundColor: t.colors.bg },
  flex: { flex: 1 },
  segment: { marginHorizontal: t.spacing.lg + 2, marginTop: t.spacing.sm, marginBottom: t.spacing.md },
  padded: { padding: t.spacing.lg + 2 },
  center: { alignItems: 'center', gap: t.spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    marginHorizontal: t.spacing.lg + 2,
    marginBottom: t.spacing.sm,
    paddingHorizontal: t.spacing.md,
    minHeight: 52,
    borderRadius: t.radius.control,
    backgroundColor: t.colors.surface,
  },
  searchInput: { flex: 1, ...t.type.body, color: t.colors.textPrimary },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.md, paddingHorizontal: t.spacing.lg + 2, minHeight: 56 },
  codeText: { ...t.type.headline, color: t.colors.link },
  hint: { ...t.type.callout, color: t.colors.textSecondary, textAlign: 'center', paddingHorizontal: t.spacing.xxl, marginTop: t.spacing.lg },
  qr: { padding: 16, borderRadius: 20, backgroundColor: '#FFFFFF', marginTop: t.spacing.md },
  code: { ...t.type.largeTitle, fontSize: 30, letterSpacing: 4, color: t.colors.textPrimary, marginTop: t.spacing.md },
  buttons: { flexDirection: 'row', gap: t.spacing.md, alignSelf: 'stretch', marginTop: t.spacing.lg },
  rotate: { alignSelf: 'stretch' },
}));
