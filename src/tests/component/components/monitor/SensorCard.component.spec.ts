import { mount } from '@vue/test-utils';
import { beforeEach, expect, it } from 'vitest';
import SensorCard from '@/components/monitor/SensorCard.vue';
import { setLocale } from '@/i18n';
import { sensor } from '@/tests/fixtures/telemetry';

beforeEach(() => setLocale('it'));

it('shows the reading with a bar, and a widget toggle only where one can be chosen', async () => {
  const plain = mount(SensorCard, { props: { sensor: sensor({ value: 95 }) } });
  expect(plain.text()).toContain('Utilizzo');
  expect(plain.text()).toContain('95%');
  expect(plain.text()).toContain('CPU · utilizzo');
  expect(plain.classes()).toContain('tone_danger');
  expect(plain.find('button').exists()).toBe(false);

  const pinned = mount(SensorCard, { props: { sensor: sensor(), pinned: true, full: true } });
  const pin = pinned.get('[data-testid="sensor_pin_cpu-usage"]');
  expect(pin.attributes('aria-label')).toBe('Togli dal widget');
  expect(pin.attributes('disabled')).toBeUndefined();
  expect(pin.get('.app_icon').attributes('style')).toContain("fill='black'");
  await pin.trigger('click');
  expect(pinned.emitted('toggle')).toHaveLength(1);
});

it('cannot add a sensor to a full widget, and draws no bar for watts', () => {
  const full = mount(SensorCard, {
    props: { sensor: sensor({ metric: 'tdp', value: 65 }), pinned: false, full: true },
  });
  const pin = full.get('button');
  expect(pin.attributes('disabled')).toBeDefined();
  expect(pin.attributes('title')).toBe('Il widget mostra già sei sensori');
  expect(full.find('.sensor_bar').exists()).toBe(false);

  const free = mount(SensorCard, {
    props: { sensor: sensor({ device: 'GPU', label: 'unknown-label' }), pinned: false },
  });
  expect(free.text()).toContain('GPU · unknown-label');
  expect(free.get('button').attributes('title')).toBe('Mostra nel widget');
  expect(free.get('.app_icon').attributes('style')).not.toContain("fill='black'");
});
