<template>
  <view class="recent-session-section">
    <view class="recent-session-head">
      <view :class="['recent-session-dot', `recent-session-dot-${tone}`]" />
      <text class="recent-session-title">{{ title }}</text>
      <PillTag tone="soft" size="sm">{{ items.length }}</PillTag>
    </view>

    <view v-if="items.length" class="recent-session-list">
      <button
        v-for="item in items"
        :key="item.id"
        class="recent-session-item"
        @click="emit('select', item.id)"
      >
        <view class="recent-session-main">
          <text class="recent-session-item-title">{{ item.title }}</text>
          <text class="recent-session-item-text">{{ item.preview }}</text>
        </view>
        <text class="recent-session-item-time">{{ item.timeText }}</text>
      </button>
    </view>

    <view v-else class="recent-session-empty">
      <text class="recent-session-empty-title">{{ emptyTitle }}</text>
      <text class="recent-session-empty-text">{{ emptyText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import PillTag from '@/components/PillTag.vue'

defineProps<{
  title: string
  tone: 'blue' | 'teal'
  emptyTitle: string
  emptyText: string
  items: Array<{
    id: string
    title: string
    preview: string
    timeText: string
  }>
}>()

const emit = defineEmits<{
  select: [sessionId: string]
}>()
</script>

<style scoped>
.recent-session-section {
  margin-top: 18px;
}

.recent-session-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.recent-session-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
}

.recent-session-dot-blue {
  background: #2563eb;
}

.recent-session-dot-teal {
  background: #0f766e;
}

.recent-session-title,
.recent-session-item-title,
.recent-session-item-text,
.recent-session-item-time,
.recent-session-empty-title,
.recent-session-empty-text {
  display: block;
}

.recent-session-title {
  font-size: 14px;
  font-weight: 700;
  color: #334155;
}

.recent-session-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recent-session-item {
  width: 100%;
  border: 1px solid rgba(148, 163, 184, 0.12);
  border-radius: 20px;
  background: #f8fbff;
  padding: 14px;
  text-align: left;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.recent-session-main {
  margin-bottom: 8px;
}

.recent-session-item-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.recent-session-item-text {
  margin-top: 4px;
  font-size: 13px;
  line-height: 1.6;
  color: #64748b;
}

.recent-session-item-time {
  font-size: 12px;
  color: #94a3b8;
}

.recent-session-empty {
  border: 1px dashed rgba(148, 163, 184, 0.26);
  border-radius: 20px;
  background: rgba(248, 251, 255, 0.84);
  padding: 16px 14px;
}

.recent-session-empty-title {
  font-size: 14px;
  font-weight: 700;
  color: #334155;
}

.recent-session-empty-text {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
}
</style>
