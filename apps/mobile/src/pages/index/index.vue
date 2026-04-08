<template>
  <view class="home-page">
    <view class="home-shell">
      <view class="hero-card">
        <view class="hero-head">
          <view>
            <text class="hero-label">欢迎回来</text>
            <text class="hero-title">Hi，{{ authStore.user?.username || '今天想问点什么？' }}</text>
          </view>
          <text class="role-pill">{{ authStore.user?.role === 'admin' ? '管理员' : '普通用户' }}</text>
        </view>
        <text class="hero-subtitle">从知识库问答和智能问数继续你的对话，也可以直接恢复最近会话。</text>
      </view>

      <button class="entry-card" @click="openSqlPage()">
        <view class="entry-main">
          <text class="entry-icon">◎</text>
          <view>
            <text class="entry-title">智能问数</text>
            <text class="entry-desc">根据业务问题自动查询数据并生成自然语言回答</text>
          </view>
        </view>
        <text class="entry-arrow">›</text>
      </button>

      <button class="entry-card" @click="openKnowledgeBasePicker">
        <view class="entry-main">
          <text class="entry-icon entry-icon-teal">◌</text>
          <view>
            <text class="entry-title">知识库问答</text>
            <text class="entry-desc">围绕知识库文档连续追问，并查看引用来源</text>
          </view>
        </view>
        <text class="entry-arrow">›</text>
      </button>

      <view class="recent-card">
        <view class="section-head">
          <view>
            <text class="section-label">最近会话</text>
            <text class="section-title">继续上一次对话</text>
          </view>
        </view>

        <view class="recent-section">
          <view class="recent-section-head">
            <view class="recent-dot" />
            <text>知识库问答</text>
          </view>
          <view v-if="recentKnowledgeBaseSessions.length" class="recent-list">
            <button
              v-for="session in recentKnowledgeBaseSessions"
              :key="session.id"
              class="recent-item"
              @click="handleOpenKnowledgeBaseSession(session)"
            >
              <view class="recent-item-main">
                <text class="recent-item-title">{{ session.title }}</text>
                <text class="recent-item-text">{{ session.lastMessagePreview || '继续当前知识库问答' }}</text>
              </view>
              <text class="recent-item-time">{{ formatRelativeTime(session.updatedAt || session.createdAt) }}</text>
            </button>
          </view>
          <text v-else class="recent-empty">还没有知识库问答历史</text>
        </view>

        <view class="recent-section">
          <view class="recent-section-head">
            <view class="recent-dot recent-dot-blue" />
            <text>智能问数</text>
          </view>
          <view v-if="recentSqlSessions.length" class="recent-list">
            <button
              v-for="session in recentSqlSessions"
              :key="session.id"
              class="recent-item"
              @click="openSqlPage(session.id)"
            >
              <view class="recent-item-main">
                <text class="recent-item-title">{{ session.title }}</text>
                <text class="recent-item-text">{{ session.lastMessagePreview || '继续当前智能问数对话' }}</text>
              </view>
              <text class="recent-item-time">{{ formatRelativeTime(session.updatedAt || session.createdAt) }}</text>
            </button>
          </view>
          <text v-else class="recent-empty">还没有智能问数历史</text>
        </view>
      </view>

      <button class="logout-btn" @click="handleLogout">退出登录</button>
    </view>

    <view v-if="knowledgeBasePickerOpen" class="picker-mask" @click="closeKnowledgeBasePicker">
      <view class="picker-panel" @click.stop>
        <view class="picker-head">
          <view>
            <text class="section-label">知识库问答</text>
            <text class="picker-title">先选择一个知识库</text>
          </view>
          <button class="picker-close" @click="closeKnowledgeBasePicker">关闭</button>
        </view>

        <view class="picker-list">
          <button
            v-for="item in availableKnowledgeBases"
            :key="item.id"
            class="picker-item"
            @click="handleOpenKnowledgeBase(item.id)"
          >
            <view class="picker-item-main">
              <text class="picker-item-title">{{ item.name }}</text>
              <text class="picker-item-text">{{ item.description || '围绕当前知识库内容继续追问' }}</text>
            </view>
            <text class="picker-item-badge">{{ item.readyDocumentCount }}/{{ item.documentCount }}</text>
          </button>
          <text v-if="!availableKnowledgeBases.length" class="recent-empty">当前还没有可问答的知识库</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import type { AiConversationSession, KnowledgeBaseItem } from '@fullstack/shared'
