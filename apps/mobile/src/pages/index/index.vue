<template>
  <div class="home-page">
    <div class="home-shell">
      <div class="hero-card">
        <div class="hero-head">
          <div>
            <p class="hero-label">已登录</p>
            <h1 class="hero-title">{{ authStore.user?.username || 'AI 助手' }}</h1>
          </div>
          <span class="role-pill">{{ authStore.user?.role === 'admin' ? '管理员' : '普通用户' }}</span>
        </div>
        <p class="hero-subtitle">选择一个入口，继续当前的问答会话。</p>
      </div>

      <button class="entry-card" @click="router.push('/sql')">
        <div class="entry-main">
          <span class="entry-icon">◎</span>
          <div>
            <p class="entry-title">自然语言查数</p>
            <p class="entry-desc">根据业务问题自动查询数据并生成自然语言回答</p>
          </div>
        </div>
        <span class="entry-arrow">›</span>
      </button>

      <button class="entry-card" @click="router.push('/knowledge-base')">
        <div class="entry-main">
          <span class="entry-icon entry-icon-teal">◌</span>
          <div>
            <p class="entry-title">文档问答</p>
            <p class="entry-desc">围绕知识库文档连续追问，并查看引用来源</p>
          </div>
        </div>
        <span class="entry-arrow">›</span>
      </button>

      <button class="logout-btn" @click="handleLogout">退出登录</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth-store'
import { api } from '@/utils/request'

const router = useRouter()
const authStore = useAuthStore()

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
  font-size: 24px;
  font-weight: 700;
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
</style>
