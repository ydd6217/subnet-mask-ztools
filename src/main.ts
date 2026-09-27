import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

/** ZTools 宿主通过 preload 注入的全局 API，浏览器直接打开页面时为 undefined */
const ztools = (window as any).ztools

createApp(App).mount('#app')

// 指令进入时把 code 与 payload 转成组件事件，用于切换标签页并预填输入
if (ztools?.onPluginEnter) {
  ztools.onPluginEnter((action: { code?: string; payload?: unknown }) => {
    window.dispatchEvent(new CustomEvent('ztools:enter', { detail: action }))
  })
}
