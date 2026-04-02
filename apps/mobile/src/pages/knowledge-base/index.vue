<template>
  <div class="page">
    <div class="topbar">
      <button class="topbar-icon-btn" @click="openDrawer" aria-label="打开会话列表">
        <span class="menu-icon" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      <button class="back-btn" aria-label="返回首页" @click="router.push('/index')">
        <svg viewBox="0 0 24 24" aria-hidden="true" class="home-icon">
          <path
            d="M4.5 10.5 12 4.8l7.5 5.7"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.2"
          />
          <path
            d="M6.7 9.9V18a1.8 1.8 0 0 0 1.8 1.8h7a1.8 1.8 0 0 0 1.8-1.8V9.9"
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2.2"
          />
        </svg>
      </button>
      <span class="topbar-title">文档问答</span>
      <button class="switch-kb-btn" @click="openKnowledgeBasePicker">
        {{ selectedKnowledgeBase?.name || '选择知识库' }}
      </button>
    </div>

    <div v-if="drawerOpen" class="drawer-mask" @click="closeDrawer">
      <div class="drawer-panel" @click.stop>
        <div class="drawer-head">
          <span class="section-title">历史会话</span>
          <button class="mini-btn" @click="handleCreateSession">新建会话</button>
        </div>
        <label class="drawer-search">
          <span class="drawer-search-icon">⌕</span>
          <input
            v-model="sessionKeyword"
            class="drawer-search-input"
            placeholder="搜索对话..."
          />
        </label>
        <div class="drawer-sections">
          <section
            v-for="group in groupedSessions"
            :key="group.label"
            class="drawer-section"
          >
            <p class="drawer-section-title">{{ group.label }}</p>
            <div class="drawer-list">
              <div
                v-for="item in group.items"
                :key="item.id"
                :class="['drawer-item', item.id === currentSession?.id ? 'drawer-item-active' : '']"
              >
                <button class="drawer-item-main" @click="handleSelectSession(item.id)">
                  <p class="drawer-item-title">{{ item.title }}</p>
                  <p class="drawer-item-text">{{ item.lastMessagePreview || '新会话，等待第一轮提问' }}</p>
                </button>
                <button
                  class="drawer-delete-btn"
                  :aria-label="`删除会话 ${item.title}`"
                  @click.stop="handleDeleteSession(item.id)"
                >
                  ×
                </button>
              </div>
            </div>
          </section>
          <p v-if="groupedSessions.length === 0" class="drawer-empty">没有匹配的历史会话</p>
        </div>
        <button class="drawer-footer-btn" @click="router.push('/index')">返回首页</button>
      </div>
    </div>

    <div v-if="knowledgeBasePickerOpen" class="drawer-mask" @click="closeKnowledgeBasePicker">
      <div class="picker-panel" @click.stop>
        <div class="drawer-head">
          <span class="section-title">选择知识库</span>
          <button class="mini-btn" @click="closeKnowledgeBasePicker">关闭</button>
        </div>
        <label class="drawer-search picker-search">
          <span class="drawer-search-icon">⌕</span>
          <input
            v-model="knowledgeBaseKeyword"
            class="drawer-search-input"
            placeholder="搜索知识库..."
          />
        </label>
        <p class="helper-text picker-helper">先选定本轮对话使用的知识库，进入会话后不再展示下拉选择。</p>
        <div class="drawer-list">
          <button
            v-for="item in filteredKnowledgeBases"
            :key="item.id"
            :class="['drawer-item', item.id === selectedId ? 'drawer-item-active' : '']"
            @click="selectKnowledgeBaseAndClose(item.id)"
          >
            <div class="drawer-item-row">
              <p class="drawer-item-title">{{ item.name }}</p>
              <span class="drawer-item-badge">{{ item.readyDocumentCount }}/{{ item.documentCount }}</span>
            </div>
            <p class="drawer-item-text">{{ item.description || '暂无描述' }}</p>
          </button>
        </div>
        <p v-if="filteredKnowledgeBases.length === 0" class="drawer-empty">没有匹配的知识库</p>
      </div>
    </div>

    <div class="card knowledge-summary-card">
      <div class="knowledge-base-head">
        <div>
          <p class="knowledge-summary-title">{{ selectedKnowledgeBase?.name || '请先选择知识库' }}</p>
          <p class="helper-text knowledge-summary-text">
            {{ selectedKnowledgeBase?.description || '这里只展示已经上传过文档的知识库。' }}
          </p>
        </div>
      </div>
    </div>

    <div class="card content-card">
      <div v-if="currentSession?.messages.length" class="message-list">
        <div
          v-for="message in currentSession.messages"
          :key="message.id"
          :class="['message-row', message.role === 'user' ? 'message-row-user' : 'message-row-assistant']"
        >
          <div :class="['message-bubble', message.role === 'user' ? 'message-bubble-user' : 'message-bubble-assistant']">
            <div
              v-if="message.content"
              class="message-content markdown-body"
              v-html="renderMarkdown(message.content)"
            />
            <div
              v-else-if="message.role === 'assistant' && message.status === 'streaming'"
              class="loading-inline"
            >
              <span class="loading-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span>{{ message.loadingMessage || '正在组织答案...' }}</span>
            </div>

            <p v-if="message.errorMessage" class="message-error">
              {{ message.errorMessage }}
            </p>

            <div v-if="message.sources?.length" class="meta-box">
              <button class="meta-toggle" @click="toggleSources(message.id)">
                <span>{{ message.sourcesExpanded ? '▾' : '▸' }}</span>
                <span>引用来源</span>
              </button>
              <transition name="collapse">
                <div v-if="message.sourcesExpanded" class="source-list">
                  <div v-for="item in message.sources" :key="item.chunkId" class="source-item">
                    <p class="source-title">{{ item.documentName }}</p>
                    <p class="source-text">{{ item.snippet }}</p>
                  </div>
                </div>
              </transition>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="empty-box">
        <p class="empty-title">开始第一轮知识库问答</p>
        <p class="empty-text">选择知识库后，你可以围绕同一份文档持续追问，引用来源会跟随每次回答展示。</p>
        <div class="empty-examples">
          <button
            v-for="example in examples"
            :key="example"
            class="example-chip"
            @click="question = example"
          >
            {{ example }}
          </button>
        </div>
      </div>
    </div>

    <button
      v-if="showScrollToBottom"
      class="scroll-bottom-btn"
      @click="scrollToBottom"
      aria-label="回到底部"
    >
      ↓
    </button>

    <div class="input-card">
      <div class="input-row">
        <textarea
          ref="textareaRef"
          v-model="question"
          class="question-input"
          :placeholder="selectedKnowledgeBase ? `向“${selectedKnowledgeBase.name}”提问` : '请先选择知识库'"
          rows="1"
          @input="handleInput"
          @keydown.enter.exact.prevent="handleAsk"
        />
        <button
          class="submit-btn"
          :aria-label="asking ? '停止生成' : '发送消息'"
          @click="handleAsk"
        >
          {{ asking ? '■' : '↑' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { AiConversationMessage, AiConversationSession, KnowledgeBaseItem, RagSseEvent } from '@fullstack/shared'
import { api, streamSse } from '@/utils/request'
import { renderMarkdown } from '@/utils/markdown'
import { showToast } from '@/utils/toast'
import {
  createConversationMessage,
  createConversationSession,
  deriveConversationTitle,
  loadConversationSessions,
  removeConversationSession,
  saveConversationSessions,
  updateConversationSessionInList,
} from '@/utils/ai-conversation'

const router = useRouter()
const route = useRoute()
const abortController = ref<AbortController | null>(null)
const knowledgeBases = ref<KnowledgeBaseItem[]>([])
const sessions = ref<AiConversationSession[]>([])
const activeSessionId = ref('')
const selectedId = ref('')
const question = ref('')
const asking = ref(false)
const drawerOpen = ref(false)
const knowledgeBasePickerOpen = ref(false)
const showScrollToBottom = ref(false)
const sessionKeyword = ref('')
const knowledgeBaseKeyword = ref('')
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const examples = [
  '这份制度里对请假流程怎么规定？',
  '病假需要补充哪些材料？',
  '如果员工迟到，会有什么处理方式？',
]

const currentSession = computed(
  () => sessions.value.find((item) => item.id === activeSessionId.value) || sessions.value[0] || null,
)
const visibleSessions = computed(() => {
  if (!selectedId.value) {
    return sessions.value.filter((session) => !session.knowledgeBaseId)
  }

  return sessions.value.filter((session) => session.knowledgeBaseId === selectedId.value)
})
const selectedKnowledgeBase = computed(
  () => knowledgeBases.value.find((item) => item.id === selectedId.value) || null,
)
const filteredKnowledgeBases = computed(() => {
  const keyword = knowledgeBaseKeyword.value.trim().toLowerCase()
  if (!keyword) {
    return knowledgeBases.value
  }

  return knowledgeBases.value.filter((item) =>
    [item.name, item.description].filter(Boolean).some((value) => value!.toLowerCase().includes(keyword)),
  )
})

const groupedSessions = computed(() => {
  const keyword = sessionKeyword.value.trim().toLowerCase()
  const matchedSessions = visibleSessions.value.filter((session) => {
    if (!keyword) {
      return true
    }

    const latestMessage = session.messages[session.messages.length - 1]
    return [session.title, session.lastMessagePreview, latestMessage?.content]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(keyword))
  })

  const groups = new Map<string, AiConversationSession[]>()
  matchedSessions.forEach((session) => {
    const label = resolveSessionGroupLabel(session.updatedAt || session.createdAt)
    const currentGroup = groups.get(label) || []
    currentGroup.push(session)
    groups.set(label, currentGroup)
  })

  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }))
})

