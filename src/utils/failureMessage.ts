import type { Translations } from '@/i18n';

export function failureMessage(cause: unknown, t: Translations) {
  const reason = cause instanceof Error ? cause.message : String(cause);
  const known: Record<string, string> = {
    'Launcher unavailable': t.launcherUnavailable,
    'Processes unavailable': t.processesUnavailable,
  };

  return known[reason] ?? reason;
}
