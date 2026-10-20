<script setup lang="ts">

import { computed, ref } from 'vue';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/composables/usePreferences';
import { NasIcon } from '@valeriogc/nas-base-app';
import type { ProcessEntry } from '@/types';

import processesIcon from '@/assets/icons/processes.svg?url';

interface Props {
  processes: ProcessEntry[];
  ramTotal?: number | null;
  compact?: boolean;
  acting?: number | null;
}

const props = withDefaults(defineProps<Props>(), { compact: false, acting: null, ramTotal: null });

const emit = defineEmits<{ context: [process: ProcessEntry, event: MouseEvent] }>();

type Column = 'name' | 'id' | 'state' | 'cpu' | 'gpu' | 'ram' | 'kind';

const { t } = useI18n();
const { preferences } = usePreferences();
const sortBy = ref<Column>('cpu');
const descending = ref(true);

const columns = computed<Column[]>(() =>
  props.compact
    ? ['name', 'state', 'cpu', 'gpu', 'ram']
    : ['name', 'id', 'state', 'cpu', 'gpu', 'ram', 'kind'],
);

const NUMERIC = new Set<Column>(['id', 'cpu', 'gpu', 'ram']);

function value(process: ProcessEntry, column: Column): number | string {
  if (column === 'gpu') {
    return process.gpu ?? 0;
  }
  return process[column];
}

const rows = computed(() => {
  const direction = descending.value ? -1 : 1;
  return [...props.processes].sort((left, right) => {
    const a = value(left, sortBy.value);
    const b = value(right, sortBy.value);
    const order =
      typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
    return order * direction || left.id - right.id;
  });
});

function sort(column: Column) {
  if (sortBy.value === column) {
    descending.value = !descending.value;
  } else {
    sortBy.value = column;
    descending.value = NUMERIC.has(column);
  }
}

function sorted(column: Column) {
  if (sortBy.value !== column) {
    return 'none';
  }

  return descending.value ? 'descending' : 'ascending';
}

function cell(process: ProcessEntry, column: Column) {
  switch (column) {
    case 'cpu':
      return `${process.cpu}%`;
    case 'gpu':
      return `${process.gpu ?? 0}%`;
    case 'ram':
      if (preferences.value.processMemoryUnit === 'percent') {
        return props.ramTotal !== null && props.ramTotal > 0
          ? `${Math.round((process.ram / (props.ramTotal * 1024)) * 1000) / 10}%`
          : '-';
      }
      return `${process.ram} MB`;
    case 'state':
      return t.value.states[process.state];
    case 'kind':
      return t.value.kinds[process.kind];
    default:
      return String(process[column]);
  }
}

function keyed(process: ProcessEntry, event: KeyboardEvent) {
  if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
    event.preventDefault();
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    emit(
      'context',
      process,
      new MouseEvent('contextmenu', { clientX: box.left + 24, clientY: box.bottom }),
    );
  }
}

</script>

<template>
  <div
    class="process_table"
    :class="{ compact, process_table_empty: !processes.length }"
    data-testid="process_table"
  >
    <table>
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column"
            :class="`column_${column}`"
            :aria-sort="sorted(column)"
          >
            <button type="button" :data-testid="`process_sort_${column}`" @click="sort(column)">
              {{ t.columns[column] }}
            </button>
          </th>
        </tr>
      </thead>
      <tbody data-testid="process_rows">
        <tr
          v-for="process in rows"
          :key="process.id"
          tabindex="0"
          :class="{ busy: acting === process.id }"
          :title="compact ? undefined : process.process"
          :aria-label="t.actionsFor(process.name)"
          :data-testid="`process_${process.id}`"
          @contextmenu.prevent="emit('context', process, $event)"
          @keydown="keyed(process, $event)"
        >
          <td v-for="column in columns" :key="column" :class="`column_${column}`">
            {{ cell(process, column) }}
          </td>
        </tr>
      </tbody>
    </table>

    <output v-if="!processes.length" class="process_empty" data-testid="process_empty">
      <span class="process_empty_content" data-testid="process_empty_content">
        <span class="process_empty_icon"><NasIcon :svg="processesIcon" /></span>
        <span class="process_empty_title">{{ t.noProcesses }}</span>
      </span>
    </output>
  </div>
</template>

<style scoped lang="scss">

.process_table {
  @extend %fx_column;
  min-height: 0;
  overflow: hidden;

  &.process_table_empty table {
    flex: none;
  }
}

table {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

thead,
tbody {
  display: block;
  scrollbar-gutter: stable;
}

thead {
  flex: none;
  overflow: hidden;
  background: var(--table-heading-bg);
}

tbody {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

tr {
  display: table;
  width: 100%;
  table-layout: fixed;
}

th,
td {
  padding: 9px 10px;
  font-size: 13px;
  text-align: right;
  white-space: nowrap;
}

th {
  button {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--nas-muted);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  &[aria-sort='ascending'] button::after {
    content: ' ↑';
  }

  &[aria-sort='descending'] button::after {
    content: ' ↓';
  }
}

th.column_name,
td.column_name {
  @extend %text_ellipsis;
  width: 34%;
  text-align: left;
}

.column_state,
.column_kind {
  text-align: left;
}

td.column_state,
td.column_kind {
  color: var(--nas-muted);
}

tbody tr {
  cursor: context-menu;

  &:hover,
  &:focus-visible {
    background: var(--nas-hover);
  }

  &.busy {
    opacity: 0.5;
  }
}

.compact {
  th,
  td {
    padding: 7px 6px;
    font-size: 12px;
  }

  th.column_name,
  td.column_name {
    width: 38%;
  }
}

.process_empty {
  @extend %grid_center;
  flex: 1;
  min-height: $process_empty_min_height;
  padding: $process_empty_padding;
  text-align: center;
}

.process_empty_title {
  color: var(--nas-foreground);
  font-size: $process_empty_title_size;
  font-weight: 600;
}

.process_empty_content {
  @extend %fx_column;
  align-items: center;
  gap: $process_empty_gap;
}

.process_empty_icon {
  @extend %grid_center;
  --app-icon-size: #{$process_empty_icon_size};
  width: $process_empty_icon_box_size;
  height: $process_empty_icon_box_size;
  border-radius: $process_empty_icon_box_size * 0.5;
  color: var(--accent);
  background: var(--accent-soft);
}

</style>
