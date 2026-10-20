import { describe, expect, it } from 'vitest';
import { messages, setLocale, useI18n } from '@/i18n';

function keys(value: object, prefix = ''): string[] {
  return Object.entries(value).flatMap(([key, item]) =>
    typeof item === 'object' && item !== null
      ? keys(item, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

describe('the texts of the application', () => {
  it('declares the same keys in Italian and in English, none of them empty', () => {
    expect(keys(messages.en)).toEqual(keys(messages.it));
    for (const catalogue of [messages.it, messages.en]) {
      expect(JSON.stringify(catalogue)).not.toContain('""');
    }
  });

  it('switches the language of the page and of the texts', () => {
    const { t } = useI18n();
    setLocale('en');
    expect(document.documentElement.lang).toBe('en');
    expect(t.value.appName).toBe('System monitor');
    setLocale('it');
    expect(t.value.appName).toBe('Monitor sistema');
  });
});

it('writes the texts that take values the same way in both languages', () => {
  for (const texts of Object.values(messages)) {
    expect(texts.widgetCount(3)).toContain('3');
    expect(texts.durationDays(1, 2)).toMatch(/1 .* 2 /);
    expect(texts.durationHours(5)).toContain('5');
    expect(texts.actionsFor('cron')).toContain('cron');
    expect(texts.removeSensor('CPU')).toContain('CPU');
    expect(texts.moveSensorUp('CPU')).toContain('CPU');
    expect(texts.moveSensorDown('CPU')).toContain('CPU');
  }
});
