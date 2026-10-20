<script setup lang="ts">

import { computed, useId } from 'vue';
import { useI18n } from '@/i18n';
import { REFRESH_SECONDS, usePreferences } from '@/composables/usePreferences';
import type { ProcessFilter, ProcessMemoryUnit, Sensor } from '@/types';
import { NasIcon, NasNumberStepper, NasSwitch } from '@valeriogc/nas-base-app';

import CommonModal from '@/components/common/CommonModal.vue';
import ProcessFilterPicker from '@/components/processes/ProcessFilterPicker.vue';

import chevronIcon from '@/assets/icons/chevron.svg?url';
import closeIcon from '@/assets/icons/close.svg?url';

interface Props {
  sensors: Sensor[];
}

const props = defineProps<Props>();
const refreshInputId = useId();
const memoryInputId = useId();

const open = defineModel<boolean>({ required: true });

const { t } = useI18n();
const {
  preferences,
  setWidgetList,
  setWidgetHideQuiet,
  setRefresh,
  setProcessMemoryUnit,
  toggleSensor,
  moveSensor,
} = usePreferences();

const widgetList = computed({
  get: () => preferences.value.widgetList,
  set: (value: ProcessFilter) => setWidgetList(value),
});

const widgetHideQuiet = computed({
  get: () => preferences.value.widgetHideQuiet,
  set: (value: boolean) => setWidgetHideQuiet(value),
});

const processMemoryUnit = computed({
  get: () => preferences.value.processMemoryUnit,
  set: (value: ProcessMemoryUnit) => setProcessMemoryUnit(value),
});

const chosen = computed(() =>
  preferences.value.widgetSensors.map((id) => {
    const sensor = props.sensors.find((item) => item.id === id);
    return { id, name: sensor ? `${sensor.device} · ${t.value.metrics[sensor.metric]}` : id };
  }),
);

</script>

<template>
  <CommonModal v-model="open" :title="t.options">
    <div class="options" data-testid="options">
      <div class="field option option_inline">
        <label :for="memoryInputId">{{ t.processMemoryUnitLabel }}</label>
        <select :id="memoryInputId" v-model="processMemoryUnit" data-testid="options_ram_unit">
          <option value="mb">{{ t.processMemoryUnits.mb }}</option>
          <option value="percent">{{ t.processMemoryUnits.percent }}</option>
        </select>
      </div>

      <div class="option">
        <span class="option_label">{{ t.widgetListLabel }}</span>
        <ProcessFilterPicker
          v-model="widgetList"
          :label="t.widgetListLabel"
          testid="options_list"
        />
      </div>

      <NasSwitch
        v-model="widgetHideQuiet"
        :label="t.widgetHideQuietLabel"
        testid="options_hide_quiet"
      />

      <div class="field option option_inline">
        <label :for="refreshInputId">{{ t.refreshLabel }}</label>
        <NasNumberStepper
          :id="refreshInputId"
          :model-value="preferences.refreshSeconds"
          :min="REFRESH_SECONDS.min"
          :max="REFRESH_SECONDS.max"
          testid="options_refresh"
          :increase-label="t.increase"
          :decrease-label="t.decrease"
          @update:model-value="setRefresh"
        />
      </div>

      <div class="option">
        <span class="option_label">
          {{ t.widgetSensorsLabel }} · {{ t.widgetCount(chosen.length) }}
        </span>
        <ul v-if="chosen.length" class="option_sensors">
          <li v-for="(item, index) in chosen" :key="item.id">
            <span>{{ item.name }}</span>
            <button
              type="button"
              class="icon_button option_move_up"
              :aria-label="t.moveSensorUp(item.name)"
              :title="t.moveSensorUp(item.name)"
              :disabled="index === 0"
              :data-testid="`options_up_${item.id}`"
              @click="moveSensor(item.id, -1)"
            >
              <NasIcon :svg="chevronIcon" />
            </button>
            <button
              type="button"
              class="icon_button"
              :aria-label="t.moveSensorDown(item.name)"
              :title="t.moveSensorDown(item.name)"
              :disabled="index === chosen.length - 1"
              :data-testid="`options_down_${item.id}`"
              @click="moveSensor(item.id, 1)"
            >
              <NasIcon :svg="chevronIcon" />
            </button>
            <button
              type="button"
              class="icon_button"
              :aria-label="t.removeSensor(item.name)"
              :title="t.removeSensor(item.name)"
              :data-testid="`options_remove_${item.id}`"
              @click="toggleSensor(item.id)"
            >
              <NasIcon :svg="closeIcon" />
            </button>
          </li>
        </ul>
        <p v-else class="muted">{{ t.noWidgetSensors }}</p>
      </div>
    </div>
  </CommonModal>
</template>

<style scoped lang="scss">

.options {
  display: grid;
  gap: 20px;
}

.option {
  display: grid;
  gap: 8px;
}

.option_inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  select {
    width: auto;
  }
}

.option_label {
  color: var(--nas-muted);
  font-size: 13px;
}

.field .number_stepper {
  width: 8rem;
}

.option_sensors {
  @extend %reset_list;
  display: grid;
  gap: 4px;
  max-height: $nas_settings_sensor_list_height;
  overflow-y: auto;

  li {
    @extend %fx_between;
    gap: 8px;
    padding: 6px 4px 6px 12px;
    border-radius: 8px;
    background: var(--nas-sunken);
    font-size: 13px;

    > span {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }

    button {
      flex: none;

      &:disabled {
        opacity: 0.35;
        cursor: default;
      }
    }

    .option_move_up .app_icon {
      transform: rotate(180deg);
    }
  }
}

</style>
