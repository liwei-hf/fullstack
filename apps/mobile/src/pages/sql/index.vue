<template>
  <div class="sql-page">
    <div class="page-actions">
      <button class="ghost-btn" @click="router.push('/index')">返回首页</button>
    </div>

    <div class="input-card">
      <div class="example-list">
        <button
          v-for="example in examples"
          :key="example"
          class="example-chip"
          @click="question = example"
        >
          {{ example }}
        </button>
      </div>

      <textarea
        v-model="question"
        class="question-input"
        placeholder="例如：今天完成了哪些待办？"
      />

      <button
        class="submit-btn"
        :disabled="loading"
        @click="handleAsk"
      >
        {{ loading ? '正在分析...' : '开始查询' }}
      </button>
    </div>

    <div class="answer-card">
      <div class="section-head">
        <span>回答结果</span>
        <span v-if="loading" class="loading-tag">流式返回中</span>
      </div>

      <div v-if="errorMessage" class="error-box">{{ errorMessage }}</div>
      <div
        v-else-if="answer"
        class="answer-content markdown-body"
        v-html="renderedAnswer"
      />
      <div v-else class="empty-box">输入问题后，这里会展示自然语言答案。</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { AiSqlSseEvent } from '@fullstack/shared'
import { streamSse } from '@/utils/request'
import { renderMarkdown } from '@/utils/markdown'

const examples = [
  '今天完成了哪些待办？',
  '当前共有多少个用户？',
  '各部门有多少人？',
  '我的待办里还有多少进行中的任务？',
]

const router = useRouter()
const question = ref('')
const answer = ref('')
const loading = ref(false)
const errorMessage = ref('')
const renderedAnswer = computed(() => renderMarkdown(answer.value))

const handleAsk = async () => {
  if (!question.value.trim()) {
    errorMessage.value = '请输入要查询的问题'
    return
  }

  loading.value = true
  answer.value = ''
  errorMessage.value = ''

  try {
    await streamSse('/ai/sql/stream', { question: question.value.trim() }, handleEvent)
  } catch (error: any) {
    errorMessage.value = error.message || '查询失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

const handleEvent = (event: AiSqlSseEvent) => {
  if (event.type === 'answer_delta') {
    answer.value += event.delta
  }

  if (event.type === 'error') {
    errorMessage.value = event.message
  }
}
</script>

<style scoped>
.sql-page {
  min-height: 100vh;
  padding: 24px 16px 40px;
  background:
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.18), transparent 30%),
    linear-gradient(180deg, #F8FAFC 0%, #E2E8F0 100%);
}

.page-actions {
  display: flex;
  margin-bottom: 16px;
}

.ghost-btn {
  width: 100%;
  height: 44px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
  color: #0F172A;
  font-size: 14px;
  font-weight: 600;
}

.input-card,
.answer-card {
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 24px;
  padding: 20px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
  margin-bottom: 16px;
  backdrop-filter: blur(8px);
}

.question-input {
  width: 100%;
  min-height: 140px;
  border: 1px solid #CBD5E1;
  border-radius: 18px;
  padding: 16px;
  resize: vertical;
  font-size: 15px;
  line-height: 1.7;
  color: #0F172A;
  background: #F8FAFC;
  outline: none;
}

.example-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 0 0 16px;
}

.example-chip {
  border: none;
  background: #E2E8F0;
  color: #334155;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 12px;
}

.submit-btn {
  width: 100%;
  height: 50px;
  border: none;
  border-radius: 16px;
  background: linear-gradient(135deg, #0F766E 0%, #0F172A 100%);
  color: #fff;
  font-size: 16px;
  font-weight: 700;
}

.submit-btn:disabled {
  opacity: 0.7;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  font-size: 15px;
  font-weight: 700;
  color: #0F172A;
}

.loading-tag {
  font-size: 12px;
  color: #0F766E;
}

.answer-content,
.empty-box,
.error-box {
  border-radius: 18px;
  padding: 20px;
  line-height: 1.9;
  font-size: 16px;
  white-space: pre-wrap;
  min-height: 240px;
}

.answer-content {
  background: #F8FAFC;
  color: #0F172A;
}

.empty-box {
  background: #F8FAFC;
  color: #64748B;
}

.error-box {
  background: #FEF2F2;
  color: #B91C1C;
}

:deep(.markdown-body p) {
  margin: 0 0 12px;
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  margin: 0 0 12px 20px;
}

:deep(.markdown-body li) {
  margin: 4px 0;
}

:deep(.markdown-body strong) {
  font-weight: 700;
}

:deep(.markdown-body code) {
  background: #e2e8f0;
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 0.92em;
}

:deep(.markdown-body pre) {
  margin: 0 0 12px;
  padding: 14px;
  border-radius: 14px;
  overflow-x: auto;
  background: #0f172a;
  color: #e2e8f0;
}

:deep(.markdown-body pre code) {
  background: transparent;
  padding: 0;
}

:deep(.markdown-body a) {
  color: #0f766e;
  text-decoration: underline;
}

:deep(.markdown-body blockquote) {
  margin: 0 0 12px;
  padding-left: 12px;
  border-left: 3px solid #cbd5e1;
  color: #475569;
}
</style>
