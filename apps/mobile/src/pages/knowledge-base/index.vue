<template>
  <view class="page">
    <view class="topbar">
      <button class="topbar-icon-btn" @click="drawerOpen = true">
        <view class="menu-icon" aria-hidden="true">
          <view />
          <view />
          <view />
        </view>
      </button>
      <button class="back-btn" @click="backHome">
        <view class="home-icon" />
      </button>
      <text class="topbar-title">文档问答</text>
      <button class="switch-kb-btn" @click="knowledgeBasePickerOpen = true">
        {{ selectedKnowledgeBase?.name || '选择知识库' }}
      </button>
    </view>

    <view v-if="drawerOpen" class="drawer-mask" @click="drawerOpen = false">
      <view class="drawer-panel" @click.stop>
        <view class="drawer-head">
          <text class="section-title">历史会话</text>
          <button class="mini-btn" @click="handleCreateSession">新建会话</button>
        </view>
        <view class="drawer-search">
          <text class="drawer-search-icon">⌕</text>
          <input
            v-model="sessionKeyword"
            class="drawer-search-input"
            placeholder="搜索对话..."
          />
        </view>
        <scroll-view class="drawer-sections" scroll-y>
          <view
            v-for="group in groupedSessions"
            :key="group.label"
            class="drawer-section"
          >
            <text class="drawer-section-title">{{ group.label }}</text>
            <view class="drawer-list">
              <view
                v-for="item in group.items"
                :key="item.id"
                :class="['drawer-item', item.id === currentSession?.id ? 'drawer-item-active' : '']"
              >
                <button class="drawer-item-main" @click="handleSelectSession(item.id)">
                  <text class="drawer-item-title">{{ item.title }}</text>
                  <text class="drawer-item-text">{{ item.lastMessagePreview || '新会话，等待第一轮提问' }}</text>
                </button>
                <button class="drawer-delete-btn" @click.stop="handleDeleteSession(item.id)">×</button>
              </view>
            </view>
          </view>
          <text v-if="groupedSessions.length === 0" class="drawer-empty">没有匹配的历史会话</text>
        </scroll-view>
        <button class="drawer-footer-btn" @click="backHome">返回首页</button>
      </view>
    </view>

    <view v-if="knowledgeBasePickerOpen" class="drawer-mask picker-mask" @click="knowledgeBasePickerOpen = false">
      <view class="picker-panel" @click.stop>
        <view class="drawer-head">
          <text class="section-title">选择知识库</text>
          <button class="mini-btn" @click="knowledgeBasePickerOpen = false">关闭</button>
        </view>
        <view class="drawer-search picker-search">
          <text class="drawer-search-icon">⌕</text>
          <input
            v-model="knowledgeBaseKeyword"
            class="drawer-search-input"
            placeholder="搜索知识库..."
          />
        </view>
        <text class="helper-text picker-helper">先选定本轮对话使用的知识库，进入会话后不再展示下拉选择。</text>
        <view class="drawer-list">
          <button
            v-for="item in filteredKnowledgeBases"
            :key="item.id"
            :class="['drawer-item', item.id === selectedId ? 'drawer-item-active' : '']"
            @click="selectKnowledgeBaseAndClose(item.id)"
          >
            <view class="drawer-item-row">
              <text class="drawer-item-title">{{ item.name }}</text>
              <text class="drawer-item-badge">{{ item.readyDocumentCount }}/{{ item.documentCount }}</text>
            </view>
            <text class="drawer-item-text">{{ item.description || '暂无描述' }}</text>
          </button>
        </view>
        <text v-if="filteredKnowledgeBases.length === 0" class="drawer-empty">没有匹配的知识库</text>
      </view>
    </view>

    <view class="card knowledge-summary-card">
      <view class="knowledge-base-head">
        <view>
          <text class="knowledge-summary-title">{{ selectedKnowledgeBase?.name || '请先选择知识库' }}</text>
          <text class="helper-text knowledge-summary-text">
            {{ selectedKnowledgeBase?.description || '这里只展示已经上传过文档的知识库。' }}
          </text>
        </view>
      </view>
    </view>

    <scroll-view
      class="message-scroll"
      scroll-y
      :scroll-top="messageScrollTop"
      @scroll="handleMessageScroll"
    >
      <view class="card content-card">
        <view v-if="currentSession?.messages.length" class="message-list">
          <view
            v-for="message in currentSession.messages"
            :key="message.id"
            :class="['message-row', message.role === 'user' ? 'message-row-user' : 'message-row-assistant']"
          >
            <view :class="['message-bubble', message.role === 'user' ? 'message-bubble-user' : 'message-bubble-assistant']">
              <rich-text
                v-if="message.content"
                class="message-content markdown-body"
                :nodes="renderMarkdown(message.content)"
              />
              <view
                v-else-if="message.role === 'assistant' && message.status === 'streaming'"
                class="loading-inline"
              >
                <view class="loading-dots" aria-hidden="true">
                  <view />
                  <view />
                  <view />
                </view>
                <text>{{ message.loadingMessage || '正在组织答案...' }}</text>
              </view>

              <text v-if="message.errorMessage" class="message-error">{{ message.errorMessage }}</text>

              <view v-if="message.sources?.length" class="meta-box">
                <button class="meta-toggle" @click="toggleSources(message.id)">
                  <text>{{ message.sourcesExpanded ? '▾' : '▸' }}</text>
                  <text>引用来源</text>
                </button>
                <transition name="collapse">
                  <view v-if="message.sourcesExpanded" class="source-list">
                    <view v-for="item in message.sources" :key="item.chunkId" class="source-item">
                      <text class="source-title">{{ item.documentName }}</text>
                      <text class="source-text">{{ item.snippet }}</text>
                    </view>
                  </view>
                </transition>
              </view>
            </view>
          </view>
        </view>
        <view v-else class="empty-box">
          <text class="empty-title">开始第一轮知识库问答</text>
          <text class="empty-text">选择知识库后，你可以围绕同一份文档持续追问，引用来源会跟随每次回答展示。</text>
          <view class="empty-examples">
            <button
              v-for="example in exampleQuestions"
              :key="example"
              class="example-chip"
              @click="question = example"
            >
              {{ example }}
            </button>
          </view>
        </view>
      </view>
    </scroll-view>

    <button
      v-if="showScrollToBottom"
      class="scroll-bottom-btn"
      @click="scrollToBottom"
    >
      ↓
    </button>

    <view class="input-card">
      <view class="input-row">
        <textarea
          v-model="question"
          class="question-input"
          auto-height
          maxlength="-1"
          :placeholder="selectedKnowledgeBase ? `向“${selectedKnowledgeBase.name}”提问` : '请先选择知识库'"
          confirm-type="send"
          @confirm="handleAsk"
        />
        <button class="submit-btn" @click="handleAsk">
          {{ asking ? '■' : '↑' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import type { AiConversationMessage, AiConversationSession, KnowledgeBaseItem, RagSseEvent } from '@fullstack/shared'
import { ensureAuthenticated } from '@/utils/auth'
import { groupConversationSessions, isAbortError, shouldShowScrollToBottom } from '@/utils/chat'
import {
  createConversationMessage,
  createConversationSession,
  deriveConversationTitle,
  loadConversationSessions,
  removeConversationSession,
  saveConversationSessions,
  updateConversationSessionInList,
} from '@/utils/ai-conversation'
import { MOBILE_PAGES, reLaunchTo } from '@/utils/navigation'
import { renderMarkdown } from '@/utils/markdown'
import { showToast } from '@/utils/toast'
import { api, streamSse } from '@/utils/request'

const defaultExamples = [
  '这份制度里对请假流程怎么规定？',
  '病假需要补充哪些材料？',
  '如果员工迟到，会有什么处理方式？',
]

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
const messageScrollTop = ref(0)
const pendingSessionId = ref('')
const pendingKnowledgeBaseId = ref('')
const abortController = ref<AbortController | null>(null)

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

const exampleQuestions = computed(() => {
  if (selectedKnowledgeBase.value?.suggestedQuestions?.length) {
    return selectedKnowledgeBase.value.suggestedQuestions
  }

  return defaultExamples
})

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
  return groupConversationSessions(
    visibleSessions.value,
    sessionKeyword.value,
    (session) => {
      const latestMessage = session.messages[session.messages.length - 1]
      return [session.title, session.lastMessagePreview, latestMessage?.content]
    },
  )
})

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

    const preferredId = pendingKnowledgeBaseId.value || currentSession.value?.knowledgeBaseId
    if (preferredId && filtered.some((item) => item.id === preferredId)) {
      selectedId.value = preferredId
      return
    }

    selectedId.value = filtered[0]?.id || ''
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