import { useAuthStore } from '@/store/auth-store'
import { ensureAuthenticated } from '@/utils/auth'
import { MOBILE_PAGES, navigateTo, reLaunchTo } from '@/utils/navigation'
import { api } from '@/utils/request'
import { loadConversationSessions } from '@/utils/ai-conversation'

const authStore = useAuthStore()
const knowledgeBasePickerOpen = ref(false)
const availableKnowledgeBases = ref<KnowledgeBaseItem[]>([])
const recentKnowledgeBaseSessions = ref<AiConversationSession[]>([])
const recentSqlSessions = ref<AiConversationSession[]>([])

const refreshSessions = () => {
  recentKnowledgeBaseSessions.value = loadConversationSessions('knowledge_base')
    .filter((session) => session.knowledgeBaseId && session.messages.length > 0)
    .slice(0, 4)

  recentSqlSessions.value = loadConversationSessions('sql')
    .filter((session) => session.messages.length > 0)
    .slice(0, 4)
}

const formatRelativeTime = (isoTime: string) => {
  const target = new Date(isoTime).getTime()
  const now = Date.now()
  const diffMinutes = Math.max(1, Math.floor((now - target) / 60000))

  if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`
  }

  if (diffMinutes < 24 * 60) {
    return `${Math.floor(diffMinutes / 60)}小时前`
  }

  return `${Math.floor(diffMinutes / (24 * 60))}天前`
}

const fetchKnowledgeBases = async () => {
  try {
    const response = await api.get<KnowledgeBaseItem[]>('/knowledge-base')
    availableKnowledgeBases.value = response.filter((item) => item.documentCount > 0)
  } catch {
    availableKnowledgeBases.value = []
  }
}

const openSqlPage = (sessionId?: string) => {
  navigateTo(MOBILE_PAGES.sql, sessionId ? { sessionId } : undefined)
}

const openKnowledgeBasePicker = async () => {
  if (!availableKnowledgeBases.value.length) {
    await fetchKnowledgeBases()
  }

  knowledgeBasePickerOpen.value = true
}

const closeKnowledgeBasePicker = () => {
  knowledgeBasePickerOpen.value = false
}

const handleOpenKnowledgeBase = (knowledgeBaseId: string) => {
  closeKnowledgeBasePicker()
  navigateTo(MOBILE_PAGES.knowledgeBase, { knowledgeBaseId })
}

const handleOpenKnowledgeBaseSession = async (session: AiConversationSession) => {
  if (!session.knowledgeBaseId) {
    await openKnowledgeBasePicker()
    return
  }

  if (!availableKnowledgeBases.value.length) {
    await fetchKnowledgeBases()
  }

  const matched = availableKnowledgeBases.value.find((item) => item.id === session.knowledgeBaseId)
  if (!matched) {
    await openKnowledgeBasePicker()
    return
  }

  navigateTo(MOBILE_PAGES.knowledgeBase, {
    knowledgeBaseId: session.knowledgeBaseId,
    sessionId: session.id,
  })
}

const handleLogout = async () => {
  try {
    await api.post<{ success: boolean }>('/auth/logout', {})
  } catch {
    // 即使后端撤销失败，也要确保本地登录态被清除
  } finally {
    authStore.logout()
    reLaunchTo(MOBILE_PAGES.login)
  }
}

onShow(() => {
  if (!ensureAuthenticated()) {
    return
  }

  refreshSessions()
  void fetchKnowledgeBases()
})
</script>

<style scoped>
button {
  box-sizing: border-box;
  font-family: inherit;
}

button::after {
  border: none;
}

.home-page {
  box-sizing: border-box;
  min-height: 100vh;
  min-height: 100svh;
  min-height: 100dvh;
  padding: calc(24px + env(safe-area-inset-top, 0px)) 18px calc(28px + env(safe-area-inset-bottom, 0px));
  background:
    radial-gradient(circle at top left, rgba(111, 162, 255, 0.22), transparent 30%),
    linear-gradient(180deg, #eef4ff 0%, #f6f8ff 100%);
}

.home-shell {
  width: 100%;
  max-width: 380px;
  margin: 0 auto;
}

.hero-card {
  border: 1px solid rgba(114, 157, 255, 0.08);
  border-radius: 24px;
  background: linear-gradient(155deg, #6ea1ff 0%, #4e7bf2 100%);
  color: #fff;
  box-shadow: 0 18px 40px rgba(79, 121, 238, 0.18);
  padding: 20px 18px 18px;
  margin-bottom: 16px;
}

.hero-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.hero-label,
.hero-title,
.hero-subtitle,
.entry-title,
.entry-desc,
.section-label,
.section-title,
.recent-item-title,
.recent-item-text,
.recent-item-time,
.recent-empty,
.picker-title,
.picker-item-title,
.picker-item-text {
  display: block;
}

.hero-label {
  margin-bottom: 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.76);
}

.hero-title {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  color: #fff;
}

.hero-subtitle {
  margin-top: 12px;
  font-size: 14px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.84);
}

.role-pill {
  flex-shrink: 0;
  align-self: flex-start;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
}

.entry-card {
  appearance: none;
  margin: 0;
  line-height: inherit;
  width: 100%;
  border: 1px solid rgba(226, 232, 240, 0.84);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 12px 28px rgba(98, 120, 170, 0.08);
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  text-align: left;
}

.entry-card + .entry-card {
  margin-top: 12px;
}

.entry-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
  min-width: 0;
}

.entry-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  background: rgba(59, 130, 246, 0.1);
  color: #2563eb;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-weight: 700;
}

.entry-icon-teal {
  background: rgba(13, 148, 136, 0.1);
  color: #0f766e;
}

.entry-title {
  margin: 1px 0 4px;
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}

.entry-desc {
  font-size: 13px;
  line-height: 1.6;
  color: #64748b;
}

.entry-arrow {
  font-size: 22px;
  color: #94a3b8;
}

.recent-card {
  margin-top: 16px;
  border: 1px solid rgba(255, 255, 255, 0.46);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 34px rgba(98, 120, 170, 0.08);
  backdrop-filter: blur(10px);
  padding: 18px 16px 16px;
}

.section-head {
  margin-bottom: 16px;
}

.section-label {
  margin-bottom: 6px;
  font-size: 12px;
  color: #8ea2cf;
}

.section-title {
  font-size: 20px;
  font-weight: 700;
  color: #20304f;
}

.recent-section + .recent-section {
  margin-top: 18px;
}

.recent-section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 700;
  color: #475569;
}

.recent-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #0f766e;
}

.recent-dot-blue {
  background: #3b82f6;
}

.recent-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recent-item {
  appearance: none;
  margin: 0;
  line-height: inherit;
  position: relative;
  width: 100%;
  border: 1px solid rgba(226, 232, 240, 0.84);
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
  padding: 13px 38px 13px 14px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
}

.recent-item::after {
  content: '›';
  position: absolute;
  right: 14px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 18px;
  color: #c0cad9;
}

.recent-item-main {
  flex: 1;
  min-width: 0;
}

.recent-item-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  line-height: 1.5;
}

.recent-item-text {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
}

.recent-item-time {
  flex-shrink: 0;
  margin-left: 8px;
  font-size: 11px;
  color: #94a3b8;
}

.recent-empty {
  padding: 10px 0 4px;
  font-size: 13px;
  color: #94a3b8;
}

.logout-btn {
  appearance: none;
  margin-left: 0;
  margin-right: 0;
  line-height: 1;
  width: 100%;
  height: 44px;
  margin-top: 16px;
  border: 1px solid rgba(226, 232, 240, 0.84);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.92);
  color: #64748b;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 10px 22px rgba(98, 120, 170, 0.06);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.picker-mask {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgba(15, 23, 42, 0.32);
  padding: 80px 16px 24px;
}

.picker-panel {
  box-sizing: border-box;
  width: 100%;
  max-width: 380px;
  margin: 0 auto;
  border-radius: 24px;
  background: #fff;
  box-shadow: 0 20px 44px rgba(15, 23, 42, 0.14);
  padding: 18px 16px;
}

.picker-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.picker-title {
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.picker-close {
  appearance: none;
  border: none;
  padding: 0;
  margin: 0;
  line-height: 1;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
  min-width: 72px;
  height: 38px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.picker-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.picker-item {
  appearance: none;
  margin: 0;
  line-height: inherit;
  width: 100%;
  border: 1px solid rgba(226, 232, 240, 0.88);
  border-radius: 20px;
  background: #fff;
  padding: 14px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04);
}

.picker-item-main {
  flex: 1;
  min-width: 0;
}

.picker-item-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.picker-item-text {
  margin-top: 5px;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
}

.picker-item-badge {
  flex-shrink: 0;
  border-radius: 999px;
  background: rgba(15, 118, 110, 0.1);
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  color: #0f766e;
}
</style>
