import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { supportedLocales } from '@/lib/i18n/locales';

const locales = Object.fromEntries(
  supportedLocales.map(({ code }) => [
    code,
    JSON.parse(
      readFileSync(new URL(`../../lib/i18n/locales/${code}.json`, import.meta.url), 'utf8'),
    ),
  ]),
);

const KEYS = [
  'settings.ttsProviderEnabledLabel',
  'settings.ttsProviderEnabledHint',
  'settings.ttsProviderUnavailableHint',
  'settings.ttsProviderDisabledByAdmin',
  'agentBar.noVoice',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- locale JSON traversal
const get = (o: any, k: string) => k.split('.').reduce((a, p) => a?.[p], o);

describe('TTS enablement locale coverage (#665)', () => {
  it('every key exists, non-empty, and does not echo the key, in every supported locale', () => {
    for (const [code, data] of Object.entries(locales)) {
      for (const k of KEYS) {
        const v = get(data, k);
        expect(typeof v, `${code} missing ${k}`).toBe('string');
        expect((v as string).trim(), `${code} empty ${k}`).not.toBe('');
        expect(v, `${code} echoes ${k}`).not.toBe(k);
      }
    }
  });
});
