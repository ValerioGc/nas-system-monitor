import { mount } from '@vue/test-utils';
import { beforeEach, expect, it } from 'vitest';
import MonitorPage from '@/components/sections/MonitorPage.vue';
import { setLocale } from '@/i18n';
import { SENSORS, telemetry } from '@/tests/fixtures/telemetry';

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
