import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it } from 'vitest';
import ProcessesPage from '@/components/sections/ProcessesPage.vue';
import { setLocale } from '@/i18n';
import { PROCESSES, process } from '@/tests/fixtures/telemetry';

beforeEach(() => setLocale('it'));
afterEach(() => {
  document.body.innerHTML = '';
});

it('filters the processes and acts on one from its menu', async () => {
  const wrapper = mount(ProcessesPage, {
    props: { processes: PROCESSES, acting: null, actionError: 'refused' },
    attachTo: document.body,
  });
  expect(wrapper.get('[data-testid="process_count"]').text()).toBe('3 processi');
  expect(wrapper.get('[data-testid="process_action_error"]').text()).toBe('refused');

  await wrapper.get('[data-testid="process_filter_system"]').trigger('click');
  expect(wrapper.get('[data-testid="process_count"]').text()).toBe('1 processi');
  expect(wrapper.find('[data-testid="process_50"]').exists()).toBe(true);

  await wrapper.get('[data-testid="process_50"]').trigger('contextmenu');
  await flushPromises();
  await wrapper.get('[data-testid="process_terminate"]').trigger('click');
  expect(wrapper.emitted('act')).toEqual([[PROCESSES[2], 'terminate']]);
  wrapper.unmount();
});

it('hides inactive processes by default and allows showing them', async () => {
  const kworker = process({ id: 7, name: 'kworker/0:1', state: 'idle', cpu: 0, gpu: null, ram: 0 });
  const wrapper = mount(ProcessesPage, {
    props: { processes: [...PROCESSES, kworker], acting: null, actionError: '' },
  });
  expect(wrapper.get('[data-testid="process_count"]').text()).toBe('3 processi');
  expect(wrapper.find('[data-testid="process_7"]').exists()).toBe(false);
  const toggle = wrapper.get('[data-testid="process_hide_quiet"]');
  expect(toggle.text()).toBe('Nascondi inattivi');
  expect(toggle.attributes('title')).toBe(
    'Nasconde i processi in attesa che non consumano risorse',
  );
  expect(toggle.attributes('aria-pressed')).toBe('true');

  await toggle.trigger('click');
  expect(toggle.attributes('aria-pressed')).toBe('false');
  expect(wrapper.get('[data-testid="process_count"]').text()).toBe('4 processi');
  expect(wrapper.find('[data-testid="process_7"]').exists()).toBe(true);
  await toggle.trigger('click');
  expect(toggle.attributes('aria-pressed')).toBe('true');
  expect(wrapper.find('[data-testid="process_7"]').exists()).toBe(false);
  wrapper.unmount();
});