function resolveSessionGroupLabel(isoTime: string) {
  const target = new Date(isoTime)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate())

  if (targetDay.getTime() === today.getTime()) {
    return '今日'
  }

  if (targetDay.getTime() === yesterday.getTime()) {
    return '昨天'
  }

  return '更早'
}

function initializeSessions() {
  const loaded = loadConversationSessions('knowledge_base')
  if (loaded.length > 0) {
    sessions.value = loaded
    activeSessionId.value = loaded[0].id
    return
  }

  const initialSession = createConversationSession('knowledge_base')
  sessions.value = [initialSession]
  activeSessionId.value = initialSession.id
}

function persistSessions() {
  saveConversationSessions('knowledge_base', sessions.value)
}

function updateSession(sessionId: string, updater: (session: AiConversationSession) => AiConversationSession) {
  sessions.value = updateConversationSessionInList(sessions.value, sessionId, updater)
  persistSessions()
}

function updateMessage(
  sessionId: string,
  messageId: string,
  updater: (message: AiConversationMessage) => AiConversationMessage,
) {
  updateSession(sessionId, (session) => ({
    ...session,
    updatedAt: new Date().toISOString(),
    messages: session.messages.map((message) =>
      message.id === messageId ? updater(message) : message,
    ),
  }))
}

