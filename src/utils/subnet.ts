/**
 * 子网掩码计算核心逻辑：全部基于 32 位整数运算，无网络依赖。
 */

/** 子网计算结果 */
export interface SubnetResult {
  ip: string
  network: string
  broadcast: string
  hostRange: string
  hostCount: number
  subnetSize: number
  mask: string
  cidr: number
  maskHex: string
  /** 主机位数量，等于 32 - cidr */
  hostBits: number
}

/** 掩码格式互转结果 */
export interface MaskConvertResult {
  mask: string
  cidr: number
  maskHex: string
}

/** 按主机数反推掩码结果 */
export interface ReverseMaskResult {
  subnetSize: number
  hostCapacity: number
  cidr: number
  mask: string
  maskHex: string
}

/**
 * 解析点分十进制 IP 或掩码为 32 位无符号整数。
 * @throws 段数不为 4、含非数字段或段值超出 0-255 时抛出
 */
export function parseIP(input: string): number {
  const parts = input.trim().split('.')
  if (parts.length !== 4) throw new Error('IP 地址必须为 4 段点分十进制')
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) throw new Error('IP 地址格式不合法')
    const n = Number(part)
    if (n > 255) throw new Error('IP 地址每段取值范围为 0-255')
    value = (value << 8) | n
  }
  return value >>> 0
}

/** 将 32 位无符号整数还原为点分十进制字符串 */
export function intToIP(value: number): string {
  return [
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff
  ].join('.')
}

/**
 * 由 CIDR 前缀长度生成点分十进制掩码。
 * @throws cidr 不是 0-32 的整数时抛出
 */
export function cidrToMask(cidr: number): string {
  return intToIP(cidrToMaskInt(cidr))
}

/**
 * 校验掩码合法性（1 位必须连续）并返回其整数值与前缀长度。
 * @throws 掩码格式不合法或 1 位不连续时抛出
 */
export function parseMask(mask: string): { value: number; cidr: number } {
  const value = parseIP(mask)
  let cidr = 0
  let seenZero = false
  for (let i = 0; i < 32; i++) {
    const bit = (value >>> (31 - i)) & 1
    if (bit === 1) {
      if (seenZero) throw new Error('掩码不合法：1 位必须连续')
      cidr++
    } else {
      seenZero = true
    }
  }
  return { value, cidr }
}

/** 点分十进制掩码 → CIDR 前缀长度 */
export function maskToCidr(mask: string): number {
  return parseMask(mask).cidr
}

/** 点分十进制掩码 → 大写十六进制，形如 0xFFFFFF00 */
export function toMaskHex(mask: string): string {
  return '0x' + parseIP(mask).toString(16).toUpperCase().padStart(8, '0')
}

/**
 * 掩码三格式互转：接受点分十进制掩码或 /n 形式 CIDR。
 * @throws 输入既不是合法点分掩码也不是合法 /n 时抛出
 */
export function convertMask(input: string): MaskConvertResult {
  const cidr = resolveCidr(input)
  const mask = cidrToMask(cidr)
  return { mask, cidr, maskHex: toMaskHex(mask) }
}

/**
 * 计算子网信息。
 * @param ip 点分十进制 IP
 * @param maskOrCidr 点分十进制掩码或 /n 形式 CIDR
 */
export function calcSubnet(ip: string, maskOrCidr: string): SubnetResult {
  const ipInt = parseIP(ip)
  const cidr = resolveCidr(maskOrCidr)
  const maskInt = cidrToMaskInt(cidr)
  const network = ipInt & maskInt
  const broadcast = (network | (~maskInt >>> 0)) >>> 0
  // /0 子网含 2^32 个地址，超出 32 位范围，必须用 2 ** n 而不是 1 << n
  const subnetSize = 2 ** (32 - cidr)
  const mask = intToIP(maskInt)
  return {
    ip: intToIP(ipInt),
    network: intToIP(network),
    broadcast: intToIP(broadcast),
    hostRange: formatHostRange(cidr, network, broadcast),
    hostCount: cidr >= 31 ? (cidr === 32 ? 1 : 2) : Math.max(subnetSize - 2, 0),
    subnetSize,
    mask,
    cidr,
    maskHex: toMaskHex(mask),
    hostBits: 32 - cidr
  }
}

/**
 * 按所需可用主机数反推最小掩码，子网大小向上取 2 的幂。
 * @throws hosts 不是正整数或超出 /2 子网容量时抛出
 */
