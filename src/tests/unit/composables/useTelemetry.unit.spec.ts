import { defineComponent } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePreferences } from '@/composables/usePreferences';
import { useTelemetry } from '@/composables/useTelemetry';
import { setLocale } from '@/i18n';
import { askNasShell } from '@/services/nasShell';
import { readTelemetry } from '@/services/monitor';
import { process, telemetry } from '@/tests/fixtures/telemetry';

vi.mock('@/services/nasShell', () => ({ askNasShell: vi.fn() }));

function mounted() {
  let api!: ReturnType<typeof useTelemetry>;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useTelemetry();
        return () => null;
      },
    }),
  );
  return { api, wrapper };
}

vi.mock('@/services/monitor', async (original) => ({
  ...(await original<typeof import('@/services/monitor')>()),
  readTelemetry: vi.fn(),
}));

beforeEach(() => {
  setLocale('it');
  vi.useFakeTimers();
  vi.mocked(askNasShell).mockReset().mockResolvedValue(null);
  vi.mocked(readTelemetry).mockReset().mockResolvedValue(telemetry());
});
afterEach(() => vi.useRealTimers());

it('reads at once and again at the interval of the preferences', async () => {
  usePreferences().setRefresh(2);
  const { api, wrapper } = mounted();
  await flushPromises();
  expect(api.sensors.value).toHaveLength(5);
  expect(api.processes.value).toHaveLength(3);

  await vi.advanceTimersByTimeAsync(2000);
  expect(readTelemetry).toHaveBeenCalledTimes(2);
  usePreferences().setRefresh(5);
  await vi.advanceTimersByTimeAsync(4000);
  expect(readTelemetry).toHaveBeenCalledTimes(2);
  wrapper.unmount();
});

it('reads nothing while the page is out of sight', async () => {
  usePreferences().setRefresh(2);
  const { wrapper } = mounted();
  await flushPromises();
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

  await vi.advanceTimersByTimeAsync(4000);
  expect(readTelemetry).toHaveBeenCalledTimes(1);
  hidden.mockReturnValue(false);
  await vi.advanceTimersByTimeAsync(2000);
  expect(readTelemetry).toHaveBeenCalledTimes(2);
  hidden.mockRestore();
  wrapper.unmount();
});

it('acts on a process, says why it was refused and reads again', async () => {
  const { api, wrapper } = mounted();
  await flushPromises();
  vi.mocked(askNasShell).mockRejectedValueOnce(new Error('cron.service keeps the NAS working'));

  await api.act(process(), 'terminate');
  expect(api.actionError.value).toBe('cron.service keeps the NAS working');
  expect(api.acting.value).toBeNull();
  expect(readTelemetry).toHaveBeenCalledTimes(2);
  wrapper.unmount();
});

it('says why the telemetry could not be read', async () => {
  vi.mocked(readTelemetry).mockRejectedValue(new Error('Processes unavailable'));
  const { api, wrapper } = mounted();
  await flushPromises();

  expect(api.error.value).toBe('I processi del NAS non sono disponibili.');
  wrapper.unmount();
});
