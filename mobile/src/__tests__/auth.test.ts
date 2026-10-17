import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeUsername, usernameProblem } from '../features/account/username';
import { secureSessionStorage } from '../features/auth/secureSessionStorage';
import { fieldErrors, newPasswordSchema, signInSchema, signUpSchema } from '../features/auth/schemas';
import { searchCountries, countryList, flagEmoji, countryName } from '../features/geo/countries';

jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});
jest.mock('expo-crypto', () => ({
  getRandomBytes: (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256),
}));

describe('username rules (same as the backend)', () => {
  it.each([
    ['ali', null],
    ['ali.ahad_99', null],
    ['ab', 'length'],
    ['a'.repeat(21), 'length'],
    ['has space', 'characters'],
    ['émile', 'characters'],
    ['.ali', 'dots'],
    ['ali.', 'dots'],
    ['a..b', 'dots'],
    ['admin', 'reserved'],
  ])('%s → %s', (name, problem) => {
    expect(usernameProblem(name)).toBe(problem);
  });

  it('normalises case and whitespace', () => {
    expect(normalizeUsername('  Ali_Ahad ')).toBe('ali_ahad');
  });
});

describe('auth form schemas', () => {
  it('signs in with a trimmed, lowercased email', () => {
    const r = signInSchema.safeParse({ email: ' Me@Example.COM ', password: 'x' });
    expect(r.success && r.data.email).toBe('me@example.com');
  });

  it('reports field errors as i18n keys', () => {
    expect(fieldErrors(signUpSchema.safeParse({ email: 'nope', password: 'short', confirm: 'other' }))).toEqual({
      email: 'email',
      password: 'passwordShort',
      confirm: 'passwordMismatch',
    });
    expect(fieldErrors(newPasswordSchema.safeParse({ password: 'longenough', confirm: 'longenough' }))).toEqual({});
  });
});

describe('secure session storage', () => {
  const session = JSON.stringify({ access_token: 'eyJ.secret.token', refresh_token: 'r3fr3sh' });

  it('round-trips without ever storing the token in plain text', async () => {
    await secureSessionStorage.setItem('sb-auth', session);
    const raw = await AsyncStorage.getItem('sb-auth');
    expect(raw).not.toContain('secret');
    expect(raw).not.toContain('r3fr3sh');
    expect(await secureSessionStorage.getItem('sb-auth')).toBe(session);
  });

  it('forgets the session and its key on removal', async () => {
    await secureSessionStorage.setItem('sb-auth', session);
    await secureSessionStorage.removeItem('sb-auth');
    expect(await secureSessionStorage.getItem('sb-auth')).toBeNull();
  });
});

describe('countries', () => {
  it('has English and Bangla names and emoji flags', () => {
    expect(countryName('BD', 'en')).toBe('Bangladesh');
    expect(countryName('BD', 'bn')).toBe('বাংলাদেশ');
    expect(flagEmoji('bd')).toBe('🇧🇩');
    expect(countryList('en').length).toBeGreaterThan(240);
  });

  it('searches by name or exact code', () => {
    const list = countryList('en');
    expect(searchCountries(list, 'bangla').map((c) => c.code)).toEqual(['BD']);
    expect(searchCountries(list, 'np').map((c) => c.code)).toEqual(['NP']);
  });
});
