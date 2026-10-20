import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { h } from 'vue';
import CommonModal from '@/components/common/CommonModal.vue';
import { setLocale } from '@/i18n';

function modal(footer = false) {
  return mount(CommonModal, {
    props: { modelValue: true, title: 'Dettagli', 'onUpdate:modelValue': () => undefined },
    slots: {
      default: () => h('p', 'contenuto'),
      ...(footer ? { footer: () => h('button', 'Fatto') } : {}),
    },
    attachTo: document.body,
  });
}

beforeEach(() => setLocale('it'));
afterEach(() => {
  document.body.innerHTML = '';
});

describe('the modal', () => {
  it('opens as a native modal with its title and shows a footer only when given one', async () => {
    const wrapper = modal();
    await flushPromises();
    const dialog = wrapper.get('dialog');

    expect(dialog.attributes('aria-label')).toBe('Dettagli');
    expect(wrapper.text()).toContain('contenuto');
    expect(dialog.attributes('open')).toBeDefined();
    expect(wrapper.find('.modal_footer').exists()).toBe(false);
    expect(modal(true).find('.modal_footer').text()).toBe('Fatto');
  });

  it('closes with the button, with Escape and from the backdrop, not from inside', async () => {
    const wrapper = modal();
    await wrapper.get('[aria-label="Chiudi"]').trigger('click');
    await wrapper.get('dialog').trigger('cancel');
    await wrapper.get('.modal').trigger('click');
    await wrapper.get('dialog').trigger('click');

    expect(wrapper.emitted('update:modelValue')).toEqual([[false], [false], [false]]);
    await wrapper.setProps({ modelValue: false });
    expect(wrapper.find('dialog').exists()).toBe(false);
  });
});
