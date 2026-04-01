<template>
  <div class="login-page">
    <div class="login-shell">
      <div class="brand-row">
        <div class="brand-mark">AI</div>
        <div>
          <p class="brand-label">移动端助手</p>
          <h1 class="brand-title">欢迎回来</h1>
        </div>
      </div>

      <p class="brand-subtitle">输入账号密码，继续使用智能问数和文档问答。</p>

      <div class="form-card">
        <label class="field-item">
          <span class="field-label">账号</span>
          <input
            v-model="account"
            class="field-input"
            placeholder="用户名或手机号"
          />
        </label>

        <label class="field-item">
          <span class="field-label">密码</span>
          <input
            v-model="password"
            class="field-input"
            type="password"
            placeholder="请输入密码"
          />
        </label>

        <button
          class="login-btn"
          :class="{ 'login-btn-loading': loading }"
          :disabled="loading"
          @click="handleLogin"
        >
          <span v-if="loading" class="spinner" />
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </div>

      <p class="tips-line">
        测试账号：
        <span class="tips-strong">admin</span>
        /
        <span class="tips-strong">Admin123456!</span>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth-store'
import { api } from '@/utils/request'
import { showToast } from '@/utils/toast'

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
 * 登录页改成更轻的 ChatGPT 风格后，仍然保持最短登录主链路，避免为了样式把动作路径做复杂。
 */
const handleLogin = async () => {
  if (!account.value || !password.value) {
    showToast('请输入账号和密码')
    return
  }

  loading.value = true

  try {
    const response = await api.post<LoginResponse>('/auth/login', {
      account: account.value,
      password: password.value,
      clientType: 'mobile',
    })

    authStore.setAuth(response.user, response.tokens.accessToken, response.tokens.refreshToken)
    router.push('/index')
  } catch (error: any) {
    showToast(error.message || '登录失败，请检查账号密码')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  padding: 28px 18px 24px;
  background:
    radial-gradient(circle at top left, rgba(111, 162, 255, 0.28), transparent 30%),
    radial-gradient(circle at bottom right, rgba(165, 199, 255, 0.34), transparent 24%),
    linear-gradient(180deg, #edf3ff 0%, #f6f8ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-shell {
  width: min(100%, 360px);
  padding: 14px;
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.48);
  box-shadow: 0 24px 56px rgba(78, 108, 171, 0.14);
  backdrop-filter: blur(18px);
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 24px 20px 0;
}

.brand-mark {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: linear-gradient(180deg, #5e8ef7 0%, #4b77ed 100%);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.04em;
  box-shadow: 0 12px 24px rgba(79, 121, 238, 0.24);
}

.brand-label {
  margin: 0 0 4px;
  font-size: 12px;
  color: #8ea2cf;
}

.brand-title {
  margin: 0;
  font-size: 30px;
  font-weight: 700;
  color: #20304f;
}

.brand-subtitle {
  margin: 12px 0 22px;
  padding: 0 20px;
  font-size: 14px;
  line-height: 1.7;
  color: #7182a4;
}

.form-card {
  border: 1px solid rgba(226, 232, 240, 0.82);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 16px 34px rgba(105, 124, 166, 0.1);
  padding: 18px;
  margin: 0 6px;
}

.field-item + .field-item {
  margin-top: 14px;
}

.field-label {
  display: block;
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
}

.field-input {
  width: 100%;
  height: 46px;
  border: 1px solid rgba(219, 227, 240, 0.9);
  border-radius: 14px;
  background: #f8faff;
  padding: 0 14px;
  font-size: 15px;
  color: #111827;
  outline: none;
}

.field-input::placeholder {
  color: #9ca3af;
}

.login-btn {
  width: 100%;
  height: 46px;
  margin-top: 18px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(180deg, #5f90f8 0%, #4b77ed 100%);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  box-shadow: 0 12px 24px rgba(79, 121, 238, 0.22);
}

.login-btn-loading {
  opacity: 0.86;
}

.spinner {
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.tips-line {
  margin: 14px 0 0;
  text-align: center;
  font-size: 12px;
  color: #8ea2bf;
}

.tips-strong {
  font-weight: 700;
  color: #5b6f94;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
