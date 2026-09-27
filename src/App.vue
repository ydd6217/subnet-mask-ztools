<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  calcSubnet,
  convertMask,
  parseEntry,
  planSubnets,
  reverseMask,
  type MaskConvertResult,
  type ReverseMaskResult,
  type SubnetPlan,
  type SubnetResult
} from '@/utils/subnet'

type TabKey = 'calc' | 'subnet-plan' | 'mask-convert' | 'reverse-mask'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'calc', label: '子网计算' },
  { key: 'subnet-plan', label: '网络与 IP' },
  { key: 'mask-convert', label: '掩码互转' },
  { key: 'reverse-mask', label: '主机数反推' }
]

const tab = ref<TabKey>('calc')

// ── 子网计算 ──
const ipInput = ref('192.168.1.100')
const maskInput = ref('255.255.255.0')

const calcError = ref('')
const calcResult = computed<SubnetResult | null>(() => {
  calcError.value = ''
  try {
    return calcSubnet(ipInput.value, maskInput.value)
  } catch (e) {
    calcError.value = (e as Error).message
    return null
  }
})

// ── 网络与 IP 计算器 ──
const planIp = ref('192.168.1.100')
const planClassMode = ref<'auto' | 'A' | 'B' | 'C'>('auto')
const planSubnetCount = ref('6')
const planMask = ref('')

const planError = ref('')
const planResult = computed<SubnetPlan | null>(() => {
  planError.value = ''
  try {
    return planSubnets(planIp.value, {
      classMode: planClassMode.value,
      subnets: planSubnetCount.value.trim() ? Number(planSubnetCount.value) : undefined,
      maskOrCidr: planMask.value.trim() || undefined
    })
  } catch (e) {
    planError.value = (e as Error).message
    return null
  }
})

const PLAN_MODE_LABEL: Record<SubnetPlan['mode'], string> = {
  subnet: '子网划分',
  supernet: '超网汇总',
  natural: '自然掩码（未划分）'
}

/** 网络列表表头说明 */
const planSummary = computed(() => {
  const result = planResult.value
  if (!result) return ''
  const unit = result.mode === 'supernet' ? '自然网段' : '子网'
  const head = `共 ${result.blockCount.toLocaleString()} 个${unit}`
  const first = result.rows[0]
  if (!first) return head
  const last = result.rows[result.rows.length - 1]
  const hidden = result.hiddenRows ? `（其余 ${result.hiddenRows.toLocaleString()} 个未列出）` : ''
  return `${head}，显示第 ${first.index + 1}–${last.index + 1} 个${hidden}，输入 IP 为第 ${result.targetIndex + 1} 个`
})

/** 子网数量只能按 2 的幂向上取整，实际网段多于填写值时给出说明 */
const planRoundedNote = computed(() => {
  const result = planResult.value
  const requested = Number(planSubnetCount.value)
  if (!result || planMask.value.trim() || !Number.isFinite(requested)) return ''
  return result.blockCount > requested
    ? `子网数量按 2 的幂向上取整，实际划分 ${result.blockCount.toLocaleString()} 个。`
    : ''
})

// ── 掩码互转 ──
const convertInput = ref('255.255.255.0')

const convertError = ref('')
const convertResult = computed<MaskConvertResult | null>(() => {
  convertError.value = ''
  try {
    return convertMask(convertInput.value)
  } catch (e) {
    convertError.value = (e as Error).message
    return null
  }
})

// ── 主机数反推 ──
const hostInput = ref('100')

const reverseError = ref('')
const reverseResult = computed<ReverseMaskResult | null>(() => {
  reverseError.value = ''
  try {
    return reverseMask(Number(hostInput.value))
  } catch (e) {
    reverseError.value = (e as Error).message
    return null
  }
})

/** 复制结果：优先走宿主 API，浏览器里退回剪贴板接口 */
async function copyText(text: string) {
  const ztools = (window as any).ztools
  if (ztools?.copyText) {
    ztools.copyText(text)
    return
  }
  await navigator.clipboard.writeText(text)
}

