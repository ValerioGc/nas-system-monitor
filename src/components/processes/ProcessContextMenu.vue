<script setup lang="ts">

import { nextTick, onBeforeUnmount, ref } from 'vue';
import { useI18n } from '@/i18n';
import type { ProcessAction, ProcessEntry } from '@/types';
import { NasIcon } from '@valeriogc/nas-base-app';

import refreshIcon from '@/assets/icons/refresh.svg?url';
import terminateIcon from '@/assets/icons/terminate.svg?url';

const emit = defineEmits<{ act: [process: ProcessEntry, action: ProcessAction] }>();

const { t } = useI18n();
const target = ref<ProcessEntry | null>(null);
const place = ref({ x: 0, y: 0 });
const menu = ref<HTMLElement | null>(null);

const WIDTH = 220;
const HEIGHT = 120;

function close() {
  target.value = null;
  document.removeEventListener('pointerdown', outside);
}

function outside(event: PointerEvent) {
  if (event.target instanceof Node && !menu.value?.contains(event.target)) {
    close();
  }
}

/** Opens the menu at the pointer, kept inside the viewport. */
async function show(process: ProcessEntry, event: MouseEvent) {
  target.value = process;
  place.value = {
    x: Math.max(0, Math.min(event.clientX, window.innerWidth - WIDTH)),
    y: Math.max(0, Math.min(event.clientY, window.innerHeight - HEIGHT)),
  };
  document.addEventListener('pointerdown', outside);
  await nextTick();
  menu.value?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
}

function pick(action: ProcessAction) {
  const process = target.value;
  close();
  if (process) {
    emit('act', process, action);
  }
}

onBeforeUnmount(close);

defineExpose({ show });

</script>

<template>
  <div
    v-if="target"
    ref="menu"
    class="process_menu surface_card"
    role="menu"
    :aria-label="t.actionsFor(target.name)"
    :style="{ left: `${place.x}px`, top: `${place.y}px` }"
    data-testid="process_menu"
    @keydown.esc="close"
  >
    <p class="process_menu_title">{{ target.name }} · {{ target.id }}</p>
    <button
      v-if="target.canTerminate"
      type="button"
      role="menuitem"
      class="danger"
      data-testid="process_terminate"
      @click="pick('terminate')"
    >
      <NasIcon :svg="terminateIcon" />
      {{ t.terminate }}
    </button>
    <button
      v-if="target.canRestart"
      type="button"
      role="menuitem"
      data-testid="process_restart"
      @click="pick('restart')"
    >
      <NasIcon :svg="refreshIcon" />
      {{ t.restart }}
    </button>
  </div>
</template>

<style scoped lang="scss">

.process_menu {
  position: fixed;
  z-index: 30;
  display: grid;
  min-width: 200px;
  max-width: 260px;
  padding: 6px;
  box-shadow: 0 10px 30px rgb(0 0 0 / 22%);

  button {
    --app-icon-size: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border: 0;
    border-radius: 7px;
    background: transparent;
    color: var(--nas-foreground);
    text-align: left;

    &:hover:not(:disabled),
    &:focus-visible {
      background: var(--nas-hover);
    }

    &.danger:not(:disabled) {
      color: var(--nas-error);
    }
  }
}

.process_menu_title {
  @extend %text_ellipsis;
  margin: 0;
  padding: 4px 10px 6px;
  color: var(--nas-muted);
  font-size: 12px;
}

</style>
