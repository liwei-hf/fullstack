<template>
  <button class="knowledge-base-picker-item" @click="emit('select')">
    <view class="knowledge-base-picker-head">
      <text class="knowledge-base-picker-title">{{ title }}</text>
      <PillTag tone="indigo" size="sm">{{ badgeText }}</PillTag>
    </view>
    <text class="knowledge-base-picker-text">{{ description }}</text>
  </button>
</template>

<script setup lang="ts">
import PillTag from '@/components/PillTag.vue'

defineProps<{
  title: string
  description: string
  badgeText: string
}>()

const emit = defineEmits<{
  select: []
}>()
</script>

<style scoped>
.knowledge-base-picker-item {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 20px;
  background: #f8fbff;
  padding: 14px;
  text-align: left;
}

.knowledge-base-picker-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.knowledge-base-picker-title,
.knowledge-base-picker-text {
  display: block;
}

.knowledge-base-picker-title {
  min-width: 0;
  flex: 1;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.knowledge-base-picker-text {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.65;
  color: #64748b;
}
</style>