/** 指令进入：按 feature code 切页，按 payload 预填输入 */
function onEnter(event: Event) {
  const detail = (event as CustomEvent).detail as { code?: string; payload?: unknown }
  const code = detail.code
  if (code === 'mask-convert' || code === 'reverse-mask') tab.value = code

  const payload = detail.payload
  if (typeof payload !== 'string' || !payload.trim()) return

  const parsed = parseEntry(payload)
  if (!parsed) return
  if (parsed.kind === 'mask') {
    // 单独一个掩码或 /n 时进互转页，避免把主机地址当成 IP
    convertInput.value = parsed.mask
    tab.value = 'mask-convert'
  } else if (code === 'subnet-plan') {
    planIp.value = parsed.ip
    planMask.value = parsed.mask
    tab.value = 'subnet-plan'
  } else {
    ipInput.value = parsed.ip
    maskInput.value = parsed.mask
    tab.value = 'calc'
  }
}

onMounted(() => window.addEventListener('ztools:enter', onEnter))
onUnmounted(() => window.removeEventListener('ztools:enter', onEnter))
</script>

<template>
  <div class="app">
    <div class="tabs">
      <button
        v-for="item in TABS"
        :key="item.key"
        class="tab"
        :class="{ active: tab === item.key }"
        @click="tab = item.key"
      >
        {{ item.label }}
      </button>
    </div>

    <!-- 子网计算 -->
    <section v-if="tab === 'calc'" class="panel">
      <div class="fields">
        <label class="field">
          <span class="field-label">IP 地址</span>
          <input v-model="ipInput" class="input mono" placeholder="192.168.1.100" spellcheck="false" />
        </label>
        <label class="field">
          <span class="field-label">子网掩码</span>
          <input v-model="maskInput" class="input mono" placeholder="255.255.255.0 或 /24" spellcheck="false" />
        </label>
      </div>

      <p v-if="calcError" class="error">{{ calcError }}</p>

      <template v-if="calcResult">
        <div class="rows">
          <div class="row hero">
            <span class="k">网络地址</span>
            <span class="v" :title="calcResult.network">{{ calcResult.network }}</span>
            <button class="copy" @click="copyText(calcResult.network)">复制</button>
          </div>
          <div class="row hero">
            <span class="k">广播地址</span>
            <span class="v" :title="calcResult.broadcast">{{ calcResult.broadcast }}</span>
            <button class="copy" @click="copyText(calcResult.broadcast)">复制</button>
          </div>
          <div class="row hero">
            <span class="k">可用范围</span>
            <span class="v" :title="calcResult.hostRange">{{ calcResult.hostRange }}</span>
            <button class="copy" @click="copyText(calcResult.hostRange)">复制</button>
          </div>
        </div>

        <div class="meta">
          <div class="cell">
            <span class="k">CIDR</span>
            <span class="v mono">{{ calcResult.ip }}/{{ calcResult.cidr }}</span>
          </div>
          <div class="cell"><span class="k">可用主机数</span><span class="v">{{ calcResult.hostCount.toLocaleString() }}</span></div>
          <div class="cell"><span class="k">子网大小</span><span class="v">{{ calcResult.subnetSize.toLocaleString() }}</span></div>
          <div class="cell"><span class="k">主机位</span><span class="v">{{ calcResult.hostBits }} 位</span></div>
          <div class="cell">
            <span class="k">子网掩码</span>
            <span class="v mono">{{ calcResult.mask }}</span>
          </div>
          <div class="cell"><span class="k">掩码十六进制</span><span class="v mono">{{ calcResult.maskHex }}</span></div>
        </div>
      </template>
    </section>

    <!-- 网络与 IP 计算器 -->
    <section v-else-if="tab === 'subnet-plan'" class="panel">
      <div class="fields">
        <label class="field">
          <span class="field-label">IP 地址</span>
          <input v-model="planIp" class="input mono" placeholder="192.168.1.100" spellcheck="false" />
        </label>
        <label class="field">
          <span class="field-label">网络类型</span>
          <select v-model="planClassMode" class="input">
            <option value="auto">默认</option>
            <option value="A">A 类 /8</option>
            <option value="B">B 类 /16</option>
            <option value="C">C 类 /24</option>
          </select>
        </label>
        <label class="field">
          <span class="field-label">子网数量</span>
          <input v-model="planSubnetCount" class="input mono" placeholder="需要划分几个子网" spellcheck="false" />
        </label>
        <label class="field">
          <span class="field-label">指定掩码</span>
          <input v-model="planMask" class="input mono" placeholder="填了则优先于子网数量" spellcheck="false" />
        </label>
      </div>

      <p v-if="planError" class="error">{{ planError }}</p>

      <template v-if="planResult">
        <div class="rows">
          <div class="row hero">
            <span class="k">子网掩码</span>
            <span class="v" :title="planResult.mask">{{ planResult.mask }}</span>
            <button class="copy" @click="copyText(planResult.mask)">复制</button>
          </div>
          <div class="row hero">
            <span class="k">当前网段</span>
            <span class="v">{{ planResult.targetNetwork }}/{{ planResult.cidr }}</span>
            <button class="copy" @click="copyText(planResult.targetNetwork + '/' + planResult.cidr)">
              复制
            </button>
          </div>
          <div class="row hero">
            <span class="k">可用范围</span>
            <span class="v">{{ planResult.targetFirst }} ~ {{ planResult.targetLast }}</span>
            <button
              class="copy"
              @click="copyText(planResult.targetFirst + ' ~ ' + planResult.targetLast)"
            >
              复制
            </button>
          </div>
          <div class="row hero">
            <span class="k">广播地址</span>
            <span class="v">{{ planResult.targetBroadcast }}</span>
            <button class="copy" @click="copyText(planResult.targetBroadcast)">复制</button>
          </div>
        </div>

        <div class="meta">
          <div class="cell"><span class="k">网络类别</span><span class="v">{{ planResult.classLabel }}</span></div>
          <div class="cell"><span class="k">计算方式</span><span class="v">{{ PLAN_MODE_LABEL[planResult.mode] }}</span></div>
          <div class="cell"><span class="k">自然掩码</span><span class="v mono">/{{ planResult.naturalCidr }}</span></div>
          <div class="cell"><span class="k">借位</span><span class="v">{{ planResult.borrowBits }} 位</span></div>
          <div class="cell"><span class="k">网段数量</span><span class="v">{{ planResult.blockCount.toLocaleString() }}</span></div>
          <div class="cell"><span class="k">每段主机数</span><span class="v">{{ planResult.hostsPerBlock.toLocaleString() }}</span></div>
          <div class="cell"><span class="k">反掩码</span><span class="v mono">{{ planResult.wildcard }}</span></div>
          <div class="cell"><span class="k">每段地址数</span><span class="v">{{ planResult.blockSize.toLocaleString() }}</span></div>
        </div>

        <p v-if="planResult.note" class="hint">{{ planResult.note }}</p>
        <p v-if="planRoundedNote" class="hint">{{ planRoundedNote }}</p>

        <div class="table-head">
          <span class="table-title">网络列表</span>
          <span class="table-meta">{{ planSummary }}</span>
        </div>
        <div class="table-scroll">
          <table class="subnet-table">
            <colgroup>
              <col class="col-index" />
              <col /><col /><col /><col />
            </colgroup>
            <thead>
              <tr>
                <th>#</th>
                <th>网络</th>
                <th>起始</th>
                <th>结束</th>
                <th>广播</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in planResult.rows" :key="row.index" :class="{ 'is-target': row.isTarget }">
                <td class="idx">{{ row.index + 1 }}</td>
                <td>{{ row.network }}/{{ row.cidr }}</td>
                <td>{{ row.first }}</td>
                <td>{{ row.last }}</td>
                <td>{{ row.broadcast }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </section>

    <!-- 掩码互转 -->
    <section v-else-if="tab === 'mask-convert'" class="panel">
      <div class="fields">
        <label class="field wide">
          <span class="field-label">点分十进制掩码或 /n</span>
          <input v-model="convertInput" class="input mono" placeholder="255.255.255.0 或 /24" spellcheck="false" />
        </label>
      </div>

      <p v-if="convertError" class="error">{{ convertError }}</p>

      <div v-if="convertResult" class="rows">
        <div class="row hero">
          <span class="k">点分十进制</span>
          <span class="v">{{ convertResult.mask }}</span>
          <button class="copy" @click="copyText(convertResult.mask)">复制</button>
        </div>
        <div class="row hero">
          <span class="k">CIDR</span>
          <span class="v">/{{ convertResult.cidr }}</span>
          <button class="copy" @click="copyText('/' + convertResult.cidr)">复制</button>
        </div>
        <div class="row hero">
          <span class="k">十六进制</span>
          <span class="v">{{ convertResult.maskHex }}</span>
          <button class="copy" @click="copyText(convertResult.maskHex)">复制</button>
        </div>
      </div>
    </section>

    <!-- 主机数反推 -->
    <section v-else class="panel">
      <div class="fields">
        <label class="field wide">
          <span class="field-label">所需可用主机数</span>
          <input v-model="hostInput" class="input mono" placeholder="100" spellcheck="false" />
        </label>
      </div>

      <p v-if="reverseError" class="error">{{ reverseError }}</p>

      <div v-if="reverseResult" class="rows">
        <div class="row hero">
          <span class="k">推荐掩码</span>
          <span class="v">{{ reverseResult.mask }}</span>
          <button class="copy" @click="copyText(reverseResult.mask)">复制</button>
        </div>
        <div class="row hero">
          <span class="k">推荐 CIDR</span>
          <span class="v">/{{ reverseResult.cidr }}</span>
          <button class="copy" @click="copyText('/' + reverseResult.cidr)">复制</button>
        </div>
        <div class="meta">
          <div class="cell"><span class="k">子网大小</span><span class="v">{{ reverseResult.subnetSize.toLocaleString() }}</span></div>
          <div class="cell"><span class="k">实际可容纳</span><span class="v">{{ reverseResult.hostCapacity.toLocaleString() }}</span></div>
          <div class="cell"><span class="k">掩码十六进制</span><span class="v mono">{{ reverseResult.maskHex }}</span></div>
          <div class="cell"><span class="k">富余地址</span><span class="v">{{ (reverseResult.hostCapacity - Number(hostInput)).toLocaleString() }}</span></div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.app {
  padding: 14px 16px 18px;
}

/* ── 标签页 ── */
.tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  margin-bottom: 16px;
  background: var(--surface);
  border-radius: 9px;
}

