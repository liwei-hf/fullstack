<template>
  <view class="page-topbar">
    <button class="page-topbar-btn" @click="emit('left')">{{ leftText }}</button>
    <view :class="['page-topbar-center', hasDefaultSlot ? 'page-topbar-center-stack' : '']">
      <text class="page-topbar-title">{{ title }}</text>
      <slot />
    </view>
    <button class="page-topbar-btn" @click="emit('right')">{{ rightText }}</button>
  </view>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'

const props = defineProps<{
  title: string
  leftText: string
  rightText: string
}>()

const emit = defineEmits<{
  left: []
  right: []
}>()

const slots = useSlots()
const hasDefaultSlot = computed(() => Boolean(slots.default))

void props
</script>

<style scoped>
.page-topbar {
  position: fixed;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 20;
  min-height: 62px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 10px;
  backdrop-filter: blur(12px);
  box-shadow: 0 18px 32px rgba(74, 102, 156, 0.1);
}

.page-topbar-btn {
  min-width: 54px;
  height: 34px;
  padding: 0 14px;
  border-radius: 999px;
  background: rgba(79, 70, 229, 0.08);
  font-size: 13px;
  font-weight: 700;
  color: #3f3aa7;
}

.page-topbar-center {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.page-topbar-center-stack {
  flex-direction: column;
}

.page-topbar-title {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #0f172a;
}
</style>
