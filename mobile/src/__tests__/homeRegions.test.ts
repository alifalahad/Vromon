import { HOME_DISTRICTS, HOME_REGIONS, homeRegionName } from '../features/map/geoData';

describe('bundled home regions (Bangladesh)', () => {
  it('has all 8 divisions, Mymensingh included', () => {
    const codes = HOME_REGIONS.features.map((f) => f.properties.code).sort();
    expect(codes).toEqual(['BD-A', 'BD-B', 'BD-C', 'BD-D', 'BD-E', 'BD-F', 'BD-G', 'BD-H']);
    expect(HOME_REGIONS.features.every((f) => f.properties.country === 'BD')).toBe(true);
  });

  it('resolves names in English and Bangla', () => {
    expect(homeRegionName('BD-H', 'en')).toBe('Mymensingh');
    expect(homeRegionName('BD-H', 'bn')).toBe('ময়মনসিংহ বিভাগ');
    expect(homeRegionName('BD-A', 'en')).toBe('Barishal');
    expect(homeRegionName('IN-WB', 'en')).toBeUndefined();
  });

  it('has no ring under 4 points (MapLibre rejects the whole file over one)', () => {
    for (const f of HOME_REGIONS.features) {
      const parts = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const ring of parts.flat()) expect(ring.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('uses division (বিভাগ), not district (জেলা), in every Bangla name', () => {
    expect(HOME_REGIONS.features.every((f) => f.properties.name_bn.endsWith('বিভাগ'))).toBe(true);
  });
});

describe('bundled districts (Bangladesh)', () => {
  const names = HOME_DISTRICTS.features.filter((f) => f.geometry.type === 'Point');

  it('has all 64 districts with English and Bangla names and their division', () => {
    expect(names).toHaveLength(64);
    expect(names.every((f) => f.properties.name && f.properties.name_bn && /^BD-[A-H]$/.test(f.properties.division ?? ''))).toBe(true);
  });

  it('uses the official spellings', () => {
    const all = names.map((f) => f.properties.name);
    for (const n of ['Chattogram', 'Cumilla', 'Jashore', 'Bogura', 'Barishal', 'Chapai Nawabganj']) expect(all).toContain(n);
    for (const n of ['Chittagong', 'Comilla', 'Jessore', 'Bogra']) expect(all).not.toContain(n);
  });

  it('puts Mymensingh district in Mymensingh division, and Cox’s Bazar in Chattogram', () => {
    const div = (n: string) => names.find((f) => f.properties.name === n)?.properties.division;
    expect(div('Mymensingh')).toBe('BD-H');
    expect(div("Cox's Bazar")).toBe('BD-B');
  });
});