.tab {
  flex: 1;
  padding: 6px 4px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  font-size: 12.5px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}

.tab:hover {
  color: var(--text);
}

.tab.active {
  background: var(--bg);
  color: var(--accent);
  font-weight: 600;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
}

/* ── 输入区 ── */
.panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.field.wide {
  grid-column: 1 / -1;
}

.field-label {
  font-size: 11.5px;
  color: var(--text-muted);
}

.input {
  width: 100%;
  min-width: 0;
  padding: 7px 9px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--bg);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.input::placeholder {
  color: color-mix(in srgb, var(--text-muted) 70%, transparent);
}

.input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

select.input {
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  padding-right: 26px;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23707889' stroke-width='1.6' stroke-linecap='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 9px center;
}

/* ── 结果行 ── */
.rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.row {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.row.hero {
  border: 1px solid var(--border);
  background: var(--bg);
  padding: 9px 10px;
}

.row .k {
  font-size: 12px;
  color: var(--text-muted);
}

.row .v {
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy {
  padding: 3px 8px;
  border: 1px solid var(--border-strong);
  border-radius: 5px;
  background: var(--bg);
  color: var(--text-muted);
  font-size: 11.5px;
  cursor: pointer;
  opacity: 0.45;
  transition: opacity 0.15s, color 0.15s, border-color 0.15s;
}

.row:hover .copy,
.copy:focus-visible,
.copy:hover {
  opacity: 1;
}

.copy:hover {
  color: var(--accent);
  border-color: var(--accent);
}

/* ── 次要指标 ── */
.meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px 14px;
  padding: 12px;
  border-radius: var(--radius);
  background: var(--surface);
}

.cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cell .k {
  font-size: 11.5px;
  color: var(--text-muted);
}

.cell .v {
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

/* ── 提示与错误 ── */
.error {
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--danger) 35%, transparent);
  border-radius: var(--radius-sm);
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 12.5px;
}

.hint {
  color: var(--text-muted);
  font-size: 12px;
}

/* ── 网络列表 ── */
.table-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.table-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text);
}

.table-meta {
  font-size: 11.5px;
  color: var(--text-muted);
}

.table-scroll {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.subnet-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.subnet-table th,
.subnet-table td {
  padding: 5px 8px;
  text-align: left;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.subnet-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  color: var(--text-muted);
  font-family: inherit;
  font-weight: 500;
}

.subnet-table tbody tr + tr td {
  border-top: 1px solid var(--border);
}

.subnet-table tbody tr:hover td {
  background: var(--surface-hover);
}

.subnet-table .idx {
  color: var(--text-muted);
}

.col-index {
  width: 44px;
}

.subnet-table tr.is-target td {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.subnet-table tr.is-target td:first-child {
  box-shadow: inset 2px 0 0 var(--accent);
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
</style>
