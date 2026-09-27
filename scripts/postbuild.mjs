import { cpSync } from 'node:fs'

// manifest 与图标只在项目根目录维护一份，构建后复制进 dist 供打包使用
for (const file of ['plugin.json', 'logo.png']) {
  cpSync(new URL(`../${file}`, import.meta.url), new URL(`../dist/${file}`, import.meta.url))
}
