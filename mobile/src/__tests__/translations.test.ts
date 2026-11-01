/**
 * Every English string has a Bangla one (friends and chat step 10): a missing key falls back
 * to English, so a Bangla screen would show a line in English. And both languages fill in the
 * same {{placeholders}}, so a sentence never shows a raw "{{name}}" or loses a value.
 */

import bn from '../i18n/bn.json';
import en from '../i18n/en.json';

type Tree = { [key: string]: string | Tree };

function flat(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((out, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? { ...out, [path]: value } : { ...out, ...flat(value, path) };
  }, {});
}

const english = flat(en as Tree);
const bangla = flat(bn as Tree);
const placeholders = (text: string) => [...text.matchAll(/{{\s*(\w+)\s*}}/g)].map((m) => m[1]).sort();

describe('translations', () => {
  it('have every English string in Bangla too', () => {
    expect(Object.keys(english).filter((key) => !(key in bangla))).toEqual([]);
  });

  it('have no Bangla strings that English has dropped', () => {
    expect(Object.keys(bangla).filter((key) => !(key in english))).toEqual([]);
  });

  it('fill in the same placeholders in both languages', () => {
    const differ = Object.keys(english).filter((key) => key in bangla && placeholders(english[key]).join() !== placeholders(bangla[key]).join());
    expect(differ).toEqual([]);
  });
});
