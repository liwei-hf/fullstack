<template>
  <view class="sql-page">
    <view class="topbar">
      <button class="topbar-icon-btn" @click="drawerOpen = true">
        <view class="menu-icon" aria-hidden="true">
          <view />
          <view />
          <view />
        </view>
      </button>
      <button class="ghost-btn" @click="backHome">
        <view class="home-icon" />
      </button>
      <text class="topbar-title">智能问数</text>
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
                <text>{{ message.loadingMessage || '正在生成回答...' }}</text>
              </view>

              <text v-if="message.errorMessage" class="message-error">{{ message.errorMessage }}</text>

              <view v-if="message.sql" class="meta-box">
                <view class="meta-head">
                  <button class="meta-toggle" @click="toggleSql(message.id)">
                    <text>{{ message.sqlExpanded === false ? '▸' : '▾' }}</text>
                    <text>SQL</text>
                  </button>
                  <button class="meta-copy-btn" @click="copySql(message.sql)">复制</button>
                </view>
                <transition name="collapse">
                  <text v-if="message.sqlExpanded !== false" class="meta-content">{{ message.sql }}</text>
                </transition>
              </view>
            </view>
          </view>
        </view>
        <view v-else class="empty-box">
          <text class="empty-title">开始第一轮智能问数</text>
          <text class="empty-text">直接输入业务问题，系统会给出结果解释，并在需要时附上 SQL。</text>
          <view class="empty-examples">
            <button
              v-for="example in examples"
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
          placeholder="例如：今天完成了哪些待办？"
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
import type { AiConversationMessage, AiConversationSession, AiSqlSseEvent } from '@fullstack/shared'
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
import { streamSse } from '@/utils/request'

const examples = [
  '今天完成了哪些待办？',
  '当前共有多少个用户？',
  '各部门有多少人？',
  '我的待办里还有多少进行中的任务？',
]

const sessions = ref<AiConversationSession[]>([])
const activeSessionId = ref('')
const question = ref('')
const asking = ref(false)
const drawerOpen = ref(false)
const showScrollToBottom = ref(false)
const sessionKeyword = ref('')
const messageScrollTop = ref(0)
const pendingSessionId = ref('')
const abortController = ref<AbortController | null>(null)

const currentSession = computed(
  () => sessions.value.find((item) => item.id === activeSessionId.value) || sessions.value[0] || null,
)

const groupedSessions = computed(() => {
  return groupConversationSessions(
    sessions.value,
    sessionKeyword.value,
    (session) => {
      const latestMessage = session.messages[session.messages.length - 1]
      return [session.title, session.lastMessagePreview, latestMessage?.content]
    },
  )
})

function initializeSessions() {
  const loaded = loadConversationSessions('sql')
  if (loaded.length > 0) {
    sessions.value = loaded
    activeSessionId.value = loaded[0].id
    return
  }

  const initialSession = createConversationSession('sql')
  sessions.value = [initialSession]
  activeSessionId.value = initialSession.id
}

