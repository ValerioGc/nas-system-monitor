<script setup lang="ts">

import { computed } from 'vue';
import { useI18n } from '@/i18n';
import type { Sensor } from '@/types';
import { fill, formatValue, tone } from '@/utils/sensors';
import { NasIcon } from '@valeriogc/nas-base-app';
import pinIcon from '@/assets/icons/pin.svg?url';
import pinFilledIcon from '@/assets/icons/pin-filled.svg?url';

interface Props {
  sensor: Sensor;
  pinned?: boolean;
  full?: boolean;
}

const props = withDefaults(defineProps<Props>(), { pinned: undefined, full: false });

const emit = defineEmits<{ toggle: [sensor: Sensor] }>();

const { t } = useI18n();
const share = computed(() => fill(props.sensor));

const place = computed(
  () =>
    `${props.sensor.device} · ${t.value.sensorLabels[props.sensor.label] ?? props.sensor.label}`,
);

const pinLabel = computed(() => {
  if (props.pinned) {
    return t.value.removeFromWidget;
  }
  return props.full ? t.value.widgetFull : t.value.addToWidget;
});

</script>

<template>
  <article
    :class="['sensor_card', 'surface_card', `tone_${tone(sensor)}`]"
    :data-testid="`sensor_${sensor.id}`"
  >
    <div class="sensor_heading">
      <span class="sensor_text">
        <strong>{{ t.metrics[sensor.metric] }}</strong>
        <small :title="place">{{ place }}</small>
      </span>
      <button
        v-if="pinned !== undefined"
        type="button"
        class="icon_button sensor_pin"
        :aria-pressed="pinned"
        :aria-label="pinLabel"
        :title="pinLabel"
        :disabled="!pinned && full"
        :data-testid="`sensor_pin_${sensor.id}`"
        @click="emit('toggle', sensor)"
      >
        <NasIcon :svg="pinned ? pinFilledIcon : pinIcon" />
      </button>
    </div>
    <output class="sensor_value">{{ formatValue(sensor) }}</output>
    <span v-if="share !== null" class="sensor_bar" aria-hidden="true">
      <span :style="{ width: `${share * 100}%` }"></span>
    </span>
  </article>
</template>

<style scoped lang="scss">

.sensor_card {
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 14px 16px;
}

.sensor_heading {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.sensor_text {
  display: grid;
  flex: 1;
  min-width: 0;

  strong {
    font-size: 13px;
  }

  small {
    @extend %text_ellipsis;
    color: var(--nas-muted);
    font-size: 12px;
  }
}

.sensor_pin {
  margin: -6px -8px 0 0;

  &[aria-pressed='true'] {
    color: var(--accent);
    background: var(--accent-soft);
  }
}

.sensor_value {
  font-size: 22px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.sensor_bar {
  height: 6px;
  border-radius: 999px;
  background: var(--nas-sunken);
  overflow: hidden;

  span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--sensor-tone);
    transition: width 300ms ease;
  }
}

.tone_normal {
  --sensor-tone: var(--accent);
}

.tone_warning {
  --sensor-tone: var(--tone-warning);
}

.tone_danger {
  --sensor-tone: var(--nas-error);
}

</style>
