<script setup lang="ts">

import { computed, useTemplateRef } from 'vue';
import { useI18n } from '@/i18n';
import { usePreferences } from '@/composables/usePreferences';
import { useTelemetry } from '@/composables/useTelemetry';
import { chosen, filterProcesses, isQuiet } from '@/utils/sensors';
import { NasIcon, NasLoading } from '@valeriogc/nas-base-app';

import SensorCard from '@/components/monitor/SensorCard.vue';
import ProcessContextMenu from '@/components/processes/ProcessContextMenu.vue';
import ProcessTable from '@/components/processes/ProcessTable.vue';

import chevronIcon from '@/assets/icons/chevron.svg?url';

const { t } = useI18n();
const { preferences, setCollapsed } = usePreferences();
const { sensors, processes, telemetry, error, actionError, acting, act } = useTelemetry();

const menu = useTemplateRef<InstanceType<typeof ProcessContextMenu>>('menu');

const cards = computed(() => chosen(sensors.value, preferences.value.widgetSensors));
const listed = computed(() =>
  filterProcesses(processes.value, preferences.value.widgetList).filter(
    (process) => !preferences.value.widgetHideQuiet || !isQuiet(process),
  ),
);

const collapsed = computed(() => preferences.value.monitorCollapsed);

</script>

<template>
  <main class="monitor_widget" :aria-label="t.appName" data-testid="monitor_widget">
    <p v-if="error" class="alert" role="alert" data-testid="widget_error">{{ error }}</p>
    <NasLoading
      v-else-if="!telemetry"
      class="widget_loading"
      :label="t.loading"
      data-testid="widget_loading"
    />

    <template v-if="telemetry || error">
      <section class="widget_monitor" :aria-label="t.sections.monitor">
        <button
          type="button"
          class="widget_fold"
          :aria-expanded="!collapsed"
          aria-controls="widget_sensors"
          data-testid="widget_fold"
          @click="setCollapsed(!collapsed)"
        >
          <span>{{ t.sections.monitor }}</span>
          <NasIcon :svg="chevronIcon" :class="{ folded: collapsed }" />
          <span class="sr_only">{{ collapsed ? t.showMonitor : t.hideMonitor }}</span>
        </button>
        <div v-show="!collapsed" id="widget_sensors" data-testid="widget_sensors">
          <div v-if="cards.length" class="widget_cards">
            <SensorCard v-for="sensor in cards" :key="sensor.id" :sensor="sensor" />
          </div>
          <p v-else class="muted">{{ t.noWidgetSensors }}</p>
        </div>
      </section>

      <section class="widget_processes" :aria-label="t.sections.processes">
        <h2>
          {{ t.sections.processes }}
          <small class="muted">{{ t.filters[preferences.widgetList] }} · {{ listed.length }}</small>
        </h2>
        <p v-if="actionError" class="alert" role="alert" data-testid="process_action_error">
          {{ actionError }}
        </p>
        <ProcessTable
          compact
          :processes="listed"
          :ram-total="telemetry?.metrics.ramTotal ?? null"
          :acting="acting"
          @context="(process, event) => menu?.show(process, event)"
        />
      </section>
      <ProcessContextMenu ref="menu" @act="act" />
    </template>
  </main>
</template>

<style scoped lang="scss">

.monitor_widget {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100vh;
  padding: 2px;
  overflow: hidden;
}

.widget_monitor {
  display: grid;
  gap: 10px;
}

.widget_loading {
  flex: 1;
  min-height: 0;
}

.widget_fold {
  --app-icon-size: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 2px;
  border: 0;
  background: transparent;
  color: var(--nas-foreground);
  font-size: 15px;
  font-weight: 700;

  &[aria-expanded='false'] {
    padding-bottom: 10px;
    border-bottom: 1px solid var(--border);
  }

  .app_icon {
    transition: transform 150ms ease;
  }

  .folded {
    transform: rotate(-90deg);
  }
}

.widget_cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;

  :deep(.sensor_card) {
    padding: 10px 12px;
  }

  :deep(.sensor_value) {
    font-size: 18px;
  }
}

.widget_processes {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-height: 0;

  h2 {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin: 0;
    padding: 0 2px;
    font-size: 15px;
  }

  :deep(.process_table) {
    flex: 1;
  }
}

</style>
