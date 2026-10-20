import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '@/App.vue';
import WidgetApp from '@/WidgetApp.vue';
import { askNasShell } from '@/services/nasShell';
import { readTelemetry } from '@/services/monitor';
import { setLocale } from '@/i18n';
import { telemetry } from '@/tests/fixtures/telemetry';

vi.mock('@/services/nasShell', () => ({
  askNasShell: vi.fn(),
  listenNasShell: vi.fn(() => () => undefined),
  readyNasShell: vi.fn(),
}));

vi.mock('@/services/monitor', async (original) => ({
  ...(await original<typeof import('@/services/monitor')>()),
  readTelemetry: vi.fn(),
}));

beforeEach(() => {
  setLocale('it');
  vi.mocked(askNasShell).mockReset().mockResolvedValue(null);
  vi.mocked(readTelemetry).mockReset().mockResolvedValue(telemetry());
});
afterEach(() => {
  document.body.innerHTML = '';
});

it('opens on the monitor, moves to the processes and opens the options', async () => {
  const wrapper = mount(App, { attachTo: document.body });
  await flushPromises();
  expect(wrapper.get('h1').text()).toBe('Monitor');
  expect(readTelemetry).toHaveBeenCalled();

  await wrapper.get('[data-testid="section_processes"]').trigger('click');
  expect(wrapper.get('h1').text()).toBe('Processi');
  await wrapper.get('[data-testid="process_1"]').trigger('contextmenu');
  await wrapper.get('[data-testid="process_restart"]').trigger('click');
  await flushPromises();
  expect(askNasShell).toHaveBeenCalledWith(
    'process-action',
    { id: 1, started: 900, action: 'restart' },
    125000,
  );

  await wrapper.get('[data-testid="options_open"]').trigger('click');
  expect(document.querySelector('[data-testid="options"]')).not.toBeNull();
  document.querySelector<HTMLElement>('[aria-label="Chiudi"]')?.click();
  await flushPromises();
  expect(document.querySelector('[data-testid="options"]')).toBeNull();
  wrapper.unmount();
});

it('says when the launcher does not answer and reads again on request', async () => {
  vi.mocked(readTelemetry).mockRejectedValueOnce(new Error('Launcher unavailable'));
  const wrapper = mount(App);
  await flushPromises();
  expect(wrapper.get('[data-testid="telemetry_error"]').text()).toContain(
    'Il launcher non risponde',
  );

  await wrapper.get('[data-testid="telemetry_error"] button').trigger('click');
  await flushPromises();
  expect(wrapper.find('[data-testid="telemetry_error"]').exists()).toBe(false);
  wrapper.unmount();
});

it('draws only the widget in the widget page', async () => {
  const wrapper = mount(WidgetApp);
  await flushPromises();

  expect(wrapper.find('[data-testid="monitor_widget"]').exists()).toBe(true);
  wrapper.unmount();
});
