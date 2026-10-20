<script setup lang="ts">

import { computed, ref, useTemplateRef } from 'vue';
import { useI18n } from '@/i18n';
import type { ProcessAction, ProcessEntry, ProcessFilter } from '@/types';
import { filterProcesses, isQuiet } from '@/utils/sensors';

import ProcessContextMenu from '@/components/processes/ProcessContextMenu.vue';
import ProcessFilterPicker from '@/components/processes/ProcessFilterPicker.vue';
import ProcessTable from '@/components/processes/ProcessTable.vue';

const { t } = useI18n();

interface Props {
  processes: ProcessEntry[];
  ramTotal?: number | null;
  acting: number | null;
  actionError: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{ act: [process: ProcessEntry, action: ProcessAction] }>();

const filter = ref<ProcessFilter>('all');
const hideQuiet = ref(true);
const menu = useTemplateRef<InstanceType<typeof ProcessContextMenu>>('menu');

const shown = computed(() =>
  filterProcesses(props.processes, filter.value).filter(
    (process) => !hideQuiet.value || !isQuiet(process),
  ),
);

</script>

<template>
  <section class="processes_page" :aria-label="t.sections.processes">
    <header class="page_header">
      <h1>{{ t.sections.processes }}</h1>
      <p>{{ t.processesIntro }}</p>
    </header>

    <div class="processes_toolbar">
      <div class="processes_filters">
        <ProcessFilterPicker v-model="filter" :label="t.filterLabel" testid="process_filter" />
        <button
          type="button"
          class="quiet_toggle"
          :aria-pressed="hideQuiet"
          :title="t.hideQuietHint"
          data-testid="process_hide_quiet"
          @click="hideQuiet = !hideQuiet"
        >
          {{ t.hideQuiet }}
        </button>
      </div>
      <output class="muted" data-testid="process_count">{{ t.processCount(shown.length) }}</output>
    </div>

    <p v-if="actionError" class="alert" role="alert" data-testid="process_action_error">
      {{ actionError }}
    </p>

    <ProcessTable
      class="surface_card"
      :processes="shown"
      :ram-total="ramTotal"
      :acting="acting"
      @context="(process, event) => menu?.show(process, event)"
    />
    <ProcessContextMenu ref="menu" @act="(process, action) => emit('act', process, action)" />
  </section>
</template>

<style scoped lang="scss">

.processes_page {
  @extend %fx_column;
  flex: 1;
  min-height: 0;
  gap: 16px;
}

.page_header,
.processes_toolbar,
.alert {
  flex-shrink: 0;
}

.processes_page :deep(.process_table) {
  flex: 1;
}

.page_header {
  margin-bottom: 12px;
}

.processes_toolbar {
  @extend %fx_between;
  gap: 12px;
  flex-wrap: wrap;
}

.processes_filters {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.quiet_toggle {
  padding: 7px 14px;
  border: 1px solid var(--nas-border);
  border-radius: 9px;
  background: var(--nas-surface);
  color: var(--nas-foreground);
  font-size: 13px;

  &[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: #ffffff;
  }
}

</style>
