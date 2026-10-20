<script setup lang="ts">

import { useI18n } from '@/i18n';
import type { ProcessFilter } from '@/types';

interface Props {
  label: string;
  testid: string;
}

defineProps<Props>();

const filter = defineModel<ProcessFilter>({ required: true });

const FILTERS: ProcessFilter[] = ['all', 'user', 'nas', 'system'];

const { t } = useI18n();

</script>

<template>
  <fieldset class="segmented" :aria-label="label">
    <button
      v-for="option in FILTERS"
      :key="option"
      type="button"
      :aria-pressed="filter === option"
      :data-testid="`${testid}_${option}`"
      @click="filter = option"
    >
      {{ t.filters[option] }}
    </button>
  </fieldset>
</template>

<style scoped lang="scss">

.segmented {
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  min-inline-size: 0;
  margin: 0;
  padding: 0;
  border: 1px solid var(--nas-border);
  border-radius: 9px;
  overflow: hidden;

  button {
    padding: 7px 14px;
    border: 0;
    background: var(--nas-surface);
    color: var(--nas-foreground);
    font-size: 13px;

    & + button {
      border-left: 1px solid var(--nas-border);
    }

    &[aria-pressed='true'] {
      background: var(--accent);
      color: #ffffff;
    }
  }
}

</style>
