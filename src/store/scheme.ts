import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { ClosureStage, ExternalReceipt, ReconcileBatch, ReconcileConflict, SegmentComment, Scheme } from '../types'

const STORAGE_KEY = 'yy54-road-scheme-v1'

const seed: Scheme = {
  id: 'RC-2026-0918', project: '云河路快速化改造', contractor: '市政建设集团第三工程处', area: '云河路 / 江海大道', version: 7,
  stages: [
    { id: 'ST-01', name: '第一阶段 · 东半幅围挡', start: '2026-10-08', end: '2026-10-22', lanes: '双向 4 车道收窄为 2 车道', status: '条件通过', route: [[121.470,31.228],[121.482,31.231],[121.496,31.235]] },
    { id: 'ST-02', name: '第二阶段 · 路口夜间施工', start: '2026-10-23', end: '2026-11-05', lanes: '22:00–05:00 全封闭', status: '待协商', route: [[121.496,31.235],[121.508,31.238],[121.516,31.242]] },
    { id: 'ST-03', name: '第三阶段 · 西半幅恢复', start: '2026-11-06', end: '2026-11-18', lanes: '西侧公交专用道临时占用', status: '退回', route: [[121.452,31.224],[121.462,31.226],[121.470,31.228]] },
  ],
  detours: [
    { id: 'DR-01', name: '江海大道—滨河路绕行', distance: 4.8, extraMinutes: 11, coordinates: [[121.470,31.228],[121.478,31.214],[121.502,31.218],[121.516,31.242]] },
    { id: 'DR-02', name: '云河路辅道保通', distance: 2.3, extraMinutes: 6, coordinates: [[121.452,31.224],[121.462,31.219],[121.496,31.235]] },
  ],
  comments: [
    { id: 'CM-41', segmentId: 'ST-01', unit: '公交', author: '顾敏', content: '17 路、806 路临时站点与云河路站距离 680 米，超过老年乘客可接受步行距离。', condition: '需在江海大道口增设临时站并配置导乘人员。', status: '待处理' },
    { id: 'CM-42', segmentId: 'ST-02', unit: '应急', author: '夏川', content: '夜间全封闭期间，区域急救中心南门通道被切断。', condition: '保留 4 米应急通道，路口导改每 15 分钟巡查一次。', status: '已接受', frozenBasis: '冻结依据：第二阶段 · 路口夜间施工 2026-10-23→2026-11-05 · 方案 v7' },
    { id: 'CM-43', segmentId: 'ST-03', unit: '交通', author: '郑航', content: '公交专用道占用导致高峰小时延误增加 19 分钟，超过方案阈值。', condition: '缩减围挡 1.5 米并调整信号配时。', status: '已退回' },
  ],
}

const seedReceipts: ExternalReceipt[] = [
  { projectNo: 'EXT-2026-114', version: 3, kind: '施工窗口', corridor: '江海大道东段', start: '2026-10-26', end: '2026-10-30', lanes: '占用慢车道 1 条', receivedAt: '2026-10-01 09:40', status: '生效' },
  { projectNo: 'EXT-2026-118', version: 1, kind: '占用车道', corridor: '云河路辅道', start: '2026-11-08', end: '2026-11-12', lanes: '占用公交专用道', receivedAt: '2026-10-02 14:05', status: '生效' },
]

interface Ledger {
  receipts: ExternalReceipt[]
  batches: ReconcileBatch[]
  /** 幂等台账：工程编号·类型 → 首次处理结果，重复推送直接沿用 */
  processed: Record<string, { batchId: string; result: string }>
  conflicts: ReconcileConflict[]
}

