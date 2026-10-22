type SC = typeof import('../services/serverConfig');
type AS = typeof import('@react-native-async-storage/async-storage').default;

/** A fresh copy of the module and the storage it uses (the address is kept between loads otherwise). */
function fresh(): { sc: SC; storage: AS } {
  let sc!: SC;
  let storage!: AS;
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports -- a fresh module copy per test needs require */
    sc = require('../services/serverConfig');
    const m = require('@react-native-async-storage/async-storage');
    storage = m.default ?? m;
    /* eslint-enable @typescript-eslint/no-require-imports */
  });
  return { sc, storage };
}

const FILE = 'https://x.supabase.co/storage/v1/object/public/share/config.json';

describe('where the backend is (a shared build reads it from a file)', () => {
  it('only takes an https address from the file', () => {
    const { sc } = fresh();
    expect(sc.validApiUrl('https://abc-def.trycloudflare.com')).toBe('https://abc-def.trycloudflare.com');
    expect(sc.validApiUrl('https://abc.trycloudflare.com/')).toBe('https://abc.trycloudflare.com');
    expect(sc.validApiUrl('http://abc.trycloudflare.com')).toBeNull();
    expect(sc.validApiUrl('https://evil.com/path?x=1')).toBeNull();
    expect(sc.validApiUrl(42)).toBeNull();
  });

  it('uses the address in the file, and keeps it for when it is offline', async () => {
    globalThis.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({ apiUrl: 'https://new.trycloudflare.com' }) })) as never;
    const { sc, storage } = fresh();
    await sc.loadServerConfig(FILE);
    expect(sc.apiUrl()).toBe('https://new.trycloudflare.com');
    expect(await storage.getItem('vromon.apiUrl')).toBe('https://new.trycloudflare.com');
  });

  it('offline: the saved address', async () => {
    globalThis.fetch = jest.fn(() => Promise.reject(new Error('offline'))) as never;
    const { sc, storage } = fresh();
    await storage.setItem('vromon.apiUrl', 'https://saved.trycloudflare.com');
    await sc.loadServerConfig(FILE);
    expect(sc.apiUrl()).toBe('https://saved.trycloudflare.com');
  });
});