async function fetchKnowledgeBases() {
  try {
    const data = await api.get<KnowledgeBaseItem[]>('/knowledge-base')
    const filtered = data.filter((item) => item.documentCount > 0)
    knowledgeBases.value = filtered

    const queryKnowledgeBaseId =
      typeof route.query.knowledgeBaseId === 'string' ? route.query.knowledgeBaseId : ''
    const preferredId = queryKnowledgeBaseId || currentSession.value?.knowledgeBaseId
    if (preferredId && filtered.some((item) => item.id === preferredId)) {
      selectedId.value = preferredId
      return
    }

    selectedId.value = filtered[0]?.id || ''
    if (!preferredId && filtered.length > 0) {
      knowledgeBasePickerOpen.value = true
    }
  } catch (error) {
    showToast(error instanceof Error ? error.message : '获取知识库失败')
  }
}

function handleCreateSession() {
  const nextSession = createConversationSession('knowledge_base', {
    knowledgeBaseId: selectedId.value || undefined,
  })
  sessions.value = [nextSession, ...sessions.value]
  activeSessionId.value = nextSession.id
  question.value = ''
  drawerOpen.value = false
  knowledgeBasePickerOpen.value = true
  persistSessions()
}

function openDrawer() {
  drawerOpen.value = true
}