function persistSessions() {
  saveConversationSessions('sql', sessions.value)
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

function handleCreateSession() {
  const nextSession = createConversationSession('sql')
  sessions.value = [nextSession, ...sessions.value]
  activeSessionId.value = nextSession.id
  question.value = ''
  drawerOpen.value = false
  persistSessions()
}

function handleSelectSession(sessionId: string) {
  sessions.value = updateConversationSessionInList(sessions.value, sessionId, (session) => session)
  activeSessionId.value = sessionId
  persistSessions()
  drawerOpen.value = false
}

function handleDeleteSession(sessionId: string) {
  const nextSessions = removeConversationSession(sessions.value, sessionId)
  if (nextSessions.length === 0) {
    const fallbackSession = createConversationSession('sql')
    sessions.value = [fallbackSession]
    activeSessionId.value = fallbackSession.id
    question.value = ''
    persistSessions()
    return
  }

  sessions.value = nextSessions
  if (activeSessionId.value === sessionId) {
    activeSessionId.value = nextSessions[0]!.id
  }
  persistSessions()
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

  const trimmedQuestion = question.value.trim()
  if (!trimmedQuestion) {
    showToast('请输入要查询的问题')
    return
  }

  const userMessage = createConversationMessage('user', trimmedQuestion)
  const assistantMessage = createConversationMessage('assistant', '', {
    loadingMessage: '正在理解问题...',
    thinkingExpanded: true,
    sqlExpanded: false,
  })
  const targetSessionId = currentSession.value.id
  const nextTitle =
    currentSession.value.messages.length === 0
      ? deriveConversationTitle(trimmedQuestion)
      : currentSession.value.title

  updateSession(targetSessionId, (session) => ({
    ...session,
    title: nextTitle,
    updatedAt: new Date().toISOString(),
    lastMessagePreview: trimmedQuestion,
    messages: [...session.messages, userMessage, assistantMessage],
  }))

  question.value = ''
  asking.value = true
  abortController.value = new AbortController()

  try {
    await streamSse<AiSqlSseEvent>(
      '/ai/sql/stream',
      { question: trimmedQuestion, sessionId: currentSession.value.sessionId || undefined },
      (event) => {
        if (event.type === 'meta') {
          updateSession(targetSessionId, (session) => ({
            ...session,
            sessionId: event.sessionId,
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

        if (event.type === 'sql_generated') {
          updateMessage(targetSessionId, assistantMessage.id, (message) => ({
            ...message,
            sql: event.sql,
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
      errorMessage: aborted ? '已停止生成' : error instanceof Error ? error.message : '查询失败，请稍后重试',
    }))

    if (!aborted) {
      showToast(error instanceof Error ? error.message : '查询失败，请稍后重试')
    }
  } finally {
    abortController.value = null
    asking.value = false
  }
}

function toggleSql(messageId: string) {
  if (!currentSession.value) {
    return
  }

  updateMessage(currentSession.value.id, messageId, (message) => ({
    ...message,
    sqlExpanded: !message.sqlExpanded,
  }))
}

function copySql(sql: string) {
  uni.setClipboardData({
    data: sql,
    success: () => showToast('SQL 已复制'),
    fail: () => showToast('复制失败，请手动复制'),
  })
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
})

onShow(() => {
  if (!ensureAuthenticated()) {
    return
  }

  initializeSessions()
  if (pendingSessionId.value) {
    const matchedSession = sessions.value.find((session) => session.id === pendingSessionId.value)
    if (matchedSession) {
      activeSessionId.value = matchedSession.id
    }
  }
})

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

.sql-page {
  box-sizing: border-box;
  min-height: 100vh;
  min-height: 100svh;
  min-height: 100dvh;
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  padding: calc(72px + env(safe-area-inset-top, 0px)) 16px calc(132px + env(safe-area-inset-bottom, 0px));
  background:
    radial-gradient(circle at top left, rgba(111, 162, 255, 0.18), transparent 26%),
    linear-gradient(180deg, #eef4ff 0%, #f6f8ff 100%);
  display: flex;
  flex-direction: column;
}

.topbar {
  position: fixed;
  top: 0;
  left: 50%;
  right: auto;
  transform: translateX(-50%);
  width: min(100%, 420px);
  box-sizing: border-box;
  z-index: 25;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: calc(10px + env(safe-area-inset-top, 0px)) 16px 10px;
  background: rgba(255, 255, 255, 0.9);
  border-bottom: 1px solid rgba(226, 232, 240, 0.72);
  box-shadow: 0 8px 24px rgba(104, 124, 168, 0.06);
  backdrop-filter: blur(12px);
}

.topbar-icon-btn,
.ghost-btn,
.mini-btn,
.drawer-item-main,
.drawer-delete-btn,
.drawer-footer-btn,
.example-chip,
.submit-btn,
.meta-copy-btn,
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

.ghost-btn {
  height: 36px;
  border-radius: 999px;
  background: transparent;
  color: #0f172a;
  min-width: 40px;
  margin-left: -6px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
  line-height: 1;
}

.home-icon {
  width: 24px;
  height: 24px;
  background-repeat: no-repeat;
  background-position: center;
  background-size: 24px 24px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none'%3E%3Cpath d='M4.5 10.5 12 4.8l7.5 5.7' stroke='%230F172A' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3Cpath d='M6.7 9.9V18a1.8 1.8 0 0 0 1.8 1.8h7a1.8 1.8 0 0 0 1.8-1.8V9.9' stroke='%230F172A' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
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

.topbar-title,
.drawer-section-title,
.drawer-item-title,
.drawer-item-text,
.drawer-empty,
.empty-title,
.empty-text,
.message-error,
.meta-content {
  display: block;
}

.topbar-title {
  min-width: 0;
  flex-shrink: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.drawer-mask {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: rgba(15, 23, 42, 0.36);
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
  min-height: 56px;
  padding: 0 16px;
  border: 1px solid rgba(226, 232, 240, 0.88);
  border-radius: 22px;
  background: rgba(248, 250, 255, 0.92);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.68);
  overflow: hidden;
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

.message-scroll {
  flex: 1;
  min-height: 0;
  height: auto;
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

.section-title {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.mini-btn {
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: #0f172a;
  min-height: 34px;
  padding: 0 12px;
  font-size: 12px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.question-input {
  flex: 1;
  width: 100%;
  border: none;
  background: transparent;
  min-height: 46px;
  max-height: 132px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.7;
  color: #0f172a;
  padding: 11px 0 11px 8px;
}

.empty-box {
  font-size: 13px;
  line-height: 1.6;
  color: #64748b;
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
  gap: 8px;
  font-size: 12px;
  color: #64748b;
}

.meta-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.meta-copy-btn {
  flex-shrink: 0;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.9);
  min-height: 28px;
  padding: 0 10px;
  font-size: 11px;
  color: #475569;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.meta-content {
  margin-top: 10px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13px;
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
