import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import MonitorPage from '@/components/sections/MonitorPage.vue';
import { readSmart } from '@/services/nasShell';
import { setLocale } from '@/i18n';
import { SENSORS, sensor, telemetry } from '@/tests/fixtures/telemetry';

vi.mock('@/services/nasShell', () => ({ readSmart: vi.fn() }));

beforeEach(() => {
  localStorage.clear();
  setLocale('it');
});

it('shows the sensors part by part, the summary, and puts a sensor in the widget', async () => {
  const wrapper = mount(MonitorPage, {
    props: { sensors: SENSORS, metrics: telemetry().metrics },
  });

  expect(wrapper.get('[data-testid="group_cpu"]').findAll('.sensor_card')).toHaveLength(3);
  expect(wrapper.get('[data-testid="group_gpu"]').text()).toContain('Nessun sensore disponibile');
  expect(wrapper.get('[data-testid="summary_uptime"]').text()).toBe('1 g 1 h');
  expect(wrapper.get('[data-testid="summary_cores"]').text()).toBe('4');
  expect(wrapper.get('[data-testid="summary_threads"]').text()).toBe('8');
  expect(wrapper.get('[data-testid="summary_ram"]').text()).toBe('6 / 8 GB');
  expect(
    wrapper
      .get('[data-testid="summary"]')
      .findAll('dt')
      .map((item) => item.text()),
  ).toEqual(['Core', 'Thread', 'RAM utilizzata / totale', 'Acceso da']);
  expect(wrapper.get('[data-testid="widget_count"]').text()).toBe('2 di 6 nel widget');

  await wrapper.get('[data-testid="sensor_pin_disk-sda-usage"]').trigger('click');
  expect(wrapper.get('[data-testid="widget_count"]').text()).toBe('3 di 6 nel widget');
});

it('leaves the summary out until the machine is read, and counts hours alone', async () => {
  const wrapper = mount(MonitorPage, { props: { sensors: [], metrics: null } });
  expect(wrapper.find('[data-testid="summary"]').exists()).toBe(false);

  await wrapper.setProps({ metrics: { ...telemetry().metrics, uptime: 7200 } });
  expect(wrapper.get('[data-testid="summary_uptime"]').text()).toBe('2 h');
});

it('keeps logical threads separate when physical topology is unavailable or the launcher is older', async () => {
  const metrics = { ...telemetry().metrics };
  delete metrics.physicalCores;
  const wrapper = mount(MonitorPage, { props: { sensors: [], metrics } });
  expect(wrapper.get('[data-testid="summary_cores"]').text()).toBe('-');
  expect(wrapper.get('[data-testid="summary_threads"]').text()).toBe('8');

  await wrapper.setProps({ metrics: { ...metrics, physicalCores: null } });
  expect(wrapper.get('[data-testid="summary_cores"]').text()).toBe('-');
});

it('reads on request the disks that no sensor warms, and says why a disk gave no degrees', async () => {
  const disk = (name: string) =>
    sensor({ id: `disk-${name}-usage`, group: 'disk', device: `${name} (HDD)`, label: 'activity' });
  let release = () => {};
  const held = new Promise<unknown>((resolve) => {
    release = () => resolve({ temperature: { current: 38 } });
  });
  const answers: Record<string, () => Promise<unknown>> = {
    sda: () => held,
    sdb: () => Promise.resolve({ standby: true }),
    sdc: () => Promise.resolve({ smart_status: { passed: true } }),
    sdd: () => Promise.reject(new Error('device not found')),
    sde: () => Promise.reject(new Error()),
  };
  vi.mocked(readSmart).mockImplementation((device) => answers[device]?.() ?? Promise.resolve(null));
  const wrapper = mount(MonitorPage, {
    props: {
      sensors: [...SENSORS, ...['sdb', 'sdc', 'sdd', 'sde'].map(disk)],
      metrics: telemetry().metrics,
    },
  });
  expect(readSmart).not.toHaveBeenCalled();

  const button = wrapper.get('[data-testid="disk_read_temperatures"]');
  await button.trigger('click');
  expect(button.text()).toBe('Lettura in corso');
  expect(button.attributes('disabled')).toBeDefined();
  release();
  await flushPromises();

  expect(button.text()).toBe('Leggi temperature');
  expect(wrapper.get('[data-testid="sensor_disk-sda-smart"]').text()).toContain('38 °C');
  expect(wrapper.find('[data-testid="sensor_pin_disk-sda-smart"]').exists()).toBe(false);
  expect(wrapper.get('[data-testid="disk_note_sdb"]').text()).toContain('in standby');
  expect(wrapper.get('[data-testid="disk_note_sdc"]').text()).toContain('nessuna temperatura');
  expect(wrapper.get('[data-testid="disk_note_sdd"]').text()).toContain('device not found');
  expect(wrapper.get('[data-testid="disk_note_sde"]').text()).toBe(
    'sde (HDD) · lettura non riuscita',
  );
});

it('offers no reading when every disk already has a temperature from its sensors', () => {
  const wrapper = mount(MonitorPage, {
    props: {
      sensors: [
        sensor({
          id: 'disk-nvme0n1-temp-0',
          group: 'disk',
          device: 'nvme0n1',
          metric: 'temperature',
        }),
      ],
      metrics: null,
    },
  });
  expect(wrapper.find('[data-testid="disk_read_temperatures"]').exists()).toBe(false);
});