function closeDrawer() {
  drawerOpen.value = false
}

function handleSelectSession(sessionId: string) {
  sessions.value = updateConversationSessionInList(sessions.value, sessionId, (session) => session)
  activeSessionId.value = sessionId
  const matchedSession = sessions.value.find((session) => session.id === sessionId)
  if (matchedSession?.knowledgeBaseId) {
    selectedId.value = matchedSession.knowledgeBaseId
  }
  persistSessions()
  closeDrawer()
}

function handleDeleteSession(sessionId: string) {
  const nextSessions = removeConversationSession(sessions.value, sessionId)
  if (nextSessions.length === 0) {
    const fallbackSession = createConversationSession('knowledge_base', {
      knowledgeBaseId: selectedId.value || undefined,
    })
    sessions.value = [fallbackSession]
    activeSessionId.value = fallbackSession.id
    question.value = ''
    knowledgeBasePickerOpen.value = !selectedId.value
    persistSessions()
    return
  }

  sessions.value = nextSessions
  if (activeSessionId.value === sessionId) {
    const nextActiveSession = nextSessions[0]!
    activeSessionId.value = nextActiveSession.id
    selectedId.value = nextActiveSession.knowledgeBaseId || ''
    if (!selectedId.value && knowledgeBases.value.length > 0) {
      knowledgeBasePickerOpen.value = true
    }
  }
  persistSessions()
}

function handleStop() {
  abortController.value?.abort()
}

function openKnowledgeBasePicker() {
  knowledgeBasePickerOpen.value = true
}

function closeKnowledgeBasePicker() {
  knowledgeBasePickerOpen.value = false
}

function handleKnowledgeBaseChange() {
  if (!selectedId.value) {
    return
  }

  const matchedSession = sessions.value.find((session) => session.knowledgeBaseId === selectedId.value)
  if (matchedSession) {
    activeSessionId.value = matchedSession.id
    persistSessions()
    return
  }

  const nextSession = createConversationSession('knowledge_base', {
    knowledgeBaseId: selectedId.value,
  })
  sessions.value = [nextSession, ...sessions.value]
  activeSessionId.value = nextSession.id
  question.value = ''
  persistSessions()
}

function selectKnowledgeBaseAndClose(knowledgeBaseId: string) {
  selectedId.value = knowledgeBaseId
  handleKnowledgeBaseChange()
  closeKnowledgeBasePicker()
}

function resizeTextarea() {
  if (!textareaRef.value) {
    return
  }

  textareaRef.value.style.height = 'auto'
  const nextHeight = Math.min(textareaRef.value.scrollHeight, 132)
  textareaRef.value.style.height = `${Math.max(nextHeight, 46)}px`
}

function handleInput() {
  resizeTextarea()
}