function handleSelectSession(sessionId: string) {
  sessions.value = updateConversationSessionInList(sessions.value, sessionId, (session) => session)
  activeSessionId.value = sessionId
  const matchedSession = sessions.value.find((session) => session.id === sessionId)
  if (matchedSession?.knowledgeBaseId) {
    selectedId.value = matchedSession.knowledgeBaseId
  }
  persistSessions()
  drawerOpen.value = false
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
  }
  persistSessions()
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
  knowledgeBasePickerOpen.value = false
}

function backHome() {
  reLaunchTo(MOBILE_PAGES.home)
}

function handleStop() {
  abortController.value?.abort()
}

async function handleAsk() {
  if (asking.value) {
    handleStop()
    return
  }

  if (!currentSession.value) {
    return
  }

  if (!selectedId.value) {
    knowledgeBasePickerOpen.value = true
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

        if (event.type === 'answer_delta') {
          updateMessage(targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            content: `${message.content || ''}${event.delta}`,
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
  } catch (error) {
    const aborted = isAbortError(error)
    updateMessage(targetSessionId, assistantMessage.id, (message) => ({
      ...message,
      status: aborted ? 'done' : 'error',
      loadingMessage: '',
      errorMessage: aborted ? '已停止生成' : error instanceof Error ? error.message : '知识库问答失败',
    }))

    if (!aborted) {
      showToast(error instanceof Error ? error.message : '知识库问答失败')
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
  messageScrollTop.value += 100000
  showScrollToBottom.value = false
}

function handleMessageScroll(event: any) {
  showScrollToBottom.value = shouldShowScrollToBottom(event.detail)
}

onLoad((options) => {
  pendingSessionId.value = options?.sessionId || ''
  pendingKnowledgeBaseId.value = options?.knowledgeBaseId || ''
})

onShow(() => {
  if (!ensureAuthenticated()) {
    return
  }

  initializeSessions()
  void fetchKnowledgeBases()

  if (pendingSessionId.value) {
    const matchedSession = sessions.value.find((session) => session.id === pendingSessionId.value)
    if (matchedSession) {
      activeSessionId.value = matchedSession.id
      if (matchedSession.knowledgeBaseId) {
        selectedId.value = matchedSession.knowledgeBaseId
      }
    }
  }
})

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
  () => currentSession.value?.messages,
  async () => {
    await nextTick()
    scrollToBottom()
  },
  { deep: true },
)
</script>

<style scoped>
button {
  box-sizing: border-box;
  font-family: inherit;
}

input,
textarea {
  box-sizing: border-box;
}

button::after {
  border: none;
}

.page {
  box-sizing: border-box;
  min-height: 100vh;
  min-height: 100svh;
  min-height: 100dvh;
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  padding: calc(108px + env(safe-area-inset-top, 0px)) 16px calc(132px + env(safe-area-inset-bottom, 0px));
  background:
    radial-gradient(circle at top left, rgba(111, 162, 255, 0.18), transparent 26%),
    linear-gradient(180deg, #eef4ff 0%, #f6f8ff 100%);
}

.topbar {
  position: fixed;
  top: 0;
  left: 50%;
  right: auto;
  transform: translateX(-50%);
  width: min(100%, 420px);
  box-sizing: border-box;
  min-height: calc(60px + env(safe-area-inset-top, 0px));
  z-index: 25;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: calc(8px + env(safe-area-inset-top, 0px)) 16px 8px;
  background: rgba(255, 255, 255, 0.9);
  border-bottom: 1px solid rgba(226, 232, 240, 0.72);
  box-shadow: 0 8px 24px rgba(104, 124, 168, 0.06);
  backdrop-filter: blur(12px);
}

.topbar-icon-btn,
.back-btn,
.switch-kb-btn,
.mini-btn,
.drawer-item-main,
.drawer-delete-btn,
.drawer-footer-btn,
.example-chip,
.submit-btn,
.meta-toggle,
.scroll-bottom-btn {
  appearance: none;
  border: none;
  background: none;
  padding: 0;
  margin: 0;
  line-height: 1;
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
  color: #0f172a;
}

.home-icon {
  width: 24px;
  height: 24px;
  background-repeat: no-repeat;
  background-position: center;
  background-size: 24px 24px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M4.5 10.5 12 4.8l7.5 5.7' stroke='%230F172A' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M6.7 9.9V18a1.8 1.8 0 0 0 1.8 1.8h7a1.8 1.8 0 0 0 1.8-1.8V9.9' stroke='%230F172A' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
}

.switch-kb-btn {
  margin-left: auto;
  align-self: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  max-width: 44vw;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(226, 232, 240, 0.88);
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.topbar-title {
  flex-shrink: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.menu-icon {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
}

.menu-icon view {
  height: 2px;
  border-radius: 999px;
  background: #0f172a;
}

.menu-icon view:nth-child(1) {
  width: 18px;
}

.menu-icon view:nth-child(2) {
  width: 12px;
}

.menu-icon view:nth-child(3) {
  width: 15px;
}

.drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(15, 23, 42, 0.36);
}

.picker-mask {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: calc(76px + env(safe-area-inset-top, 0px)) 16px calc(24px + env(safe-area-inset-bottom, 0px));
}

.drawer-panel {
  width: 82vw;
  max-width: 320px;
  height: 100%;
  background: #ffffff;
  box-shadow: 18px 0 40px rgba(15, 23, 42, 0.12);
  padding: 20px 16px;
  display: flex;
  flex-direction: column;
}

.picker-panel {
  box-sizing: border-box;
  width: 100%;
  max-width: 360px;
  max-height: min(72vh, 640px);
  margin: 0;
  overflow-y: auto;
  border-radius: 32px;
  background: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 26px 56px rgba(15, 23, 42, 0.16);
  padding: 24px 16px 18px;
}

.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.picker-panel .drawer-head {
  align-items: center;
  margin-bottom: 18px;
}

.drawer-search {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 56px;
  padding: 0 16px;
  border: 1px solid rgba(226, 232, 240, 0.88);
  border-radius: 22px;
  background: rgba(248, 250, 255, 0.92);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68);
  overflow: hidden;
  margin-bottom: 16px;
}

.picker-panel .drawer-search {
  margin-bottom: 16px;
}

.drawer-search-icon {
  position: absolute;
  left: 18px;
  top: 50%;
  transform: translateY(-50%);
  color: #94a3b8;
  font-size: 15px;
}

.drawer-search-input {
  flex: 1;
  width: 100%;
  height: 54px;
  border: none;
  border-radius: 0;
  background: transparent;
  padding: 0 0 0 34px;
  font-size: 14px;
  line-height: 54px;
  color: #334155;
  outline: none;
  appearance: none;
  box-shadow: none;
}

.picker-panel .drawer-search-input {
  height: 54px;
  line-height: 54px;
}

.drawer-sections {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 14px;
}

.drawer-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.drawer-section-title,
.drawer-item-title,
.drawer-item-text,
.drawer-empty,
.knowledge-summary-title,
.helper-text,
.empty-title,
.empty-text,
.message-error,
.source-title,
.source-text {
  display: block;
}

.drawer-section-title {
  padding-left: 2px;
  font-size: 12px;
  font-weight: 700;
  color: #64748b;
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

.picker-panel .drawer-list {
  gap: 12px;
}

.picker-panel .drawer-item {
  padding: 14px 14px 14px 16px;
  min-height: 74px;
}

.picker-panel .drawer-item-row {
  align-items: center;
}

.picker-panel .drawer-item-title {
  flex: 1;
  min-width: 0;
}

.picker-panel .drawer-item-badge {
  flex-shrink: 0;
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
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-item-text {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
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
  color: #0f766e;
}

.drawer-delete-btn {
  width: 24px;
  min-width: 24px;
  height: 24px;
  border-radius: 999px;
  background: transparent;
  color: #94a3b8;
  font-size: 18px;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.drawer-empty {
  margin-top: 18px;
  text-align: center;
  font-size: 13px;
  color: #94a3b8;
}

.drawer-footer-btn {
  width: 100%;
  height: 42px;
  margin-top: 16px;
  border: 1px solid rgba(226, 232, 240, 0.88);
  border-radius: 14px;
  background: rgba(248, 250, 255, 0.88);
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.card {
  background: transparent;
  border: none;
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
  border: 1px solid rgba(255, 255, 255, 0.46);
  box-shadow: 0 18px 38px rgba(104, 124, 168, 0.1);
  backdrop-filter: blur(10px);
  padding: 18px 14px 14px;
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
  backdrop-filter: blur(10px);
}

.knowledge-base-head > view {
  flex: 1;
  min-width: 0;
}

.knowledge-summary-title {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.5;
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
  min-height: 34px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.picker-panel .mini-btn {
  min-width: 72px;
  height: 38px;
  padding: 0 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.question-input {
  flex: 1;
  width: 100%;
  border: none;
  background: transparent;
  min-height: 46px;
  max-height: 132px;
  padding: 11px 0 11px 8px;
  font-size: 14px;
  color: #111827;
}

.helper-text,
.empty-box {
  font-size: 13px;
  line-height: 1.6;
  color: #64748b;
}

.empty-box {
  padding: 28px 12px 16px;
  text-align: center;
}

.empty-title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.empty-text {
  margin-top: 8px;
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
  min-height: 38px;
  padding: 0 14px;
  font-size: 12px;
  color: #35517d;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.picker-helper {
  margin-bottom: 16px;
  line-height: 1.7;
}

.picker-search {
  margin-bottom: 12px;
}

.knowledge-summary-text {
  margin-top: 4px;
}

.message-scroll {
  flex: 1;
  min-height: 0;
  height: auto;
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
  color: #0f172a;
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

.meta-box {
  margin-bottom: 12px;
  border-radius: 16px;
  padding: 12px 14px;
  border: 1px solid #e2e8f0;
  background: rgba(248, 250, 255, 0.9);
}

.meta-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  font-size: 12px;
  color: #64748b;
  gap: 8px;
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
  left: 50%;
  right: auto;
  transform: translateX(-50%);
  width: calc(100% - 32px);
  max-width: 388px;
  box-sizing: border-box;
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
  align-items: flex-end;
  gap: 10px;
}

.submit-btn {
  min-width: 42px;
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(180deg, #5f90f8 0%, #4b77ed 100%);
  color: #fff;
  box-shadow: 0 10px 22px rgba(79, 121, 238, 0.22);
}

.scroll-bottom-btn {
  position: fixed;
  right: max(calc(50% - 194px), 16px);
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
  color: #0f172a;
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

.loading-dots view {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #0f766e;
  opacity: 0.3;
  animation: aiDots 1.1s infinite ease-in-out;
}

.loading-dots view:nth-child(2) {
  animation-delay: 0.15s;
}

.loading-dots view:nth-child(3) {
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
