<script setup lang="ts">

import { useI18n } from '@/i18n';
import { NasIcon, NasModal } from '@valeriogc/nas-base-app';
import closeIcon from '@/assets/icons/close.svg?url';

interface Props {
  title: string;
}

defineProps<Props>();

const open = defineModel<boolean>({ required: true });

const { t } = useI18n();

</script>

<template>
  <NasModal v-if="open" :label="title" @close="open = false">
    <section class="modal surface_card">
      <div class="card_heading">
        <h2>{{ title }}</h2>
        <button type="button" class="close" :aria-label="t.close" @click="open = false">
          <NasIcon :svg="closeIcon" />
        </button>
      </div>

      <div class="modal_body">
        <slot></slot>
      </div>

      <div v-if="$slots.footer" class="modal_footer app_toolbar">
        <slot name="footer"></slot>
      </div>
    </section>
  </NasModal>
</template>

<style scoped lang="scss">

.modal {
  --nas-modal-height: #{$nas_settings_modal_height};
  display: flex;
  flex-direction: column;
  width: min($nas_settings_modal_width, 100%);
  height: $nas_settings_modal_height;
  max-height: calc(100vh - 40px);
  padding: 0;
  color: inherit;
  overflow: hidden;
}

.card_heading,
.modal_footer {
  flex: none;
}

.card_heading {
  padding-bottom: 0;
  border-bottom: 0;
}

.close {
  --app-icon-size: 20px;
  display: inline-grid;
  place-items: center;
  min-width: 32px;
  min-height: 32px;
  border: 0;
  background: transparent;
  color: var(--accent);
}

.modal_body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 24px;
}

.modal_footer {
  justify-content: flex-end;
  padding: 0 24px 20px;
}

</style>