// 知识库问答也走聊天流，但每个会话额外绑定一个 knowledgeBaseId，方便恢复时自动选中。
async function handleAsk() {
  if (asking.value) {
    handleStop()
    return
  }

  if (!currentSession.value) {
    return
  }

  if (!selectedId.value) {
    openKnowledgeBasePicker()
    showToast('请先选择知识库')
    return
  }

  const trimmedQuestion = question.value.trim()
  if (!trimmedQuestion) {
    showToast('请输入问题')
    return
  }

  const userMessage = createConversationMessage('user', trimmedQuestion)
  const assistantMessage = createConversationMessage('assistant', '', {
    loadingMessage: '正在检索知识库内容...',
    thinkingExpanded: true,
    sourcesExpanded: false,
  })
  const targetSessionId = currentSession.value.id
  const nextTitle =
    currentSession.value.messages.length === 0
      ? deriveConversationTitle(trimmedQuestion)
      : currentSession.value.title

  updateSession(targetSessionId, (session) => ({
    ...session,
    title: nextTitle,
    knowledgeBaseId: selectedId.value,
    updatedAt: new Date().toISOString(),
    lastMessagePreview: trimmedQuestion,
    messages: [...session.messages, userMessage, assistantMessage],
  }))

  question.value = ''
  resizeTextarea()
  asking.value = true
  abortController.value = new AbortController()

  try {
    await streamSse<RagSseEvent>(
      `/knowledge-base/${selectedId.value}/chat/stream`,
      { question: trimmedQuestion, sessionId: currentSession.value.sessionId || undefined },
      (event) => {
        if (event.type === 'meta') {
          updateSession(targetSessionId, (session) => ({
            ...session,
            sessionId: event.sessionId,
            knowledgeBaseId: event.knowledgeBaseId,
            updatedAt: new Date().toISOString(),
          }))
          updateMessage(targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            sessionId: event.sessionId,
          }))
          return
        }

        if (event.type === 'loading') {
          updateMessage(targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            loadingMessage: event.message,
          }))
          return
        }

        if (event.type === 'thinking_delta') {
          updateMessage(targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            thinking: `${message.thinking || ''}${event.delta}`,
          }))
          return
        }

        if (event.type === 'thinking_done') {
          return
        }

        if (event.type === 'answer_delta') {
          updateMessage(targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            content: `${message.content}${event.delta}`,
            thinkingExpanded: message.thinking ? false : message.thinkingExpanded,
          }))
          return
        }

        if (event.type === 'sources') {
          updateMessage(targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            sources: event.items,
          }))
          return
        }

        if (event.type === 'done') {
          updateMessage(targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            status: 'done',
            loadingMessage: '',
          }))
          return
        }

        if (event.type === 'error') {
          throw new Error(event.message)
        }
      },
      abortController.value.signal,
    )
  } catch (error: any) {
    const aborted = error instanceof DOMException && error.name === 'AbortError'
    updateMessage(targetSessionId, assistantMessage.id, (message) => ({
      ...message,
      status: aborted ? 'done' : 'error',
      loadingMessage: '',
      errorMessage: aborted ? '已停止生成' : error?.message || '知识库问答失败',
    }))

    if (!aborted) {
      showToast(error?.message || '知识库问答失败')
    }
  } finally {
    abortController.value = null
    asking.value = false
  }
}

function toggleSources(messageId: string) {
  if (!currentSession.value) {
    return
  }

  updateMessage(currentSession.value.id, messageId, (message) => ({
    ...message,
    sourcesExpanded: !message.sourcesExpanded,
  }))
}

function scrollToBottom() {
  if (typeof window === 'undefined') {
    return
  }

  window.requestAnimationFrame(() => {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: 'smooth',
    })
  })
}

function updateScrollToBottomVisibility() {
  if (typeof window === 'undefined') {
    return
  }

  const viewportBottom = window.scrollY + window.innerHeight
  const pageBottom = document.documentElement.scrollHeight
  showScrollToBottom.value = pageBottom - viewportBottom > 140
}

initializeSessions()
void fetchKnowledgeBases()

onMounted(() => {
  if (typeof route.query.sessionId === 'string') {
    const matchedSession = sessions.value.find((session) => session.id === route.query.sessionId)
    if (matchedSession) {
      activeSessionId.value = matchedSession.id
      if (matchedSession.knowledgeBaseId) {
        selectedId.value = matchedSession.knowledgeBaseId
      }
    }
  }

  resizeTextarea()
  updateScrollToBottomVisibility()
  window.addEventListener('scroll', updateScrollToBottomVisibility, { passive: true })
  window.addEventListener('resize', updateScrollToBottomVisibility)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateScrollToBottomVisibility)
  window.removeEventListener('resize', updateScrollToBottomVisibility)
})

