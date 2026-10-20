<script setup lang="ts">

import { computed } from 'vue';
import { useI18n } from '@/i18n';
import { usePreferences, WIDGET_SENSOR_LIMIT } from '@/composables/usePreferences';
import type { Sensor, SensorGroup, SystemMetrics } from '@/types';
import { GROUPS, inGroup } from '@/utils/sensors';
import { NasIcon } from '@valeriogc/nas-base-app';

import SensorCard from '@/components/monitor/SensorCard.vue';

import cpu from '@/assets/icons/cpu.svg?url';
import disk from '@/assets/icons/disk.svg?url';
import gpu from '@/assets/icons/gpu.svg?url';
import ram from '@/assets/icons/ram.svg?url';

const GROUP_ICONS: Record<SensorGroup, string> = { cpu, gpu, ram, disk };

interface Props {
  sensors: Sensor[];
  metrics: SystemMetrics | null;
}

const props = defineProps<Props>();

const { t } = useI18n();
const { preferences, toggleSensor } = usePreferences();

const full = computed(() => preferences.value.widgetSensors.length >= WIDGET_SENSOR_LIMIT);

const summary = computed(() => {
  const machine = props.metrics;
  if (!machine) {
    return [];
  }
  const days = Math.floor(machine.uptime / 86400);
  const hours = Math.floor((machine.uptime % 86400) / 3600);
  return [
    { key: 'cores', value: String(machine.physicalCores ?? '-') },
    { key: 'threads', value: String(machine.cores) },
    { key: 'ram', value: `${machine.ram} / ${machine.ramTotal} GB` },
    {
      key: 'uptime',
      value: days > 0 ? t.value.durationDays(days, hours) : t.value.durationHours(hours),
    },
  ] as const;
});

</script>

<template>
  <section :aria-label="t.sections.monitor">
    <header class="page_header">
      <h1>{{ t.sections.monitor }}</h1>
      <p>{{ t.monitorIntro }}</p>
      <p class="widget_count" data-testid="widget_count">
        {{ t.widgetCount(preferences.widgetSensors.length) }}
      </p>
    </header>

    <dl v-if="summary.length" class="summary" data-testid="summary">
      <div v-for="item in summary" :key="item.key" class="surface_card">
        <dt>{{ t.summary[item.key] }}</dt>
        <dd :data-testid="`summary_${item.key}`">{{ item.value }}</dd>
      </div>
    </dl>

    <section
      v-for="group in GROUPS"
      :key="group"
      class="sensor_group"
      :aria-label="t.groups[group]"
      :data-testid="`group_${group}`"
    >
      <h2><NasIcon :svg="GROUP_ICONS[group]" /> {{ t.groups[group] }}</h2>
      <div v-if="inGroup(sensors, group).length" class="sensor_grid">
        <SensorCard
          v-for="sensor in inGroup(sensors, group)"
          :key="sensor.id"
          :sensor="sensor"
          :pinned="preferences.widgetSensors.includes(sensor.id)"
          :full="full"
          @toggle="toggleSensor(sensor.id)"
        />
      </div>
      <p v-else class="muted sensor_none">{{ t.noSensors }}</p>
    </section>
  </section>
</template>

<style scoped lang="scss">

.widget_count {
  font-size: 13px;
}

.summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin: 0 0 28px;

  div {
    padding: 12px 16px;
  }

  dt {
    color: var(--nas-muted);
    font-size: 12px;
  }

  dd {
    margin: 0;
    font-weight: 700;
  }
}

.sensor_group {
  margin-bottom: 28px;

  h2 {
    --app-icon-size: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px;
    font-size: 17px;
  }
}

.sensor_grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.sensor_none {
  padding: 4px 0;
}

</style>
