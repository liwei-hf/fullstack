<template>
  <div class="page">
    <div class="topbar">
      <button class="back-btn" @click="router.push('/index')">返回首页</button>
      <span class="topbar-title">文档问答</span>
    </div>

    <div class="card">
      <p class="section-title">选择知识库</p>
      <select v-model="selectedId" class="select">
        <option value="" disabled>请选择知识库</option>
        <option v-for="item in knowledgeBases" :key="item.id" :value="item.id">
          {{ item.name }}（{{ item.readyDocumentCount }}/{{ item.documentCount }}）
        </option>
      </select>
      <p class="helper-text" v-if="selectedKnowledgeBase">
        {{ selectedKnowledgeBase.description || '当前知识库已准备好文档后即可提问。' }}
      </p>
    </div>

    <div class="card">
      <p class="section-title">输入问题</p>
      <textarea
        v-model="question"
        class="question-input"
        :placeholder="selectedKnowledgeBase ? `向“${selectedKnowledgeBase.name}”提问` : '请先选择知识库'"
      />
      <button class="submit-btn" :disabled="loading" @click="handleAsk">
        {{ loading ? '回答生成中...' : '开始问答' }}
      </button>
    </div>

    <div class="card">
      <p class="section-title">回答结果</p>
      <div class="answer-content">
        {{ answer || '这里会显示流式回答内容。' }}
      </div>
    </div>

    <div class="card">
      <p class="section-title">引用来源</p>
      <div v-if="sources.length" class="source-list">
        <div v-for="item in sources" :key="item.chunkId" class="source-item">
          <p class="source-title">{{ item.documentName }}</p>
          <p class="source-text">{{ item.snippet }}</p>
        </div>
      </div>
      <p v-else class="empty-text">命中的文档片段会显示在这里。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { KnowledgeBaseItem, RagSourceItem, RagSseEvent } from '@fullstack/shared'
import { api, streamSse } from '@/utils/request'

const router = useRouter()
const knowledgeBases = ref<KnowledgeBaseItem[]>([])
const selectedId = ref('')
const question = ref('')
const answer = ref('')
const sources = ref<RagSourceItem[]>([])
const loading = ref(false)

const selectedKnowledgeBase = computed(() =>
  knowledgeBases.value.find((item) => item.id === selectedId.value) || null,
)

const fetchKnowledgeBases = async () => {
  try {
    const data = await api.get<KnowledgeBaseItem[]>('/knowledge-base')
    knowledgeBases.value = data
    if (!selectedId.value && data.length > 0) {
      selectedId.value = data[0].id
    }
  } catch (error) {
    alert(error instanceof Error ? error.message : '获取知识库失败')
  }
}

const handleAsk = async () => {
  if (!selectedId.value) {
    alert('请先选择知识库')
    return
  }

  if (!question.value.trim()) {
    alert('请输入问题')
    return
  }

  answer.value = ''
  sources.value = []
  loading.value = true

  try {
    await streamSse<RagSseEvent>(
      `/knowledge-base/${selectedId.value}/chat/stream`,
      { question: question.value.trim() },
      (event) => {
        if (event.type === 'answer_delta') {
          answer.value += event.delta
          return
        }

        if (event.type === 'sources') {
          sources.value = event.items
          return
        }

        if (event.type === 'error') {
          throw new Error(event.message)
        }
      },
    )
  } catch (error) {
    alert(error instanceof Error ? error.message : '知识库问答失败')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void fetchKnowledgeBases()
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 20px 16px 32px;
  background: linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%);
}

.topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
}

.back-btn {
  border: none;
  border-radius: 999px;
  background: #111827;
  color: #fff;
  padding: 10px 16px;
  font-size: 14px;
}

.topbar-title {
  font-size: 18px;
  font-weight: 700;
  color: #0f172a;
}

.card {
  background: #fff;
  border-radius: 20px;
  padding: 18px 16px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  margin-bottom: 16px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 12px;
}

.select,
.question-input {
  width: 100%;
  border: 1px solid #dbe3f0;
  border-radius: 14px;
  padding: 12px 14px;
  font-size: 14px;
  color: #111827;
  background: #fff;
}

.question-input {
  min-height: 132px;
  resize: none;
}

.helper-text,
.empty-text {
  margin-top: 10px;
  font-size: 13px;
  line-height: 1.6;
  color: #64748b;
}

.submit-btn {
  width: 100%;
  height: 48px;
  margin-top: 14px;
  border: none;
  border-radius: 14px;
  background: #111827;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}

.submit-btn:disabled {
  opacity: 0.7;
}

.answer-content {
  min-height: 220px;
  white-space: pre-wrap;
  font-size: 16px;
  line-height: 1.9;
  color: #0f172a;
}

.source-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.source-item {
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 14px;
}

.source-title {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.source-text {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.7;
  color: #475569;
}
</style>