watch(
  question,
  async () => {
    await nextTick()
    resizeTextarea()
  },
)

watch(
  () => currentSession.value?.knowledgeBaseId,
  (nextKnowledgeBaseId) => {
    if (nextKnowledgeBaseId && nextKnowledgeBaseId !== selectedId.value) {
      selectedId.value = nextKnowledgeBaseId
      return
    }

    if (!nextKnowledgeBaseId && knowledgeBases.value.length > 0) {
      knowledgeBasePickerOpen.value = true
    }
  },
  { immediate: true },
)

watch(
  () => selectedId.value,
  (nextKnowledgeBaseId) => {
    if (!nextKnowledgeBaseId) {
      return
    }

    if (currentSession.value?.knowledgeBaseId === nextKnowledgeBaseId) {
      return
    }

    const matchedSession = sessions.value.find((session) => session.knowledgeBaseId === nextKnowledgeBaseId)
    if (matchedSession) {
      activeSessionId.value = matchedSession.id
      return
    }

    const nextSession = createConversationSession('knowledge_base', {
      knowledgeBaseId: nextKnowledgeBaseId,
    })
    sessions.value = [nextSession, ...sessions.value]
    activeSessionId.value = nextSession.id
    persistSessions()
  },
)

watch(
  sessions,
  () => {
    persistSessions()
  },
  { deep: true },
)

watch(
  () => currentSession.value?.messages,
  async () => {
    await nextTick()
    scrollToBottom()
    updateScrollToBottomVisibility()
  },
  { deep: true },
)
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 108px 16px 132px;
  background:
    radial-gradient(circle at top left, rgba(111, 162, 255, 0.18), transparent 26%),
    linear-gradient(180deg, #eef4ff 0%, #f6f8ff 100%);
}

.topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 25;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: calc(10px + env(safe-area-inset-top, 0px)) 16px 8px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(12px);
}

.topbar-icon-btn,
.back-btn,
.switch-kb-btn,
.mini-btn,
.submit-btn,
.think-toggle,
.meta-toggle {
  appearance: none;
  border: none;
  background: none;
}

