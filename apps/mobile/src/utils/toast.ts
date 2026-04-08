/**
 * 移动端统一提示封装
 *
 * 直接走 uni-app 的提示能力，保证 H5 / 小程序 / App 端行为尽量一致。
 */
export function showToast(title: string) {
  uni.showToast({
    title,
    icon: 'none',
    duration: 2200,
  })
}
