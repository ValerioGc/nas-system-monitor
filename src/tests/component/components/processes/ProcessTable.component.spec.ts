import { mount } from '@vue/test-utils';
import { beforeEach, expect, it } from 'vitest';
import ProcessTable from '@/components/processes/ProcessTable.vue';
import { setLocale } from '@/i18n';
import { usePreferences } from '@/composables/usePreferences';
import { PROCESSES } from '@/tests/fixtures/telemetry';
import type { ProcessEntry } from '@/types';

beforeEach(() => {
  setLocale('it');
  usePreferences().setProcessMemoryUnit('mb');
});

const names = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('tbody tr').map((row) => row.get('td').text());

it('lists the processes, busiest first, and sorts by any column both ways', async () => {
  const wrapper = mount(ProcessTable, { props: { processes: PROCESSES, acting: 50 } });

  expect(names(wrapper)).toEqual(['nas-os', 'worker', 'cron']);
  expect(wrapper.get('[data-testid="process_1"]').text()).toContain('12%');
  expect(wrapper.get('[data-testid="process_100"] td.column_gpu').text()).toBe('0%');
  expect(wrapper.get('[data-testid="process_100"]').text()).toContain('Utente');
  expect(wrapper.get('[data-testid="process_50"]').classes()).toContain('busy');

  await wrapper.get('[data-testid="process_sort_name"]').trigger('click');
  expect(names(wrapper)).toEqual(['cron', 'nas-os', 'worker']);
  await wrapper.get('[data-testid="process_sort_name"]').trigger('click');
  expect(names(wrapper)).toEqual(['worker', 'nas-os', 'cron']);
  await wrapper.get('[data-testid="process_sort_gpu"]').trigger('click');
  expect(names(wrapper)[0]).toBe('nas-os');
  expect(wrapper.get('th[aria-sort="descending"]').text()).toContain('GPU');
});

it('asks for the menu of a process with the right button or the keyboard', async () => {
  const wrapper = mount(ProcessTable, { props: { processes: PROCESSES, compact: true } });
  expect(wrapper.findAll('th').map((cell) => cell.text())).toEqual([
    'Nome',
    'Stato',
    'CPU',
    'GPU',
    'RAM',
  ]);
  expect(wrapper.get('[data-testid="process_100"]').attributes('title')).toBeUndefined();

  await wrapper.get('[data-testid="process_100"]').trigger('contextmenu');
  await wrapper.get('[data-testid="process_1"]').trigger('keydown', { key: 'ContextMenu' });
  await wrapper.get('[data-testid="process_1"]').trigger('keydown', { key: 'F10', shiftKey: true });
  await wrapper.get('[data-testid="process_1"]').trigger('keydown', { key: 'Enter' });
  expect(
    wrapper.emitted<[ProcessEntry, MouseEvent]>('context')?.map(([process]) => process.id),
  ).toEqual([100, 1, 1]);
});

it('says when there is nothing to list', () => {
  const wrapper = mount(ProcessTable, { props: { processes: [] } });
  expect(wrapper.get('[data-testid="process_empty"]').text()).toBe('Nessun processo');
});

it('switches memory between MB and a share of total RAM without changing the sort order', async () => {
  const wrapper = mount(ProcessTable, { props: { processes: PROCESSES, ramTotal: 8 } });
  expect(wrapper.get('[data-testid="process_100"] td.column_ram').text()).toBe('64 MB');
  await wrapper.get('[data-testid="process_sort_ram"]').trigger('click');
  const before = names(wrapper);

  usePreferences().setProcessMemoryUnit('percent');
  await wrapper.vm.$nextTick();
  expect(wrapper.get('[data-testid="process_100"] td.column_ram').text()).toBe('0.8%');
  expect(names(wrapper)).toEqual(before);

  await wrapper.setProps({ ramTotal: 0 });
  expect(wrapper.get('[data-testid="process_100"] td.column_ram').text()).toBe('-');
  await wrapper.setProps({ ramTotal: null });
  expect(wrapper.get('[data-testid="process_100"] td.column_ram').text()).toBe('-');
});
