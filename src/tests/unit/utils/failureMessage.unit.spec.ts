import { expect, it } from 'vitest';
import { messages } from '@/i18n';
import { failureMessage } from '@/utils/failureMessage';

it('translates the reasons of the shell it knows and passes the others through', () => {
  expect(failureMessage(new Error('Processes unavailable'), messages.it)).toBe(
    messages.it.processesUnavailable,
  );
  expect(failureMessage(new Error('Launcher unavailable'), messages.en)).toBe(
    messages.en.launcherUnavailable,
  );
  expect(failureMessage('nas-os.service keeps the NAS working', messages.it)).toBe(
    'nas-os.service keeps the NAS working',
  );
});
