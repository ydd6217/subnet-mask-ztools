import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import path from 'node:path'

export default defineConfig({
  // ZTools 以 file:// 加载插件包内的 index.html，资源必须用相对路径
  base: './',
  // plugin.json 与 logo.png 在根目录维护，由 scripts/postbuild.mjs 复制进 dist
  publicDir: false,
  plugins: [vue()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') }
  },
  server: {
    port: 5180,
    // plugin.json 的 development.main 写死了 5180，端口被占时要直接失败而不是换端口
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
