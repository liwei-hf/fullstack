<template>
  <div class="index-container">
    <div class="header">
      <h1 class="title">移动端首页</h1>
      <p class="subtitle">登录成功，开始体验自然语言查数</p>
    </div>

    <div class="user-info" v-if="authStore.user">
      <p class="username">{{ authStore.user.username }}</p>
      <p class="role-tag">{{ authStore.user.role === 'admin' ? '管理员' : '普通用户' }}</p>
    </div>

    <div class="tool-card">
      <p class="tool-title">自然语言查数</p>
      <p class="tool-desc">
        直接输入“今天完成了哪些待办？”这类问题，系统会自动查询并返回自然语言答案。
      </p>
      <button class="query-btn" @click="router.push('/sql')">进入查数</button>
    </div>

    <div class="tool-card">
      <p class="tool-title">文档知识库问答</p>
      <p class="tool-desc">
        先选择知识库，再针对上传的文档内容发问，系统会返回流式回答和引用来源。
      </p>
      <button class="query-btn kb-btn" @click="router.push('/knowledge-base')">进入文档问答</button>
    </div>

    <button class="logout-btn" @click="handleLogout">退出登录</button>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth-store'
import { api } from '@/utils/request'

const router = useRouter()
const authStore = useAuthStore()

/**
 * 登出处理
 */
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
.index-container {
  min-height: 100vh;
  padding: 120px 20px 20px;
  background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
}

.header {
  text-align: center;
  margin-bottom: 40px;
}

.title {
  font-size: 32px;
  font-weight: bold;
  color: #fff;
  margin-bottom: 8px;
}

.subtitle {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.8);
}

.user-info {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  margin-bottom: 30px;
  backdrop-filter: blur(10px);
}

.username {
  font-size: 24px;
  font-weight: bold;
  color: #fff;
}

.role-tag {
  margin-top: 12px;
  display: inline-flex;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  font-size: 12px;
}

.tool-card {
  background: #fff;
  border-radius: 20px;
  padding: 24px 20px;
  margin-bottom: 20px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.12);
}

.tool-title {
  font-size: 20px;
  font-weight: 700;
  color: #111827;
  margin-bottom: 8px;
}

.tool-desc {
  font-size: 14px;
  line-height: 1.7;
  color: #4B5563;
  margin-bottom: 18px;
}

.query-btn {
  width: 100%;
  height: 48px;
  border: none;
  border-radius: 12px;
  background: #111827;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
}

.kb-btn {
  background: #0f766e;
}

.logout-btn {
  width: 100%;
  height: 48px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 16px;
  border: 1px solid rgba(255, 255, 255, 0.5);
  cursor: pointer;
}

.query-btn:hover,
.logout-btn:hover {
  background: rgba(255, 255, 255, 0.4);
}
</style>
