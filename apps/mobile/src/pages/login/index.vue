<template>
  <view class="login-page">
    <view class="login-shell">
      <view class="brand-row">
        <view class="brand-mark">AI</view>
        <view>
          <text class="brand-label">移动端助手</text>
          <text class="brand-title">欢迎回来</text>
        </view>
      </view>

      <text class="brand-subtitle">输入账号密码，继续使用智能问数和文档问答。</text>

      <view class="form-card">
        <view class="field-item">
          <text class="field-label">账号</text>
          <input
            v-model="account"
            class="field-input"
            placeholder="用户名或手机号"
            placeholder-class="field-placeholder"
            confirm-type="next"
          />
        </view>

        <view class="field-item">
          <text class="field-label">密码</text>
          <view class="password-field">
            <input
              v-model="password"
              class="field-input field-input-with-action"
              :password="!showPassword"
              placeholder="请输入密码"
              placeholder-class="field-placeholder"
              confirm-type="done"
              @confirm="handleLogin"
            />
            <button
              class="password-toggle"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              <svg v-if="showPassword" viewBox="0 0 24 24" aria-hidden="true" class="password-toggle-icon">
                <path
                  d="M3 3l18 18"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
                <path
                  d="M10.58 10.58a2 2 0 0 0 2.83 2.83"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
                <path
                  d="M9.88 5.09A10.94 10.94 0 0 1 12 4.9c5.05 0 8.27 3.45 9.32 5.1-.48.76-1.4 2-2.77 3.13"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
                <path
                  d="M6.61 6.61C4.96 7.74 3.84 9.11 3 10c1.05 1.65 4.27 5.1 9.32 5.1 1.61 0 3.04-.34 4.3-.87"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
              </svg>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true" class="password-toggle-icon">
                <path
                  d="M2.3 12S6 5.7 12 5.7 21.7 12 21.7 12 18 18.3 12 18.3 2.3 12 2.3 12Z"
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="1.8"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="3"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                />
              </svg>
            </button>
          </view>
        </view>

        <button
          class="login-btn"
          :class="{ 'login-btn-loading': loading }"
          :disabled="loading"
          @click="handleLogin"
        >
          <view v-if="loading" class="spinner" />
          <text>{{ loading ? '登录中...' : '登录' }}</text>
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useAuthStore } from '@/store/auth-store'
import { ensureAuthenticated } from '@/utils/auth'
import { MOBILE_PAGES, reLaunchTo } from '@/utils/navigation'
import { api } from '@/utils/request'
import { showToast } from '@/utils/toast'

const authStore = useAuthStore()
const account = ref('admin')
const password = ref('')
const loading = ref(false)
const showPassword = ref(false)

onShow(() => {
  if (ensureAuthenticated()) {
    reLaunchTo(MOBILE_PAGES.home)
  }
})

const handleLogin = async () => {
  if (!account.value || !password.value) {
    showToast('请输入账号和密码')
    return
  }

  loading.value = true

  try {
    const response = await api.loginMobile(account.value, password.value)
    authStore.setAuth(response.user, response.tokens.accessToken, response.tokens.refreshToken)
    reLaunchTo(MOBILE_PAGES.home)
  } catch (error) {
    showToast(error instanceof Error ? error.message : '登录失败，请检查账号密码')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
button {
  box-sizing: border-box;
  font-family: inherit;
}

button::after {
  border: none;
}

.login-page {
  box-sizing: border-box;
  min-height: 100vh;
  min-height: 100svh;
  min-height: 100dvh;
  padding: calc(18px + env(safe-area-inset-top)) 16px calc(18px + env(safe-area-inset-bottom));
  background:
    radial-gradient(circle at top left, rgba(111, 162, 255, 0.28), transparent 30%),
    radial-gradient(circle at bottom right, rgba(165, 199, 255, 0.34), transparent 24%),
    linear-gradient(180deg, #edf3ff 0%, #f6f8ff 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-shell {
  width: 100%;
  max-width: 360px;
  padding: 12px;
  border-radius: 30px;
  background: rgba(255, 255, 255, 0.48);
  box-shadow: 0 24px 56px rgba(78, 108, 171, 0.14);
  backdrop-filter: blur(18px);
}

.brand-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 22px 18px 0;
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

.brand-label,
.brand-title,
.brand-subtitle,
.field-label {
  display: block;
}

.brand-label {
  margin-bottom: 4px;
  font-size: 12px;
  color: #8ea2cf;
}

.brand-title {
  font-size: 28px;
  font-weight: 700;
  color: #20304f;
}

.brand-subtitle {
  margin: 10px 0 18px;
  padding: 0 18px;
  font-size: 14px;
  line-height: 1.6;
  color: #7182a4;
}

.form-card {
  border: 1px solid rgba(226, 232, 240, 0.82);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 16px 34px rgba(105, 124, 166, 0.1);
  padding: 16px;
  margin: 0 6px;
}

.field-item + .field-item {
  margin-top: 14px;
}

.field-label {
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

.field-placeholder {
  color: #9ca3af;
}

.password-field {
  position: relative;
}

.field-input-with-action {
  padding-right: 56px;
}

.password-toggle {
  appearance: none;
  position: absolute;
  top: 50%;
  right: 14px;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  padding: 0;
  margin: 0;
  line-height: 1;
  color: #5f90f8;
}

.password-toggle-icon {
  width: 18px;
  height: 18px;
}

.login-btn {
  appearance: none;
  margin-left: 0;
  margin-right: 0;
  line-height: 1;
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

@media (max-width: 390px), (max-height: 780px) {
  .login-page {
    padding: calc(14px + env(safe-area-inset-top)) 14px calc(14px + env(safe-area-inset-bottom));
  }

  .login-shell {
    width: 100%;
    padding: 10px;
    border-radius: 24px;
  }

  .brand-row {
    gap: 12px;
    padding: 18px 16px 0;
  }

  .brand-mark {
    width: 46px;
    height: 46px;
    border-radius: 14px;
    font-size: 15px;
  }

  .brand-label {
    margin-bottom: 2px;
  }

  .brand-title {
    font-size: 24px;
  }

  .brand-subtitle {
    margin: 8px 0 16px;
    padding: 0 16px;
    font-size: 13px;
    line-height: 1.5;
  }

  .form-card {
    border-radius: 20px;
    padding: 14px;
    margin: 0 4px;
  }

  .field-item + .field-item {
    margin-top: 12px;
  }

  .field-input,
  .login-btn {
    height: 44px;
    font-size: 14px;
  }

  .login-btn {
    margin-top: 16px;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
