import asar from '@electron/asar'
import fs from 'node:fs'
import path from 'node:path'
import { createBrotliCompress } from 'node:zlib'
import { constants as zlibConstants } from 'node:zlib'
import { pipeline } from 'node:stream/promises'
import { ReadStream, WriteStream } from 'node:fs'

const root = path.resolve(import.meta.dirname, '..')
const config = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'))
const distDir = path.join(root, 'dist')
const zpxPath = path.join(root, `${config.name}-${config.version}.zpx`)
const tempAsar = path.join(root, '.tmp-plugin.asar')

if (!fs.existsSync(path.join(distDir, 'plugin.json'))) {
  throw new Error('dist/ 尚未构建，请先执行 npm run build')
}

// ZTools 的 packZpx 格式：标准 asar 整体再走 brotli 压缩
await asar.createPackage(distDir, tempAsar)
await pipeline(
  new ReadStream(tempAsar),
  createBrotliCompress({ params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 } }),
  new WriteStream(zpxPath)
)
fs.rmSync(tempAsar)
console.log(`已打包 ${path.relative(root, zpxPath)} (${fs.statSync(zpxPath).size} 字节)`)
