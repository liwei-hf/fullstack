<template>
  <div class="home-page">
    <div class="home-shell">
      <div class="hero-card">
        <div class="hero-head">
          <div>
            <p class="hero-label">欢迎回来</p>
            <h1 class="hero-title">Hi，{{ authStore.user?.username || '今天想问点什么？' }}</h1>
          </div>
          <span class="role-pill">{{ authStore.user?.role === 'admin' ? '管理员' : '普通用户' }}</span>
        </div>
        <p class="hero-subtitle">从知识库问答和智能问数继续你的对话，也可以直接恢复最近会话。</p>
      </div>

      <button class="entry-card" @click="router.push('/sql')">
        <div class="entry-main">
          <span class="entry-icon">◎</span>
          <div>
            <p class="entry-title">智能问数</p>
            <p class="entry-desc">根据业务问题自动查询数据并生成自然语言回答</p>
          </div>
        </div>
        <span class="entry-arrow">›</span>
      </button>

      <button class="entry-card" @click="openKnowledgeBasePicker">
        <div class="entry-main">
          <span class="entry-icon entry-icon-teal">◌</span>
          <div>
            <p class="entry-title">知识库问答</p>
            <p class="entry-desc">围绕知识库文档连续追问，并查看引用来源</p>
          </div>
        </div>
        <span class="entry-arrow">›</span>
      </button>

      <div class="recent-card">
        <div class="section-head">
          <div>
            <p class="section-label">最近会话</p>
            <h2 class="section-title">继续上一次对话</h2>
          </div>
        </div>

        <section class="recent-section">
          <div class="recent-section-head">
            <span class="recent-dot" />
            <span>知识库问答</span>
          </div>
          <div v-if="recentKnowledgeBaseSessions.length" class="recent-list">
            <button
              v-for="session in recentKnowledgeBaseSessions"
              :key="session.id"
              class="recent-item"
              @click="handleOpenKnowledgeBaseSession(session)"
            >
              <div class="recent-item-main">
                <p class="recent-item-title">{{ session.title }}</p>
                <p class="recent-item-text">{{ session.lastMessagePreview || '继续当前知识库问答' }}</p>
              </div>
              <span class="recent-item-time">{{ formatRelativeTime(session.updatedAt || session.createdAt) }}</span>
            </button>
          </div>
          <p v-else class="recent-empty">还没有知识库问答历史</p>
        </section>

        <section class="recent-section">
          <div class="recent-section-head">
            <span class="recent-dot recent-dot-blue" />
            <span>智能问数</span>
          </div>
          <div v-if="recentSqlSessions.length" class="recent-list">
            <button
              v-for="session in recentSqlSessions"
              :key="session.id"
              class="recent-item"
              @click="router.push({ path: '/sql', query: { sessionId: session.id } })"
            >
              <div class="recent-item-main">
                <p class="recent-item-title">{{ session.title }}</p>
                <p class="recent-item-text">{{ session.lastMessagePreview || '继续当前智能问数对话' }}</p>
              </div>
              <span class="recent-item-time">{{ formatRelativeTime(session.updatedAt || session.createdAt) }}</span>
            </button>
          </div>
          <p v-else class="recent-empty">还没有智能问数历史</p>
        </section>
      </div>

      <button class="logout-btn" @click="handleLogout">退出登录</button>
    </div>

    <div v-if="knowledgeBasePickerOpen" class="picker-mask" @click="closeKnowledgeBasePicker">
      <div class="picker-panel" @click.stop>
        <div class="picker-head">
          <div>
            <p class="section-label">知识库问答</p>
            <h3 class="picker-title">先选择一个知识库</h3>
          </div>
          <button class="picker-close" @click="closeKnowledgeBasePicker">关闭</button>
        </div>

        <div class="picker-list">
          <button
            v-for="item in availableKnowledgeBases"
            :key="item.id"
            class="picker-item"
            @click="handleOpenKnowledgeBase(item.id)"
          >
            <div class="picker-item-main">
              <p class="picker-item-title">{{ item.name }}</p>
              <p class="picker-item-text">{{ item.description || '围绕当前知识库内容继续追问' }}</p>
            </div>
            <span class="picker-item-badge">{{ item.readyDocumentCount }}/{{ item.documentCount }}</span>
          </button>
          <p v-if="!availableKnowledgeBases.length" class="recent-empty">当前还没有可问答的知识库</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { AiConversationSession, KnowledgeBaseItem } from '@fullstack/shared'
