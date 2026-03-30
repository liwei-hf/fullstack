/**
 * Toast 提示 Hook
 *
 * 基于 react-hot-toast 灵感实现的 Toast 消息提示系统
 * 使用 React Context + Reducer 模式管理全局 Toast 状态
 *
 * 核心功能：
 * - 添加 Toast：toast({ title, description, variant })
 * - 关闭 Toast：toast.dismiss(id)
 * - 更新 Toast：toast.update(id, props)
 *
 * 使用示例：
 * ```ts
 * const { toast } = useToast();
 *
 * // 成功提示
 * toast({ title: '操作成功' });
 *
 * // 错误提示
 * toast({
 *   title: '操作失败',
 *   description: '请检查网络连接',
 *   variant: 'destructive',
 * });
 * ```
 *
 * 配合 Toaster 组件使用：
 * 在应用根组件中渲染 <Toaster /> 即可
 */
"use client"

import * as React from "react"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

/**
 * 同时显示的最大 Toast 数量
 */
const TOAST_LIMIT = 1

/**
 * Toast 自动关闭延迟（毫秒）
 * 1000000ms = 1000 秒，实际上基本等于不自动关闭
 */
const TOAST_REMOVE_DELAY = 1000000

/**
 * Toast 类型定义
 */
type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

/**
 * Action 类型枚举
 */
const actionTypes = {
  ADD_TOAST: "ADD_TOAST",       // 添加 Toast
  UPDATE_TOAST: "UPDATE_TOAST", // 更新 Toast
  DISMISS_TOAST: "DISMISS_TOAST", // 关闭 Toast
  REMOVE_TOAST: "REMOVE_TOAST", // 移除 Toast
} as const

let count = 0

/**
 * 生成唯一 ID
 * 使用累加器方式生成，简单高效
 */
function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

/**
 * Action 联合类型
 */
type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

/**
 * 状态接口
 */
interface State {
  toasts: ToasterToast[]
}

/**
 * Toast 超时映射表
 * 用于管理每个 Toast 的自动关闭定时器
 */
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

/**
 * 将 Toast ID 添加到移除队列
 * 设置定时器，在指定时间后自动移除 Toast
 */
const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

/**
 * Reducer 函数
 *
 * 处理 Toast 状态变更：
 * - ADD_TOAST：添加新 Toast 到列表顶部
 * - UPDATE_TOAST：更新指定 Toast 的属性
 * - DISMISS_TOAST：关闭 Toast（设置 open=false）
 * - REMOVE_TOAST：从列表中移除 Toast
 */
export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      // 添加到列表顶部，并限制数量
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      // 更新指定 ID 的 Toast
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // 如果指定了 ID，只关闭该 Toast；否则关闭所有
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      // 从列表中移除指定 ID 的 Toast
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

/**
 * 监听器列表
 * 当状态变化时通知所有订阅者
 */
const listeners: Array<(state: State) => void> = []

/**
 * 内存状态
 */
let memoryState: State = { toasts: [] }

/**
 * Dispatch 函数
 * 更新状态并通知所有监听器
 */
function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

/**
 * Toast 配置类型（不包含 ID）
 */
type Toast = Omit<ToasterToast, "id">

/**
 * 创建 Toast 提示
 *
 * @returns 返回 Toast 控制对象 { id, dismiss, update }
 */
function toast({ ...props }: Toast) {
  const id = genId()

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

/**
 * useToast Hook
 *
 * 订阅 Toast 状态并提供 toast() 方法
 *
 * @returns 返回当前状态和 toast、dismiss 方法
 */
function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }
