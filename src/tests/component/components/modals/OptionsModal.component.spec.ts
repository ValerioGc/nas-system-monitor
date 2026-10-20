import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it } from 'vitest';
import OptionsModal from '@/components/modals/OptionsModal.vue';
import { usePreferences } from '@/composables/usePreferences';
import { setLocale } from '@/i18n';
import { SENSORS } from '@/tests/fixtures/telemetry';

beforeEach(() => setLocale('it'));
afterEach(() => {
  document.body.innerHTML = '';
});

it('chooses the list of the widget, the refresh and the sensors to keep', async () => {
  const { preferences, toggleSensor } = usePreferences();
  toggleSensor('gone');
  const wrapper = mount(OptionsModal, {
    props: { modelValue: true, sensors: SENSORS },
    attachTo: document.body,
  });

  await wrapper.get('[data-testid="options_list_user"]').trigger('click');
  expect(preferences.value.widgetList).toBe('user');
  expect(preferences.value.widgetHideQuiet).toBe(true);
  await wrapper.get('[data-testid="options_hide_quiet"]').setValue(false);
  expect(preferences.value.widgetHideQuiet).toBe(false);
  await wrapper.get('[data-testid="options_hide_quiet"]').setValue(true);
  expect(preferences.value.widgetHideQuiet).toBe(true);
  await wrapper.get('[data-testid="options_ram_unit"]').setValue('percent');
  expect(preferences.value.processMemoryUnit).toBe('percent');
  await wrapper.get('[data-testid="options_ram_unit"]').setValue('mb');
  expect(preferences.value.processMemoryUnit).toBe('mb');

  const refresh = wrapper.get('[data-testid="options_refresh"]');
  await refresh.setValue('1');
  expect(preferences.value.refreshSeconds).toBe(5);
  await refresh.setValue('12');
  expect(preferences.value.refreshSeconds).toBe(12);

  expect(wrapper.text()).toContain('CPU · Utilizzo');
  expect(wrapper.text()).toContain('gone');
  await wrapper.get('[data-testid="options_remove_gone"]').trigger('click');
  await wrapper.get('[data-testid="options_remove_cpu-usage"]').trigger('click');
  await wrapper.get('[data-testid="options_remove_ram-usage"]').trigger('click');
  expect(wrapper.text()).toContain('Nessun sensore selezionato');
  wrapper.unmount();
});

it('reorders the sensors of the widget from the list', async () => {
  const { preferences, toggleSensor } = usePreferences();
  for (const id of [...preferences.value.widgetSensors]) {
    toggleSensor(id);
  }
  toggleSensor('cpu-usage');
  toggleSensor('ram-usage');
  const wrapper = mount(OptionsModal, {
    props: { modelValue: true, sensors: SENSORS },
    attachTo: document.body,
  });
  const names = () => wrapper.findAll('.option_sensors li > span').map((item) => item.text());

  expect(names()).toEqual(['CPU · Utilizzo', 'RAM · Utilizzo']);
  expect(wrapper.get('[data-testid="options_up_cpu-usage"]').attributes('disabled')).toBeDefined();
  expect(
    wrapper.get('[data-testid="options_down_ram-usage"]').attributes('disabled'),
  ).toBeDefined();
  const down = wrapper.get('[data-testid="options_down_cpu-usage"]');
  expect(down.attributes('aria-label')).toBe('Sposta CPU · Utilizzo più in basso');
  await down.trigger('click');
  expect(preferences.value.widgetSensors).toEqual(['ram-usage', 'cpu-usage']);
  expect(names()).toEqual(['RAM · Utilizzo', 'CPU · Utilizzo']);
  await wrapper.get('[data-testid="options_up_cpu-usage"]').trigger('click');
  expect(preferences.value.widgetSensors).toEqual(['cpu-usage', 'ram-usage']);
  wrapper.unmount();
});