import { useAuthStore } from '@/store/auth-store'
import { api } from '@/utils/request'
import { loadConversationSessions } from '@/utils/ai-conversation'

const router = useRouter()
const authStore = useAuthStore()
const knowledgeBasePickerOpen = ref(false)
const availableKnowledgeBases = ref<KnowledgeBaseItem[]>([])

const recentKnowledgeBaseSessions = computed(() =>
  loadConversationSessions('knowledge_base')
    .filter((session) => session.knowledgeBaseId && session.messages.length > 0)
    .slice(0, 4),
)

const recentSqlSessions = computed(() =>
  loadConversationSessions('sql')
    .filter((session) => session.messages.length > 0)
    .slice(0, 4),
)

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
  router.push({ path: '/knowledge-base', query: { knowledgeBaseId } })
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

  router.push({
    path: '/knowledge-base',
    query: {
      knowledgeBaseId: session.knowledgeBaseId,
      sessionId: session.id,
    },
  })
}

const handleLogout = async () => {
  try {
    await api.post<{ success: boolean }>('/auth/logout', {})
  } catch {
    // 即使后端撤销失败，也要确保本地登录态被清除
  } finally {
    authStore.logout()
    router.push('/login')
  }
}

onMounted(() => {
  void fetchKnowledgeBases()
})
</script>

<style scoped>
.home-page {
  min-height: 100vh;
  padding: 24px 18px 28px;
  background:
    radial-gradient(circle at top left, rgba(111, 162, 255, 0.22), transparent 30%),
    linear-gradient(180deg, #eef4ff 0%, #f6f8ff 100%);
}

.home-shell {
  max-width: 380px;
  margin: 0 auto;
}

.hero-card {
  border: 1px solid rgba(114, 157, 255, 0.08);
  border-radius: 24px;
  background: linear-gradient(155deg, #6ea1ff 0%, #4e7bf2 100%);
  color: #fff;
  box-shadow: 0 18px 40px rgba(79, 121, 238, 0.18);
  padding: 18px;
  margin-bottom: 14px;
}

.hero-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.hero-label {
  margin: 0 0 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.76);
}

.hero-title {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  color: #fff;
}

.hero-subtitle {
  margin: 12px 0 0;
  font-size: 14px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.84);
}

.role-pill {
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}

.entry-card {
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
  margin: 0;
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
  border: 1px solid rgba(226, 232, 240, 0.84);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 34px rgba(98, 120, 170, 0.08);
  padding: 18px 16px 16px;
}

.section-head {
  margin-bottom: 16px;
}

.section-label {
  margin: 0 0 6px;
  font-size: 12px;
  color: #8ea2cf;
}

.section-title {
  margin: 0;
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
  min-width: 0;
}

.recent-item-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  line-height: 1.5;
}

.recent-item-text {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
}

.recent-item-time {
  flex-shrink: 0;
  font-size: 11px;
  color: #94a3b8;
}

.recent-empty {
  margin: 0;
  padding: 10px 0 4px;
  font-size: 13px;
  color: #94a3b8;
}

.logout-btn {
  width: 100%;
  height: 44px;
  margin-top: 16px;
  border: 1px solid rgba(226, 232, 240, 0.84);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.78);
  color: #64748b;
  font-size: 14px;
  font-weight: 600;
}

.picker-mask {
  position: fixed;
  inset: 0;
  z-index: 30;
  background: rgba(15, 23, 42, 0.32);
  padding: 80px 16px 24px;
}

.picker-panel {
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
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: #111827;
}

.picker-close {
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
}

.picker-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.picker-item {
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
  min-width: 0;
}

.picker-item-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.picker-item-text {
  margin: 5px 0 0;
  font-size: 12px;
  line-height: 1.6;
  color: #64748b;
}

.picker-item-badge {
  border-radius: 999px;
  background: rgba(15, 118, 110, 0.1);
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 700;
  color: #0f766e;
}
</style>
