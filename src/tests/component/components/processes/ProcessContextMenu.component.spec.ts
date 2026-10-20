import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, expect, it } from 'vitest';
import ProcessContextMenu from '@/components/processes/ProcessContextMenu.vue';
import { setLocale } from '@/i18n';
import { PROCESSES } from '@/tests/fixtures/telemetry';

beforeEach(() => setLocale('it'));
afterEach(() => {
  document.body.innerHTML = '';
});

const [worker, essential] = PROCESSES;
const at = new MouseEvent('contextmenu', { clientX: 5000, clientY: 20 });

it('offers to end a process that may end, and nothing it cannot do', async () => {
  const wrapper = mount(ProcessContextMenu, { attachTo: document.body });
  await wrapper.vm.show(worker!, at);

  const menu = wrapper.get('[data-testid="process_menu"]');
  expect(menu.text()).toContain('worker · 100');
  expect(parseFloat(menu.attributes('style') ?? '')).not.toBe(5000);
  expect(wrapper.find('[data-testid="process_restart"]').exists()).toBe(false);
  expect(document.activeElement).toBe(wrapper.get('[data-testid="process_terminate"]').element);

  await wrapper.get('[data-testid="process_terminate"]').trigger('click');
  expect(wrapper.emitted('act')).toEqual([[worker, 'terminate']]);
  expect(wrapper.find('[data-testid="process_menu"]').exists()).toBe(false);
  wrapper.unmount();
});

it('only restarts an essential process, and closes on Escape or outside', async () => {
  const wrapper = mount(ProcessContextMenu, { attachTo: document.body });
  await wrapper.vm.show(essential!, at);

  expect(wrapper.find('[data-testid="process_terminate"]').exists()).toBe(false);
  expect(wrapper.find('[data-testid="process_essential"]').exists()).toBe(false);
  await wrapper.get('[data-testid="process_restart"]').trigger('click');
  expect(wrapper.emitted('act')).toEqual([[essential, 'restart']]);

  await wrapper.vm.show(essential!, at);
  await wrapper.get('[data-testid="process_menu"]').trigger('keydown', { key: 'Escape' });
  expect(wrapper.find('[data-testid="process_menu"]').exists()).toBe(false);

  await wrapper.vm.show(essential!, at);
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await wrapper.vm.$nextTick();
  expect(wrapper.find('[data-testid="process_menu"]').exists()).toBe(false);
  wrapper.unmount();
});