export function reverseMask(hosts: number): ReverseMaskResult {
  if (!Number.isInteger(hosts) || hosts < 1) throw new Error('主机数必须为正整数')
  // 子网需容纳 hosts 台主机 + 网络地址 + 广播地址
  let subnetSize = 4
  while (subnetSize < hosts + 2) {
    subnetSize *= 2
    if (subnetSize > 2 ** 30) throw new Error('所需主机数超出 /2 子网可容纳范围')
  }
  const cidr = 32 - Math.log2(subnetSize)
  const mask = cidrToMask(cidr)
  return {
    subnetSize,
    hostCapacity: subnetSize - 2,
    cidr,
    mask,
    maskHex: toMaskHex(mask)
  }
}

/**
 * 可用主机范围：/32 只有自身，/31 是点对点链路（RFC 3021 不扣网络与广播地址），其余为首个~最后一个可用地址。
 */
function formatHostRange(cidr: number, network: number, broadcast: number): string {
  const { first, last } = usableRange(cidr, network, broadcast)
  return first === last ? first : `${first} ~ ${last}`
}

/** 可用主机起止地址（含 /31、/32 的特例） */
function usableRange(cidr: number, network: number, broadcast: number): { first: string; last: string } {
  if (cidr === 32) return { first: intToIP(network), last: intToIP(network) }
  if (cidr === 31) return { first: intToIP(network), last: intToIP(broadcast) }
  return { first: intToIP(network + 1), last: intToIP(broadcast - 1) }
}

/**
 * 解析掩码表达式（`/24`、`255.255.255.0`）为 CIDR 前缀长度。
 * @throws 既不是合法点分掩码也不是合法 /n 时抛出
 */
export function resolveCidr(maskOrCidr: string): number {
  const text = maskOrCidr.trim()
  if (text.startsWith('/')) {
    const cidr = Number(text.slice(1))
    assertCidr(cidr)
    return cidr
  }
  return parseMask(text).cidr
}

/** 由 CIDR 得到 32 位无符号掩码整数 */
function cidrToMaskInt(cidr: number): number {
  assertCidr(cidr)
  return cidr === 0 ? 0 : (~0 << (32 - cidr)) >>> 0
}

/** 校验 CIDR 前缀长度 */
function assertCidr(cidr: number): void {
  if (!Number.isInteger(cidr) || cidr < 0 || cidr > 32) {
    throw new Error('CIDR 前缀长度必须为 0-32 的整数')
  }
}

/**
 * 解析用户输入的一条 IP/掩码表达式，用于指令进入时预填表单。
 * 支持 `192.168.1.1/24`、`192.168.1.1 255.255.255.0`、`255.255.255.0`、`/24`。
 * @returns 无法解析时返回 null
 */
export function parseEntry(
  text: string
): { kind: 'subnet'; ip: string; mask: string } | { kind: 'mask'; mask: string } | null {
  const trimmed = text.trim()
  const cidrOnly = trimmed.match(/^\/(\d{1,2})$/)
  if (cidrOnly) return { kind: 'mask', mask: `/${cidrOnly[1]}` }

  const ipCidr = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/)
  if (ipCidr) return { kind: 'subnet', ip: ipCidr[1], mask: `/${ipCidr[2]}` }

  const twoArgs = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3})\s+(\d{1,3}(?:\.\d{1,3}){3}|\/\d{1,2})$/)
  if (twoArgs) return { kind: 'subnet', ip: twoArgs[1], mask: twoArgs[2] }

  const singleIP = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (singleIP) {
    const value = singleIP[1]
    try {
      parseMask(value)
      return { kind: 'mask', mask: value }
    } catch {
      return { kind: 'subnet', ip: value, mask: '255.255.255.0' }
    }
  }
  return null
}

// ━━━ 网络与 IP 地址计算器：按 A/B/C 类划分或汇总子网 ━━━━━━━━━━━━━━━━━━━━━━━

/** A/B/C/D/E 网络类别 */
export type NetworkClass = 'A' | 'B' | 'C' | 'D' | 'E'

/** 网络类型选择：auto 按首位字节判定，其余强制按该类划分 */
export type ClassMode = 'auto' | 'A' | 'B' | 'C'

