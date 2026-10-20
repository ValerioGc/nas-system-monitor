import { mount } from '@vue/test-utils';
import { beforeEach, expect, it } from 'vitest';
import ProcessFilterPicker from '@/components/processes/ProcessFilterPicker.vue';
import { setLocale } from '@/i18n';

beforeEach(() => setLocale('it'));

it('offers all processes first, then user, NAS and system, and marks the chosen one', async () => {
  const wrapper = mount(ProcessFilterPicker, {
    props: { modelValue: 'all', label: 'Filtro', testid: 'filter' },
  });

  expect(wrapper.findAll('button').map((button) => button.text())).toEqual([
    'Tutti',
    'Utente',
    'NAS',
    'Sistema',
  ]);
  expect(wrapper.get('[data-testid="filter_all"]').attributes('aria-pressed')).toBe('true');
  await wrapper.get('[data-testid="filter_system"]').trigger('click');
  expect(wrapper.emitted('update:modelValue')).toEqual([['system']]);
});
