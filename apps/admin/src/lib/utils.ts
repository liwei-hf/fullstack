/**
 * 工具函数
 *
 * cn() - 合并className 工具
 * 结合 clsx 和 tailwind-merge，智能合并 Tailwind CSS 类名
 *
 * 使用场景：
 * 当需要动态组合多个 className，且可能有冲突的 Tailwind 类时使用
 *
 * 示例：
 * ```ts
 * cn('bg-red-500', 'bg-blue-500') // => 'bg-blue-500' (后者覆盖前者)
 * cn('px-4 py-2', 'px-6') // => 'py-2 px-6' (px-6 覆盖 px-4)
 * cn('btn', className, variant === 'primary' && 'bg-blue-500')
 * ```
 *
 * 依赖：
 * - clsx：条件合并 className
 * - tailwind-merge：智能去重 Tailwind 类，避免样式冲突
 */
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * 合并 className 工具函数
 *
 * @param inputs - 可变数量的 className 值（字符串、对象、数组等）
 * @returns 合并后的 className 字符串
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