.topbar-icon-btn {
  width: 28px;
  min-width: 28px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.back-btn {
  border-radius: 999px;
  min-width: 40px;
  height: 36px;
  margin-left: -6px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  line-height: 1;
  background: transparent;
  color: #0F172A;
}

.home-icon {
  width: 24px;
  height: 24px;
}

.switch-kb-btn {
  margin-left: auto;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(226, 232, 240, 0.88);
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.topbar-title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.menu-icon {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
}

.menu-icon span {
  height: 2px;
  border-radius: 999px;
  background: #0F172A;
}

.menu-icon span:nth-child(1) {
  width: 18px;
}

.menu-icon span:nth-child(2) {
  width: 12px;
}

.menu-icon span:nth-child(3) {
  width: 15px;
}

.drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(15, 23, 42, 0.36);
}

.drawer-panel {
  width: min(320px, 82vw);
  height: 100%;
  background: #ffffff;
  box-shadow: 18px 0 40px rgba(15, 23, 42, 0.12);
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
}

.picker-panel {
  width: min(360px, calc(100vw - 32px));
  max-height: min(70vh, 620px);
  margin: 60px auto 0;
  overflow-y: auto;
  border-radius: 24px;
  background: #ffffff;
  box-shadow: 0 20px 44px rgba(15, 23, 42, 0.14);
  padding: 20px 16px;
}

.drawer-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.drawer-search {
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.drawer-search-icon {
  position: absolute;
  left: 14px;
  color: #94A3B8;
  font-size: 14px;
}

.drawer-search-input {
  width: 100%;
  height: 42px;
  border: 1px solid rgba(219, 227, 240, 0.92);
  border-radius: 14px;
  background: #f8faff;
  padding: 0 14px 0 36px;
  font-size: 13px;
  color: #334155;
  outline: none;
}

.drawer-sections {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
}

.drawer-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drawer-section-title {
  margin: 0;
  padding-left: 2px;
  font-size: 12px;
  font-weight: 700;
  color: #64748B;
}

.drawer-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.drawer-item {
  position: relative;
  width: 100%;
  border: 1px solid rgba(226, 232, 240, 0.88);
  border-radius: 18px;
  background: #fff;
  padding: 12px 12px 12px 14px;
  min-height: 60px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
}

.drawer-item-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.drawer-item-active {
  border-color: rgba(79, 121, 238, 0.24);
  background: rgba(242, 247, 255, 0.98);
  box-shadow: 0 12px 26px rgba(79, 121, 238, 0.12);
}

.drawer-item-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 999px;
  background: #4b77ed;
}

.drawer-item-main {
  flex: 1;
  min-width: 0;
  text-align: left;
  background: none;
  border: none;
  padding: 0;
}

.drawer-item-title {
  font-size: 14px;
  font-weight: 700;
  color: #0F172A;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-item-text {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: #64748B;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-item-badge {
  border-radius: 999px;
  background: rgba(15, 118, 110, 0.1);
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
  color: #0F766E;
}

.drawer-delete-btn {
  width: 24px;
  min-width: 24px;
  height: 24px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: #94A3B8;
  font-size: 18px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.drawer-empty {
  margin: 18px 0 0;
  text-align: center;
  font-size: 13px;
  color: #94A3B8;
}

.drawer-footer-btn {
  width: 100%;
  height: 42px;
  margin-top: 16px;
  border: 1px solid rgba(226, 232, 240, 0.88);
  border-radius: 14px;
  background: rgba(248, 250, 255, 0.88);
  color: #64748B;
  font-size: 13px;
  font-weight: 600;
}

.card {
  background: transparent;
  border-radius: 0;
  padding: 0;
  box-shadow: none;
  margin-bottom: 16px;
}

.knowledge-summary-card {
  margin-bottom: 14px;
}

.content-card {
  margin-bottom: 18px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 18px 38px rgba(104, 124, 168, 0.1);
  padding: 16px 14px 14px;
}

.knowledge-base-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(226, 232, 240, 0.88);
  box-shadow: 0 12px 26px rgba(104, 124, 168, 0.08);
}

.knowledge-summary-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.mini-btn {
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 999px;
  background: #fff;
  color: #0f172a;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
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
  border: none;
  background: transparent;
  min-height: 46px;
  max-height: 132px;
  resize: none;
  padding-top: 11px;
  padding-bottom: 11px;
  overflow-y: auto;
  padding-left: 8px;
  padding-right: 0;
}

.helper-text,
.empty-box {
  font-size: 13px;
  line-height: 1.6;
  color: #64748b;
}

.empty-box {
  margin-top: 0;
  padding: 28px 12px 16px;
  text-align: center;
}

.empty-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.empty-text {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: #64748b;
}

.empty-examples {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 16px;
}

.example-chip {
  border: 1px solid rgba(191, 219, 254, 0.9);
  border-radius: 999px;
  background: linear-gradient(180deg, #f8fbff 0%, #f2f7ff 100%);
  box-shadow: 0 8px 18px rgba(59, 130, 246, 0.08);
  padding: 9px 14px;
  font-size: 12px;
  color: #35517d;
}

.picker-helper {
  margin-top: 0;
  margin-bottom: 12px;
}

.picker-search {
  margin-bottom: 12px;
}

.knowledge-summary-text {
  margin-top: 4px;
}

.message-list {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.message-row {
  display: flex;
}

.message-row-user {
  justify-content: flex-end;
}

.message-row-assistant {
  justify-content: flex-start;
}

.message-bubble {
  max-width: 88%;
  border-radius: 24px;
  padding: 14px 16px;
}

.message-bubble-user {
  border: 1px solid #dbeafe;
  background: linear-gradient(180deg, #eff4ff 0%, #e8f0ff 100%);
  color: #0F172A;
}

.message-bubble-assistant {
  border: none;
  background: transparent;
  color: #0f172a;
  box-shadow: none;
  padding: 0 2px;
}

.message-content {
  font-size: 15px;
  line-height: 1.85;
}

.message-error {
  margin-top: 10px;
  font-size: 13px;
  color: #dc2626;
}

.think-box,
.meta-box {
  margin-bottom: 12px;
  border-radius: 16px;
  padding: 12px 14px;
}

.think-box {
  border: 1px solid #fcd34d;
  background: #fef3c7;
}

.meta-box {
  border: 1px solid #e2e8f0;
  background: rgba(248, 250, 255, 0.9);
}

.think-toggle,
.meta-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  font-size: 12px;
}

.think-toggle {
  color: #92400e;
}

.meta-toggle {
  color: #64748b;
  gap: 8px;
  justify-content: flex-start;
}

.think-box-interactive {
  cursor: pointer;
}

.think-arrow {
  font-size: 16px;
  line-height: 1;
}

.think-content {
  margin-top: 8px;
  font-size: 13px;
  line-height: 1.75;
  color: #78350f;
  opacity: 0.82;
}

.source-list {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.source-item {
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 12px;
  background: #fff;
}

.source-title {
  font-size: 13px;
  font-weight: 700;
  color: #0f172a;
}

.source-text {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.7;
  color: #475569;
}

.input-card {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: 0;
  z-index: 20;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid rgba(226, 232, 240, 0.88);
  box-shadow: 0 18px 36px rgba(99, 120, 170, 0.12);
  padding: 12px 14px calc(12px + env(safe-area-inset-bottom, 0px));
  backdrop-filter: blur(12px);
}

.input-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.submit-btn {
  min-width: 42px;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
}

.question-input {
  flex: 1;
}

.scroll-bottom-btn {
  position: fixed;
  right: 16px;
  bottom: calc(92px + env(safe-area-inset-bottom, 0px));
  z-index: 30;
  border: 1px solid rgba(226, 232, 240, 0.92);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  width: 42px;
  height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 20px;
  font-weight: 700;
  color: #0F172A;
}

.submit-btn {
  background: linear-gradient(180deg, #5f90f8 0%, #4b77ed 100%);
  color: #fff;
}

.loading-inline {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  font-size: 13px;
  color: #64748b;
}

.loading-dots {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.loading-dots span {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #0f766e;
  opacity: 0.3;
  animation: aiDots 1.1s infinite ease-in-out;
}

.loading-dots span:nth-child(2) {
  animation-delay: 0.15s;
}

.loading-dots span:nth-child(3) {
  animation-delay: 0.3s;
}

.collapse-enter-active,
.collapse-leave-active {
  transition: all 0.22s ease;
  transform-origin: top;
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  transform: translateY(-4px);
  max-height: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  opacity: 1;
  transform: translateY(0);
  max-height: 520px;
}

:deep(.markdown-body p) {
  margin: 0;
}

:deep(.markdown-body ul),
:deep(.markdown-body ol) {
  margin: 6px 0 0 20px;
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
  margin: 0;
  padding: 0;
  border-radius: 0;
  overflow-x: auto;
  background: transparent;
  color: inherit;
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
  margin: 6px 0 0;
  padding-left: 12px;
  border-left: 3px solid #cbd5e1;
  color: #475569;
}

@keyframes aiDots {
  0%, 80%, 100% {
    transform: scale(0.8);
    opacity: 0.25;
  }

  40% {
    transform: scale(1);
    opacity: 1;
  }
}
</style>