/** 网络类别判定结果 */
export interface NetworkClassInfo {
  netClass: NetworkClass
  label: string
  naturalCidr: number
  naturalMask: string
  /** 多播、保留与回环地址不参与子网划分 */
  subnettable: boolean
  note: string
}

/** 子网列表中的一行 */
export interface SubnetRow {
  index: number
  network: string
  first: string
  last: string
  broadcast: string
  cidr: number
  /** 是否为输入 IP 所在的网段 */
  isTarget: boolean
}

/** 子网划分结果 */
export interface SubnetPlan {
  ip: string
  netClass: NetworkClass
  classLabel: string
  naturalCidr: number
  naturalMask: string
  cidr: number
  mask: string
  maskHex: string
  /** 反掩码（通配符掩码），ACL 与路由协议使用 */
  wildcard: string
  /** 相对自然掩码借用的位数 */
  borrowBits: number
  mode: 'subnet' | 'supernet' | 'natural'
  /** 划分（或汇总）得到的网段总数 */
  blockCount: number
  /** 每个网段的地址数 */
  blockSize: number
  hostsPerBlock: number
  /** 输入 IP 在所选掩码下的网段 */
  targetNetwork: string
  targetBroadcast: string
  targetFirst: string
  targetLast: string
  /** 输入 IP 落在列表中的第几个网段，从 0 开始 */
  targetIndex: number
  rows: SubnetRow[]
  /** 因超出渲染上限而未列出的网段数 */
  hiddenRows: number
  note: string
}

/** 子网列表一次最多渲染的行数，避免 A 类掩码下渲染出上十万行 DOM */
const PLAN_ROW_LIMIT = 60

/** 首位字节区间到网络类别的映射（分类网络） */
const CLASS_RANGES: Array<{
  maxFirst: number
  netClass: NetworkClass
  naturalCidr: number
  subnettable: boolean
  note: string
}> = [
  { maxFirst: 0, netClass: 'A', naturalCidr: 8, subnettable: false, note: '0.0.0.0/8 为本网络，仅作保留地址使用' },
  { maxFirst: 126, netClass: 'A', naturalCidr: 8, subnettable: true, note: '' },
  { maxFirst: 127, netClass: 'A', naturalCidr: 8, subnettable: false, note: '127.0.0.0/8 为回环地址，不参与子网划分' },
  { maxFirst: 191, netClass: 'B', naturalCidr: 16, subnettable: true, note: '' },
  { maxFirst: 223, netClass: 'C', naturalCidr: 24, subnettable: true, note: '' },
  { maxFirst: 239, netClass: 'D', naturalCidr: 4, subnettable: false, note: '224.0.0.0/4 为多播地址，不支持子网划分' },
  { maxFirst: 255, netClass: 'E', naturalCidr: 5, subnettable: false, note: '240.0.0.0/4 为保留地址，不支持子网划分' }
]

/**
 * 按首位字节判定 IP 所属的分类网络类别。
 * @throws IP 不合法时抛出
 */
export function detectNetworkClass(ip: string): NetworkClassInfo {
  const first = parseIP(ip) >>> 24
  const range = CLASS_RANGES.find((item) => first <= item.maxFirst)!
  return {
    netClass: range.netClass,
    label: `${range.netClass} 类`,
    naturalCidr: range.naturalCidr,
    naturalMask: cidrToMask(range.naturalCidr),
    subnettable: range.subnettable,
    note: range.note
  }
}

/**
 * 按分类网络做子网划分或超网汇总，并生成子网列表。
 * 掩码优先级高于子网数量：两者都给出时以 `maskOrCidr` 为准。
 * @param ip 待划分的 IP
 * @param opts.classMode 网络类型，默认按首位字节自动判定
 * @param opts.subnets 期望划分出的子网数量，向上取 2 的幂
 * @param opts.maskOrCidr 直接指定子网掩码或 /n
 */
