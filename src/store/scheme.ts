import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { ClosureStage, ExternalRecord, ReconcileConflict, ReconciliationBatch, ReconcileOutcome, Scheme, SegmentComment } from '../types'
import { dedupe, reconcileRecord, seedConflictSeq } from '../reconcile'

const STORAGE_KEY = 'yy54-road-scheme-v2'

const seedScheme: Scheme = {
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
    { id: 'CM-42', segmentId: 'ST-02', unit: '应急', author: '夏川', content: '夜间全封闭期间，区域急救中心南门通道被切断。', condition: '保留 4 米应急通道，路口导改每 15 分钟巡查一次。', status: '已接受' },
    { id: 'CM-43', segmentId: 'ST-03', unit: '交通', author: '郑航', content: '公交专用道占用导致高峰小时延误增加 19 分钟，超过方案阈值。', condition: '缩减围挡 1.5 米并调整信号配时。', status: '已退回' },
  ],
}

function buildSeed() {
  const scheme = structuredClone(seedScheme)
  const cm42 = scheme.comments.find((item) => item.id === 'CM-42')!
  const st2 = scheme.stages.find((item) => item.id === 'ST-02')!
  // 已接受的应急条件按当时依据冻结
  cm42.frozen = true
  cm42.frozenAt = '2026-10-06T10:00:00Z'
  cm42.frozenBasis = `${st2.start} 至 ${st2.end} · ${st2.lanes}`

  const externalRecords: ExternalRecord[] = [
    { id: 'EXT-01', engineeringNo: 'ADJ-2026-043', version: 1, project: '江海大道路口信号灯改造', kind: 'window', start: '2026-10-09', end: '2026-10-12', lanes: '一条直行车道', pushedAt: '2026-10-05T09:00:00Z' },
    { id: 'EXT-02', engineeringNo: 'ADJ-2026-042', version: 1, project: '云河路东段雨污分流工程', kind: 'window', start: '2026-10-26', end: '2026-10-30', lanes: '慢车道', pushedAt: '2026-10-05T09:02:00Z' },
    { id: 'EXT-03', engineeringNo: 'ADJ-2026-042', version: 2, project: '云河路东段雨污分流工程（二期）', kind: 'window', start: '2026-10-26', end: '2026-11-02', lanes: '慢车道', pushedAt: '2026-10-05T09:05:00Z' },
    { id: 'EXT-04', engineeringNo: 'ADJ-2026-044', version: 1, kind: 'receipt', receiptFor: 'EXT-01', reason: '信号灯改造提前完成，撤道路占用回执', pushedAt: '2026-10-05T16:00:00Z' },
  ]

  // 种子批次：EXT-01 已写入（断点 cursor=1），EXT-02 写入失败
  const reconcileConflicts: ReconcileConflict[] = []
  const { outcome, conflicts } = reconcileRecord(externalRecords[0], scheme.stages, [])
  for (const item of conflicts) reconcileConflicts.push(item)

  const batch: ReconciliationBatch = {
    id: 'BATCH-01', createdAt: '2026-10-05T09:10:00Z', status: 'failed', cursor: 1,
    recordIds: externalRecords.map((item) => item.id), outcomes: [outcome],
    error: '对账写入失败：外部状态与冲突结果未同时提交（模拟断点，可从断点恢复）',
    failureConsumed: true,
  }
  return { scheme, externalRecords, batches: [batch], reconcileConflicts }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const useSchemeStore = defineStore('scheme', () => {
  const seed = buildSeed()
  const scheme = ref<Scheme>(seed.scheme)
  const externalRecords = ref<ExternalRecord[]>(seed.externalRecords)
  const batches = ref<ReconciliationBatch[]>(seed.batches)
  const reconcileConflicts = ref<ReconcileConflict[]>(seed.reconcileConflicts)

  const selectedStageId = ref('ST-01')
  const selectedCommentId = ref('CM-41')
  const drawing = ref(false)
  const draftRoute = ref<[number, number][]>([])
  const history = ref<string[]>([])

  const selectedStage = computed(() => scheme.value.stages.find((item) => item.id === selectedStageId.value))
  const selectedComment = computed(() => scheme.value.comments.find((item) => item.id === selectedCommentId.value))

  const pendingBatches = computed(() => batches.value.filter((item) => item.status !== 'done'))
  const canExport = computed(() => pendingBatches.value.length === 0)
  const anyProcessing = computed(() => batches.value.some((item) => item.status === 'processing'))

  /** 生效冲突：本地规则冲突 + 对账冲突（重叠窗口保留双方并带来源） */
  const conflicts = computed(() => {
    const list: { id: string; level: '高' | '中'; segmentId: string; title: string; detail: string; source?: string }[] = []
    const st1 = scheme.value.stages.find((item) => item.id === 'ST-01')
    const st2 = scheme.value.stages.find((item) => item.id === 'ST-02')
    const st3 = scheme.value.stages.find((item) => item.id === 'ST-03')
    if (st2 && st2.lanes.includes('全封闭')) {
      list.push({ id: 'CF-02', level: '高', segmentId: 'ST-02', title: '救护通道中断风险', detail: '夜间全封闭将切断区域急救中心南门，必须保留 4 米应急通道。' })
    }
    if (st1) {
      list.push({ id: 'CF-03', level: '中', segmentId: 'ST-01', title: '公交站点覆盖缺口', detail: '17 路与 806 路临时站距现状站 680 米，已超过 500 米阈值。' })
    }
    if (st3) {
      list.push({ id: 'CF-04', level: '中', segmentId: 'ST-03', title: '绕行延误超阈值', detail: '高峰绕行新增 19 分钟，超过方案设定的 15 分钟阈值。' })
    }
    for (const item of reconcileConflicts.value.filter((conflict) => conflict.status === 'active')) {
      list.push({ id: item.id, level: item.level, segmentId: item.segmentId, title: item.title, detail: item.detail, source: item.source })
    }
    return list
  })

  const dirty = computed(() => history.value.length > 0)

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      scheme: scheme.value,
      externalRecords: externalRecords.value,
      batches: batches.value,
      reconcileConflicts: reconcileConflicts.value,
    }))
  }
  function syncConflictSeq() {
    let max = 0
    for (const item of reconcileConflicts.value) {
      const match = item.id.match(/RCF-(\d+)/)
      if (match) max = Math.max(max, parseInt(match[1], 10))
    }
    seedConflictSeq(max)
  }
  function restore() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (data.scheme) scheme.value = data.scheme
    if (data.externalRecords) externalRecords.value = data.externalRecords
    if (data.batches) batches.value = data.batches
    if (data.reconcileConflicts) reconcileConflicts.value = data.reconcileConflicts
    syncConflictSeq()
  }
  function commit() { history.value.push(JSON.stringify(scheme.value)); persist() }

  function startDraw() { drawing.value = true; draftRoute.value = [] }
  function addPoint(point: [number, number]) { if (drawing.value) draftRoute.value.push(point) }
  function finishDraw() {
    if (draftRoute.value.length >= 2) {
      const stage = selectedStage.value
      if (stage) {
        commit(); stage.route = [...draftRoute.value]; stage.status = '待协商'; scheme.value.version += 1
        invalidateForStage(stage.id)
        persist()
      }
    }
    drawing.value = false
    draftRoute.value = []
  }
  function updateStage(patch: Partial<ClosureStage>) {
    const stage = selectedStage.value
    if (!stage) return
    commit(); Object.assign(stage, patch); stage.status = '待协商'; scheme.value.version += 1
    invalidateForStage(stage.id)
    persist()
  }

  function resolveComment(id: string, status: SegmentComment['status']) {
    const comment = scheme.value.comments.find((item) => item.id === id)
    if (!comment) return
    commit(); comment.status = status
    if (status === '已接受') {
      const stage = scheme.value.stages.find((item) => item.id === comment.segmentId)
      comment.frozen = true
      comment.frozenAt = new Date().toISOString()
      comment.frozenBasis = stage ? `${stage.start} 至 ${stage.end} · ${stage.lanes}` : '—'
      comment.stale = false
    }
    scheme.value.version += 1
    persist()
  }

  function undo() {
    const previous = history.value.pop()
    if (previous) { scheme.value = JSON.parse(previous); persist() }
  }

  /** 阶段时间或封路线变化后：待处理意见失效重算，已接受应急条件按当时依据冻结 */
  function invalidateForStage(stageId: string) {
    for (const comment of scheme.value.comments) {
      if (comment.segmentId === stageId && comment.status === '待处理') comment.stale = true
    }
    recomputeConflicts()
  }

  /** 按当前阶段窗口重算外部冲突：不再重叠的失效，新重叠的补入，撤回的保留审计 */
  function recomputeConflicts() {
    const { first } = dedupe(externalRecords.value)
    const withdrawn = new Set(externalRecords.value.filter((item) => item.kind === 'receipt' && item.receiptFor).map((item) => item.receiptFor!))
    const activeRecords = [...first.values()].filter((item) => item.kind === 'window' && !withdrawn.has(item.id))
    const stillActive = new Map<string, ReconcileConflict>()
    for (const rec of activeRecords) {
      const { conflicts } = reconcileRecord(rec, scheme.value.stages, [])
      for (const conflict of conflicts) stillActive.set(`${conflict.externalRecordId}|${conflict.segmentId}`, conflict)
    }
    for (const conflict of reconcileConflicts.value) {
      if (conflict.status === 'active' && !stillActive.has(`${conflict.externalRecordId}|${conflict.segmentId}`)) conflict.status = 'invalidated'
    }
    for (const [key, conflict] of stillActive) {
      const exists = reconcileConflicts.value.find((item) => item.status === 'active' && `${item.externalRecordId}|${item.segmentId}` === key)
      if (!exists) reconcileConflicts.value.push(conflict)
    }
  }

  /** 原子写入单条记录：外部对账结果与冲突在同一提交内落库，失败不留半成品 */
  function writeRecord(batch: ReconciliationBatch, recId: string) {
    const rec = externalRecords.value.find((item) => item.id === recId)
    if (!rec) return
    // 同编号重复推送：沿用第一次（最早推送）结果，不产生新冲突
    const firstOfNo = externalRecords.value.find((item) => item.engineeringNo === rec.engineeringNo && item.kind !== 'receipt')
    const outcome: ReconcileOutcome = { recordId: rec.id, engineeringNo: rec.engineeringNo, version: rec.version, conflictIds: [] }
    if (rec.kind !== 'receipt' && firstOfNo && firstOfNo.id !== rec.id) {
      outcome.duplicateOf = firstOfNo.id
    } else {
      const { conflicts } = reconcileRecord(rec, scheme.value.stages, reconcileConflicts.value)
      for (const conflict of conflicts) {
        if (conflict.status === 'withdrawn') {
          const existing = reconcileConflicts.value.find((item) => item.id === conflict.id)
          if (existing) existing.status = 'withdrawn'
        } else {
          reconcileConflicts.value.push(conflict)
          outcome.conflictIds.push(conflict.id)
        }
      }
    }
    batch.outcomes.push(outcome)
  }

  /** 从断点按原批次恢复写入；失败发生在任何落库之前，外部状态与冲突要么都写要么都不写 */
  async function runBatch(batchId: string) {
    const batch = batches.value.find((item) => item.id === batchId)
    if (!batch || batch.status === 'done') return
    batch.status = 'processing'
    persist()
    try {
      for (let i = batch.cursor; i < batch.recordIds.length; i++) {
        const recId = batch.recordIds[i]
        await delay(350)
        if (i === 1 && !batch.failureConsumed) {
          batch.failureConsumed = true
          throw new Error('对账写入失败：外部状态与冲突结果未同时提交（模拟断点，可从断点恢复）')
        }
        writeRecord(batch, recId)
        batch.cursor = i + 1
        persist()
      }
      batch.status = 'done'
    } catch (error) {
      batch.status = 'failed'
      batch.error = (error as Error).message
    } finally {
      persist()
    }
  }

  /** 推送一批外部记录并创建同一份对账批次 */
  function pushExternalRecords(records: ExternalRecord[]): string {
    const batch: ReconciliationBatch = {
      id: `BATCH-${String(batches.value.length + 1).padStart(2, '0')}`,
      createdAt: new Date().toISOString(),
      status: 'pending',
      cursor: 0,
      recordIds: records.map((item) => item.id),
      outcomes: [],
      failureConsumed: false,
    }
    externalRecords.value.push(...records)
    batches.value.push(batch)
    persist()
    return batch.id
  }

  let demoSeq = 0
  function pushDemoBatch(): string {
    demoSeq += 1
    const n = demoSeq
    const now = new Date().toISOString()
    const records: ExternalRecord[] = [
      { id: `EXT-D${n}-1`, engineeringNo: `ADJ-2026-${50 + n}`, version: 1, project: '滨江大道燃气迁改工程', kind: 'window', start: '2026-11-02', end: '2026-11-08', lanes: '半幅路面', pushedAt: now },
      { id: `EXT-D${n}-2`, engineeringNo: `ADJ-2026-${60 + n}`, version: 1, project: '云河路交通信号优化', kind: 'window', start: '2026-10-15', end: '2026-10-18', lanes: '右侧车道', pushedAt: now },
      { id: `EXT-D${n}-3`, engineeringNo: `ADJ-2026-${60 + n}`, version: 2, project: '云河路交通信号优化（复核）', kind: 'window', start: '2026-10-15', end: '2026-10-18', lanes: '右侧车道', pushedAt: now },
      { id: `EXT-D${n}-4`, engineeringNo: `ADJ-2026-${70 + n}`, version: 1, kind: 'receipt', receiptFor: `EXT-D${n}-2`, reason: '信号优化已完成，撤占用回执', pushedAt: now },
    ]
    return pushExternalRecords(records)
  }

  function externalRecordStatus(rec: ExternalRecord): { label: string; color: string } {
    if (rec.kind === 'receipt') return { label: '撤单回执', color: 'purple' }
    const outcome = batches.value.flatMap((item) => item.outcomes).find((item) => item.recordId === rec.id)
    if (!outcome) return { label: '待对账', color: 'gray' }
    if (outcome.duplicateOf) return { label: '重复推送 · 沿用首条', color: 'orange' }
    const conflict = reconcileConflicts.value.find((item) => item.externalRecordId === rec.id)
    if (conflict?.status === 'withdrawn') return { label: '已撤回', color: 'red' }
    if (conflict?.status === 'active') return { label: '已对账 · 有冲突', color: 'red' }
    return { label: '已对账 · 无冲突', color: 'green' }
  }

  /** 导出公开通告；存在未完成对账批次时阻止导出 */
  function exportNotice(): { blocked: boolean; reason?: string } {
    if (!canExport.value) {
      return { blocked: true, reason: `存在 ${pendingBatches.value.length} 个未完成对账批次，公开通告导出已阻止` }
    }
    const text = [
      `${scheme.value.project} 施工封路公开通告`,
      `范围：${scheme.value.area}`,
      `版本：v${scheme.value.version}`,
      '',
      ...scheme.value.stages.map((stage) => `${stage.start} 至 ${stage.end}｜${stage.name}｜${stage.lanes}`),
      '',
      '绕行建议：',
      ...scheme.value.detours.map((route) => `${route.name}，增加约 ${route.extraMinutes} 分钟`),
      '',
      '本通告由建设、交通、公交、应急单位联合确认。',
    ].join('\n')
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `封路公开通告-${scheme.value.id}-v${scheme.value.version}.txt`
    link.click()
    URL.revokeObjectURL(link.href)
    return { blocked: false }
  }

  watch(selectedStageId, () => {})
  restore()

  return {
    scheme, externalRecords, batches, reconcileConflicts,
    selectedStageId, selectedCommentId, selectedStage, selectedComment,
    drawing, draftRoute, history, conflicts, dirty,
    pendingBatches, canExport, anyProcessing,
    startDraw, addPoint, finishDraw, updateStage, resolveComment, undo,
    runBatch, pushExternalRecords, pushDemoBatch, externalRecordStatus, exportNotice,
  }
})
