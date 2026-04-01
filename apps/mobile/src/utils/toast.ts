/**
 * 移动端统一提示封装
 *
 * 优先使用 uni-app 的 showToast，保持 H5 和未来小程序端一致；
 * 如果当前运行环境没有 uni 对象，再降级到浏览器 alert，避免提示直接丢失。
 */
export function showToast(title: string) {
  const uniApi = (globalThis as { uni?: { showToast?: (options: Record<string, unknown>) => void } }).uni

  if (uniApi?.showToast) {
    uniApi.showToast({
      title,
      icon: 'none',
      duration: 2200,
    })
    return
  }

  window.alert(title)
}