export function planSubnets(
  ip: string,
  opts: { classMode?: ClassMode; subnets?: number; maskOrCidr?: string }
): SubnetPlan {
  const ipInt = parseIP(ip)
  const mode = opts.classMode ?? 'auto'
  const detected = detectNetworkClass(ip)
  const forced = mode === 'auto' ? null : mode
  const naturalCidr = forced ? CLASS_CIDR[forced] : detected.naturalCidr
  const netClass = forced ?? detected.netClass
  const classLabel = `${netClass} 类${forced && forced !== detected.netClass ? `（手动指定）` : ''}`

  if (!opts.maskOrCidr?.trim() && opts.subnets == null) {
    throw new Error('请填写子网数量或子网掩码')
  }
  const cidr = opts.maskOrCidr?.trim()
    ? resolveCidr(opts.maskOrCidr)
    : naturalCidr + subnetBitsFor(opts.subnets!)
  if (cidr > 32) {
    const maxSubnets = 2 ** (32 - naturalCidr)
    throw new Error(
      `${netClass} 类自然掩码 /${naturalCidr} 最多划分 ${maxSubnets.toLocaleString()} 个子网，请减少子网数量`
    )
  }

  if (!detected.subnettable && mode === 'auto') {
    throw new Error(detected.note)
  }

  const maskInt = cidrToMaskInt(cidr)
  const naturalMaskInt = cidrToMaskInt(naturalCidr)
  const supernet = cidr < naturalCidr
  const borrowBits = Math.abs(cidr - naturalCidr)
  // 超网时列表按自然网段逐个列出，子网时按划分出的子网列出
  const rowCidr = supernet ? naturalCidr : cidr
  // 按位与的结果在 JS 里是有符号 32 位整数，C 类/B 类地址会变负，必须 >>> 0 后再做减法与除法
  const baseInt = (supernet ? ipInt & maskInt : ipInt & naturalMaskInt) >>> 0
  const rowSize = 2 ** (32 - rowCidr)
  const blockCount = 2 ** borrowBits
  const targetIndex = Math.floor((ipInt - baseInt) / rowSize)

  const firstWindowIndex = Math.min(
    Math.max(targetIndex - Math.floor(PLAN_ROW_LIMIT / 2), 0),
    Math.max(blockCount - PLAN_ROW_LIMIT, 0)
  )
  const rowCount = Math.min(blockCount, PLAN_ROW_LIMIT)
  const rows: SubnetRow[] = []
  for (let i = firstWindowIndex; i < firstWindowIndex + rowCount; i++) {
    const networkInt = (baseInt + i * rowSize) >>> 0
    const broadcastInt = (networkInt + rowSize - 1) >>> 0
    const { first, last } = usableRange(rowCidr, networkInt, broadcastInt)
    rows.push({
      index: i,
      network: intToIP(networkInt),
      first,
      last,
      broadcast: intToIP(broadcastInt),
      cidr: rowCidr,
      isTarget: i === targetIndex
    })
  }

  const targetNetwork = (ipInt & maskInt) >>> 0
  const targetBroadcast = (targetNetwork | (~maskInt >>> 0)) >>> 0
  const targetRange = usableRange(cidr, targetNetwork, targetBroadcast)
  const mask = intToIP(maskInt)
  return {
    ip: intToIP(ipInt),
    netClass,
    classLabel,
    naturalCidr,
    naturalMask: cidrToMask(naturalCidr),
    cidr,
    mask,
    maskHex: toMaskHex(mask),
    wildcard: intToIP((~maskInt >>> 0) >>> 0),
    borrowBits,
    mode: supernet ? 'supernet' : cidr === naturalCidr ? 'natural' : 'subnet',
    blockCount,
    blockSize: 2 ** (32 - cidr),
    hostsPerBlock: hostsOf(rowCidr),
    targetNetwork: intToIP(targetNetwork),
    targetBroadcast: intToIP(targetBroadcast),
    targetFirst: targetRange.first,
    targetLast: targetRange.last,
    targetIndex,
    rows,
    hiddenRows: blockCount - rows.length,
    note: detected.subnettable ? '' : detected.note
  }
}

/** A/B/C 类手动指定时的自然掩码 */
const CLASS_CIDR: Record<'A' | 'B' | 'C', number> = { A: 8, B: 16, C: 24 }

/** 划分 subnets 个子网所需借用的网络位数（子网数向上取 2 的幂） */
function subnetBitsFor(subnets: number): number {
  if (!Number.isInteger(subnets) || subnets < 1) throw new Error('子网数量必须为正整数')
  let bits = 0
  while (2 ** bits < subnets) {
    bits++
    if (bits > 32) throw new Error('子网数量超出单个 IPv4 地址空间')
  }
  return bits
}

/** 一个网段的可用主机数 */
function hostsOf(cidr: number): number {
  if (cidr === 32) return 1
  if (cidr === 31) return 2
  return 2 ** (32 - cidr) - 2
}

