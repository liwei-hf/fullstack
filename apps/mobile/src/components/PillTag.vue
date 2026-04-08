<template>
  <view :class="['pill-tag', `pill-tag-${tone}`, `pill-tag-${size}`]">
    <text class="pill-tag-label"><slot>{{ label }}</slot></text>
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label?: string
    tone?: 'light' | 'indigo' | 'neutral' | 'teal' | 'soft'
    size?: 'sm' | 'md'
  }>(),
  {
    label: '',
    tone: 'soft',
    size: 'sm',
  },
)
</script>

<style scoped>
.pill-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0 12px;
}

.pill-tag-sm {
  min-height: 24px;
}

.pill-tag-md {
  min-height: 28px;
}

.pill-tag-label {
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.pill-tag-sm .pill-tag-label {
  font-size: 11px;
  line-height: 24px;
}

.pill-tag-md .pill-tag-label {
  font-size: 12px;
  line-height: 28px;
}

.pill-tag-light {
  background: rgba(255, 255, 255, 0.14);
}

.pill-tag-light .pill-tag-label {
  color: #fff;
}

.pill-tag-indigo {
  background: rgba(79, 70, 229, 0.08);
}

.pill-tag-indigo .pill-tag-label {
  color: #3f3aa7;
}

.pill-tag-neutral {
  background: rgba(15, 23, 42, 0.08);
}

.pill-tag-neutral .pill-tag-label {
  color: #0f172a;
}

.pill-tag-teal {
  background: rgba(15, 118, 110, 0.1);
}

.pill-tag-teal .pill-tag-label {
  color: #0f766e;
}

.pill-tag-soft {
  background: rgba(15, 23, 42, 0.06);
}

.pill-tag-soft .pill-tag-label {
  color: #475569;
}
</style>
