<template>
  <div class="login-container">
    <!-- 顶部装饰区 -->
    <div class="header">
      <div class="logo">
        <span class="logo-text">M</span>
      </div>
      <h1 class="title">欢迎回来</h1>
      <p class="subtitle">请输入账号密码登录</p>
    </div>

    <!-- 登录表单 -->
    <div class="form">
      <div class="form-item">
        <label class="label">账号</label>
        <input
          class="input"
          v-model="account"
          placeholder="用户名或手机号"
        />
      </div>

      <div class="form-item">
        <label class="label">密码</label>
        <input
          class="input"
          v-model="password"
          type="password"
          placeholder="请输入密码"
        />
      </div>

      <button
        class="login-btn"
        :class="{ loading }"
        :disabled="loading"
        @click="handleLogin"
      >
        <span v-if="loading" class="spinner"></span>
        {{ loading ? '登录中...' : '登录' }}
      </button>
    </div>

    <!-- 默认账号提示 -->
    <div class="tips">
      <span class="tips-label">测试账号：</span>
      <code class="tips-text">admin / Admin123456!</code>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth-store'
import { api } from '@/utils/request'

interface LoginResponse {
  user: {
    id: string
    username: string
    phone: string
    role: 'admin' | 'user'
    status: 'active' | 'disabled'
    clientType: 'admin' | 'mobile'
    sessionId: string
  }
  tokens: {
    accessToken: string
    refreshToken: string
    expiresIn: number
  }
}

const router = useRouter()
const authStore = useAuthStore()

const account = ref('admin')
const password = ref('Admin123456!')
const loading = ref(false)

/**
 * 登录处理
 */
const handleLogin = async () => {
  if (!account.value || !password.value) {
    alert('请输入账号和密码')
    return
  }

  loading.value = true

  try {
    const response = await api.post<LoginResponse>('/auth/login', {
      account: account.value,
      password: password.value,
      clientType: 'mobile',
    })

    // 保存认证信息
    authStore.setAuth(response.user, response.tokens.accessToken, response.tokens.refreshToken)

    // 跳转到首页
    router.push('/index')

  } catch (error: any) {
    alert(error.message || '登录失败，请检查账号密码')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  padding: 120px 20px 20px;
  background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
}

.header {
  text-align: center;
  margin-bottom: 60px;
}

.logo {
  width: 80px;
  height: 80px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 30px;
  backdrop-filter: blur(10px);
}

.logo-text {
  color: #fff;
  font-size: 40px;
  font-weight: bold;
}

.title {
  font-size: 36px;
  font-weight: bold;
  color: #fff;
  margin-bottom: 12px;
}

.subtitle {
  font-size: 16px;
  color: rgba(255, 255, 255, 0.8);
}

.form {
  background: #fff;
  border-radius: 20px;
  padding: 30px 20px;
}

.form-item {
  margin-bottom: 24px;
}

.form-item:last-of-type {
  margin-bottom: 30px;
}

.label {
  display: block;
  font-size: 14px;
  color: #374151;
  margin-bottom: 8px;
  font-weight: 500;
}

.input {
  width: 100%;
  height: 48px;
  background: #F3F4F6;
  border-radius: 10px;
  padding: 0 16px;
  font-size: 16px;
  color: #1F2937;
  border: none;
  outline: none;
}

.input::placeholder {
  color: #9CA3AF;
}

.login-btn {
  width: 100%;
  height: 48px;
  background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 16px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: opacity 0.2s;
}

.login-btn:hover {
  opacity: 0.9;
}

.login-btn.loading {
  opacity: 0.7;
}

.spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  margin-right: 8px;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.tips {
  margin-top: 20px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.tips-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.tips-text {
  font-size: 13px;
  color: #fff;
  font-family: monospace;
}
</style>
