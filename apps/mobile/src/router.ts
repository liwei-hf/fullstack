import { createRouter, createWebHashHistory } from 'vue-router'
import { pinia } from '@/store'
import { AUTH_STORAGE_KEY, useAuthStore } from '@/store/auth-store'

const routes = [
  {
    path: '/',
    redirect: '/login',
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/pages/login/index.vue'),
  },
  {
    path: '/index',
    name: 'Index',
    component: () => import('@/pages/index/index.vue'),
  },
  {
    path: '/sql',
    name: 'SqlQuery',
    component: () => import('@/pages/sql/index.vue'),
  },
  {
    path: '/knowledge-base',
    name: 'KnowledgeBaseChat',
    component: () => import('@/pages/knowledge-base/index.vue'),
  },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  if (to.path === '/login') {
    next()
    return
  }

  const authStore = useAuthStore(pinia)
  if (authStore.token) {
    next()
    return
  }

  const authStorage = localStorage.getItem(AUTH_STORAGE_KEY)
  if (!authStorage) {
    next('/login')
    return
  }

  try {
    const parsed = JSON.parse(authStorage)
    if (parsed.token || parsed.state?.token) {
      next()
      return
    }
  } catch {}

  next('/login')
})

export default router
