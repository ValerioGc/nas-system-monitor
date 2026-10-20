import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MonitorWidget from '@/components/widget/MonitorWidget.vue';
import { usePreferences } from '@/composables/usePreferences';
import { setLocale } from '@/i18n';
import { askNasShell } from '@/services/nasShell';
import { readTelemetry } from '@/services/monitor';
import { PROCESSES, process, telemetry } from '@/tests/fixtures/telemetry';

vi.mock('@/services/nasShell', () => ({ askNasShell: vi.fn() }));

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

it('shows the chosen sensors, folds them away and lists the chosen processes', async () => {
  const preferences = usePreferences();
  preferences.setWidgetList('nas');
  preferences.setProcessMemoryUnit('percent');
  const wrapper = mount(MonitorWidget, { attachTo: document.body });
  await flushPromises();

  expect(wrapper.findAll('.sensor_card').map((card) => card.attributes('data-testid'))).toEqual([
    'sensor_cpu-usage',
    'sensor_ram-usage',
  ]);
  expect(wrapper.findAll('tbody tr')).toHaveLength(1);
  expect(wrapper.text()).toContain('NAS · 1');
  expect(wrapper.get('[data-testid="process_1"] td.column_ram').text()).toBe('0.8%');
  preferences.setProcessMemoryUnit('mb');

  await wrapper.get('[data-testid="widget_fold"]').trigger('click');
  expect(wrapper.get('[data-testid="widget_fold"]').attributes('aria-expanded')).toBe('false');
  expect(preferences.preferences.value.monitorCollapsed).toBe(true);
  preferences.setCollapsed(false);

  await wrapper.get('[data-testid="process_1"]').trigger('contextmenu');
  await flushPromises();
  await wrapper.get('[data-testid="process_restart"]').trigger('click');
  await flushPromises();
  expect(askNasShell).toHaveBeenCalledWith(
    'process-action',
    { id: 1, started: 900, action: 'restart' },
    125000,
  );
  wrapper.unmount();
});

it('leaves the idle processes out of the list unless the option says otherwise', async () => {
  const idle = process({ id: 70, name: 'idle', cpu: 0, ram: 0 });
  vi.mocked(readTelemetry).mockResolvedValue(telemetry({ processes: [...PROCESSES, idle] }));
  const preferences = usePreferences();
  preferences.setWidgetList('all');
  const wrapper = mount(MonitorWidget, { attachTo: document.body });
  await flushPromises();

  expect(wrapper.find('[data-testid="process_70"]').exists()).toBe(false);
  expect(wrapper.findAll('tbody tr')).toHaveLength(3);
  preferences.setWidgetHideQuiet(false);
  await flushPromises();
  expect(wrapper.find('[data-testid="process_70"]').exists()).toBe(true);
  preferences.setWidgetHideQuiet(true);
  wrapper.unmount();
});

it('says when nothing is chosen and when the machine cannot be read', async () => {
  vi.mocked(readTelemetry).mockRejectedValue(new Error('Launcher unavailable'));
  for (const id of usePreferences().preferences.value.widgetSensors) {
    usePreferences().toggleSensor(id);
  }
  const wrapper = mount(MonitorWidget);
  await flushPromises();

  expect(wrapper.get('[data-testid="widget_error"]').text()).toContain('Il launcher non risponde');
  expect(wrapper.get('[data-testid="widget_sensors"]').text()).toContain(
    'Nessun sensore selezionato',
  );
  wrapper.unmount();
});

it('shows a loading spinner until the first reading and keeps the table during later readings', async () => {
  vi.useFakeTimers();
  let release!: (value: ReturnType<typeof telemetry>) => void;
  vi.mocked(readTelemetry).mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const wrapper = mount(MonitorWidget);
  try {
    const loading = wrapper.get('[data-testid="widget_loading"]');
    expect(loading.element.tagName).toBe('OUTPUT');
    expect(loading.attributes('role')).toBeUndefined();
    expect(loading.text()).toBe('Caricamento in corso');
    expect(loading.find('[aria-hidden="true"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="process_table"]').exists()).toBe(false);

    release(telemetry());
    await flushPromises();
    expect(wrapper.find('[data-testid="widget_loading"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="process_table"]').exists()).toBe(true);

    await vi.advanceTimersByTimeAsync(usePreferences().preferences.value.refreshSeconds * 1000);
    expect(readTelemetry).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="widget_loading"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="process_table"]').exists()).toBe(true);
    release(telemetry());
    await flushPromises();
  } finally {
    wrapper.unmount();
    vi.useRealTimers();
  }
});
