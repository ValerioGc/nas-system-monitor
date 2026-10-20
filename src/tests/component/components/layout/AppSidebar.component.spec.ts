import { mount } from '@vue/test-utils';
import { beforeEach, expect, it } from 'vitest';
import AppSidebar from '@/components/layout/AppSidebar.vue';
import { setLocale } from '@/i18n';

beforeEach(() => setLocale('it'));

it('lists the two sections, changes the current one and opens the options', async () => {
  const wrapper = mount(AppSidebar, { props: { modelValue: 'monitor' } });

  expect(wrapper.findAll('nav button').map((button) => button.text())).toEqual([
    'Monitor',
    'Processi',
  ]);
  expect(wrapper.get('[data-testid="section_monitor"]').attributes('aria-current')).toBe('page');
  expect(wrapper.text()).not.toContain('Monitor sistema');
  expect(wrapper.text()).not.toContain('Sezioni');
  expect(wrapper.find('.brand').exists()).toBe(false);
  expect(wrapper.get('[data-testid="options_open"]').text()).toBe('Impostazioni');

  await wrapper.get('[data-testid="section_processes"]').trigger('click');
  expect(wrapper.emitted('update:modelValue')).toEqual([['processes']]);
  await wrapper.get('[data-testid="options_open"]').trigger('click');
  expect(wrapper.emitted('options')).toHaveLength(1);
});