function seedLedger(): Ledger {
  return {
    receipts: structuredClone(seedReceipts),
    batches: [{ id: 'RB-2026-0930', createdAt: '2026-10-02 14:05', state: '已完成', checkpoint: seedReceipts.length, receipts: structuredClone(seedReceipts), conflicts: [] }],
    processed: {
      'EXT-2026-114·施工窗口': { batchId: 'RB-2026-0930', result: '已并入批次 RB-2026-0930' },
      'EXT-2026-118·占用车道': { batchId: 'RB-2026-0930', result: '已并入批次 RB-2026-0930' },
    },
    conflicts: [],
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function windowOverlaps(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd
}

export const useSchemeStore = defineStore('scheme', () => {
  const scheme = ref<Scheme>(structuredClone(seed))
  const ledger = ref<Ledger>(seedLedger())
  const selectedStageId = ref('ST-01')
  const selectedCommentId = ref('CM-41')
  const drawing = ref(false)
  const draftRoute = ref<[number, number][]>([])
  const history = ref<string[]>([])
  /** 演示开关：下一次对账写入必定失败，用于验证断点恢复 */
  const failNextWrite = ref(false)
  const selectedStage = computed(() => scheme.value.stages.find((item) => item.id === selectedStageId.value))
  const selectedComment = computed(() => scheme.value.comments.find((item) => item.id === selectedCommentId.value))
  const conflicts = computed(() => [
    { id: 'CF-02', level: '高', segmentId: 'ST-02', title: '救护通道中断风险', detail: '夜间全封闭将切断区域急救中心南门，必须保留 4 米应急通道。' },
    { id: 'CF-03', level: '中', segmentId: 'ST-01', title: '公交站点覆盖缺口', detail: '17 路与 806 路临时站距现状站 680 米，已超过 500 米阈值。' },
    { id: 'CF-04', level: '中', segmentId: 'ST-03', title: '绕行延误超阈值', detail: '高峰绕行新增 19 分钟，超过方案设定的 15 分钟阈值。' },
  ])
  /** 本地规则检测 + 对账台账冲突，统一供总览与地图消费 */
  const allConflicts = computed(() => [
    ...conflicts.value.map((item) => ({ ...item, source: '占用来源：本地阶段计划' })),
    ...ledger.value.conflicts.map((item) => ({ id: item.id, level: item.level, segmentId: item.stageId, title: item.title, detail: `${item.detail}（${item.basis}）`, source: item.source })),
  ])
  const pendingBatches = computed(() => ledger.value.batches.filter((batch) => batch.state !== '已完成'))
  /** 未处理完的对账批次持续挡住公开通告导出 */
  const exportBlocked = computed(() => pendingBatches.value.length > 0)
  const dirty = computed(() => history.value.length > 0)

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ scheme: scheme.value, ledger: ledger.value }))
  }
  function restore() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && parsed.scheme) {
        scheme.value = parsed.scheme
        ledger.value = { ...seedLedger(), ...parsed.ledger }
      } else {
        scheme.value = parsed
      }
      // 会话中断时正在写入的批次一律转为可恢复的失败态，绝不当作已完成
      ledger.value.batches.forEach((batch) => {
        if (batch.state === '写入中' || batch.state === '待写入') {
          batch.state = '写入失败'
          if (!batch.error) batch.error = '会话中断，需从断点恢复'
        }
      })
    }
    recomputeAllConflicts()
    persist()
  }
  function commit() { history.value.push(JSON.stringify(scheme.value)); persist() }

  // ---------- 对账：冲突计算与失效重算 ----------

  function computeConflictsFor(receipt: ExternalReceipt): ReconcileConflict[] {
    if (receipt.kind === '撤单回执') return []
    return scheme.value.stages
      .filter((stage) => windowOverlaps(stage.start, stage.end, receipt.start, receipt.end))
      .map((stage) => ({
        id: `RCF-${receipt.projectNo}-${stage.id}`,
        stageId: stage.id,
        externalProjectNo: receipt.projectNo,
        level: receipt.kind === '施工窗口' ? '高' : '中',
        title: `外部工程 ${receipt.projectNo} 与 ${stage.id} 窗口重叠`,
        source: `占用来源：相邻工程平台 · ${receipt.projectNo} v${receipt.version}`,
        basis: `本地 ${stage.start}→${stage.end} × 外部 ${receipt.start}→${receipt.end}`,
        detail: `${receipt.corridor}${receipt.lanes}，与本地「${stage.name}」窗口重叠，双方占用保留，需错峰或联合导改。`,
      }))
  }
  /** 按当前阶段窗口与生效回执全量重算冲突台账 */
  function recomputeAllConflicts() {
    const active = ledger.value.receipts.filter((item) => item.status === '生效' && item.kind !== '撤单回执')
    ledger.value.conflicts = active.flatMap((item) => computeConflictsFor(item))
  }
  /** 阶段时间或封路线变化：相关冲突与待处理意见立即失效重算；已接受的应急条件按冻结依据保留 */
  function revalidateStage(stage: ClosureStage) {
    recomputeAllConflicts()
    const invalidated = scheme.value.comments.filter((item) => item.segmentId === stage.id && item.status === '待处理')
    for (const comment of invalidated) {
      comment.status = '已失效'
      const seq = scheme.value.comments.filter((item) => item.id === comment.id || item.id.startsWith(`${comment.id}-R`)).length
      scheme.value.comments.push({
        ...comment,
        id: `${comment.id}-R${seq}`,
        status: '待处理',
        frozenBasis: undefined,
        content: `${comment.content}（依据 ${stage.start}→${stage.end} 重算）`,
      })
    }
  }

  // ---------- 对账：批次写入与断点恢复 ----------

  async function remoteWrite(mutate: () => void) {
    await sleep(160)
    if (failNextWrite.value) {
      failNextWrite.value = false
      throw new Error('对账台账写入失败：协调台存储不可用')
    }
    mutate()
  }
  function writeReceiptConflicts(receipt: ExternalReceipt) {
    ledger.value.conflicts = ledger.value.conflicts.filter((item) => item.externalProjectNo !== receipt.projectNo)
    ledger.value.conflicts.push(...computeConflictsFor(receipt))
  }
  function applyReceiptStatus(receipt: ExternalReceipt) {
    if (receipt.kind === '撤单回执') {
      for (const item of ledger.value.receipts) {
        if (item.projectNo === receipt.projectNo && item.kind !== '撤单回执') item.status = '已撤单'
      }
    }
    const existing = ledger.value.receipts.find((item) => item.projectNo === receipt.projectNo && item.kind === receipt.kind)
    if (existing) Object.assign(existing, receipt)
    else ledger.value.receipts.push({ ...receipt })
  }
  /** 单步写入：先落冲突台账，再改外部回执状态，失败不会留下只改外部状态的结果 */
  async function applyStep(receipt: ExternalReceipt) {
    await remoteWrite(() => writeReceiptConflicts(receipt))
    await remoteWrite(() => applyReceiptStatus(receipt))
  }
  async function applyBatch(batch: ReconcileBatch) {
    batch.state = '写入中'
    delete batch.error
    persist()
    try {
      for (let index = batch.checkpoint; index < batch.receipts.length; index++) {
        await applyStep(batch.receipts[index])
        batch.checkpoint = index + 1
        batch.conflicts = ledger.value.conflicts.filter((item) => batch.receipts.some((receipt) => receipt.projectNo === item.externalProjectNo))
        persist()
      }
      batch.state = '已完成'
    } catch (err) {
      batch.state = '写入失败'
      batch.error = err instanceof Error ? err.message : String(err)
    }
    persist()
  }
  /** 外部平台推送入账：同编号同类型重复推送沿用第一次结果，新记录合成一份对账批次 */
  async function ingestExternal(records: Array<Omit<ExternalReceipt, 'receivedAt' | 'status'>>) {
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ')
    const fresh: ExternalReceipt[] = []
    const reused: string[] = []
    for (const record of records) {
      const key = `${record.projectNo}·${record.kind}`
      const seen = ledger.value.processed[key]
      if (seen) {
        reused.push(`${record.projectNo} ${record.kind} v${record.version}：同编号重复推送，沿用首次结果（${seen.result}）`)
        continue
      }
      fresh.push({ ...record, receivedAt: now, status: record.kind === '撤单回执' ? '已撤单' : '生效' })
    }
    if (!fresh.length) return { batch: null as ReconcileBatch | null, reused }
    const batch: ReconcileBatch = {
      id: `RB-${now.slice(2, 10).replaceAll('-', '')}-${String(ledger.value.batches.length + 1).padStart(2, '0')}`,
      createdAt: now,
      state: '待写入',
      checkpoint: 0,
      receipts: fresh,
      conflicts: [],
    }
    ledger.value.batches.unshift(batch)
    for (const receipt of fresh) {
      ledger.value.processed[`${receipt.projectNo}·${receipt.kind}`] = { batchId: batch.id, result: `已并入批次 ${batch.id}` }
    }
    persist()
    await applyBatch(batch)
    return { batch, reused }
  }
  /** 写入失败后按原批次（原回执快照）从 checkpoint 断点恢复 */
  async function resumeBatch(id: string) {
    const batch = ledger.value.batches.find((item) => item.id === id)
    if (!batch || batch.state === '已完成') return
    await applyBatch(batch)
  }

  // ---------- 方案编辑 ----------

  function startDraw() { drawing.value = true; draftRoute.value = [] }
  function addPoint(point: [number, number]) { if (drawing.value) draftRoute.value.push(point) }
  function finishDraw() {
    if (draftRoute.value.length >= 2) {
      const stage = selectedStage.value
      if (stage) {
        commit()
        stage.route = [...draftRoute.value]
        stage.status = '待协商'
        scheme.value.version += 1
        revalidateStage(stage)
        persist()
      }
    }
    drawing.value = false
    draftRoute.value = []
  }
  function updateStage(patch: Partial<ClosureStage>) {
    const stage = selectedStage.value
    if (!stage) return
    commit()
    Object.assign(stage, patch)
    stage.status = '待协商'
    scheme.value.version += 1
    revalidateStage(stage)
    persist()
  }
  function resolveComment(id: string, status: SegmentComment['status']) {
    const comment = scheme.value.comments.find((item) => item.id === id)
    if (!comment) return
    commit()
    comment.status = status
    // 已接受的应急条件按当时依据冻结，之后阶段改期不再重算
    if (status === '已接受' && comment.unit === '应急') {
      const stage = scheme.value.stages.find((item) => item.id === comment.segmentId)
      comment.frozenBasis = stage
        ? `冻结依据：${stage.name} ${stage.start}→${stage.end} · 方案 v${scheme.value.version}`
        : `冻结依据：方案 v${scheme.value.version}`
    }
    scheme.value.version += 1
    persist()
  }
  function undo() {
    const previous = history.value.pop()
    if (previous) {
      scheme.value = JSON.parse(previous)
      recomputeAllConflicts()
      persist()
    }
  }
  watch(selectedStageId, () => {})
  restore()
  return {
    scheme, ledger, selectedStageId, selectedCommentId, selectedStage, selectedComment, drawing, draftRoute,
    conflicts, allConflicts, pendingBatches, exportBlocked, dirty, failNextWrite,
    ingestExternal, resumeBatch, startDraw, addPoint, finishDraw, updateStage, resolveComment, undo,
  }
})
