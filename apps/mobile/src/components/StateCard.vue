<template>
  <view :class="['state-card', `state-card-${tone}`]">
    <text v-if="kicker" class="state-card-kicker">{{ kicker }}</text>
    <text class="state-card-title">{{ title }}</text>
    <text v-if="description" class="state-card-description">{{ description }}</text>
    <button
      v-if="actionText"
      class="state-card-action"
      @click="emit('action')"
    >
      {{ actionText }}
    </button>
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    description?: string
    kicker?: string
    actionText?: string
    tone?: 'default' | 'error' | 'success'
  }>(),
  {
    description: '',
    kicker: '',
    actionText: '',
    tone: 'default',
  },
)

const emit = defineEmits<{
  action: []
}>()
</script>

<style scoped>
.state-card {
  border: 1px dashed rgba(148, 163, 184, 0.26);
  border-radius: 22px;
  background: rgba(248, 251, 255, 0.92);
  padding: 18px 16px;
}

.state-card-default {
  border-color: rgba(148, 163, 184, 0.26);
}

.state-card-error {
  border-color: rgba(239, 68, 68, 0.24);
  background: rgba(254, 242, 242, 0.96);
}

.state-card-success {
  border-color: rgba(16, 185, 129, 0.24);
  background: rgba(236, 253, 245, 0.96);
}

.state-card-kicker,
.state-card-title,
.state-card-description {
  display: block;
}

.state-card-kicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #64748b;
}

.state-card-title {
  margin-top: 4px;
  font-size: 15px;
  font-weight: 700;
  color: #334155;
}

.state-card-description {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.7;
  color: #64748b;
}

.state-card-action {
  min-height: 34px;
  margin-top: 14px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(79, 70, 229, 0.08);
  font-size: 13px;
  font-weight: 700;
  line-height: 34px;
  color: #3f3aa7;
}
</style>
