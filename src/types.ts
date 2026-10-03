export type StageStatus = '待协商' | '条件通过' | '已批准' | '退回'

export interface ClosureStage {
  id: string
  name: string
  start: string
  end: string
  lanes: string
  status: StageStatus
  route: [number, number][]
}

export interface DetourRoute {
  id: string
  name: string
  distance: number
  extraMinutes: number
  coordinates: [number, number][]
}

export interface SegmentComment {
  id: string
  segmentId: string
  unit: '建设' | '交通' | '公交' | '应急'
  author: string
  content: string
  condition?: string
  status: '待处理' | '已接受' | '已退回'
  /** 已接受条件按当时依据冻结，阶段变化不失效 */
  frozen?: boolean
  frozenBasis?: string
  frozenAt?: string
  /** 待处理意见在阶段时间/封路线变化后标记为失效，需重新会签 */
  stale?: boolean
}

export interface Scheme {
  id: string
  project: string
  contractor: string
  area: string
  version: number
  stages: ClosureStage[]
  detours: DetourRoute[]
  comments: SegmentComment[]
}

/** 相邻道路工程平台推送的外部记录 */
export interface ExternalRecord {
  id: string
  /** 工程编号 */
  engineeringNo: string
  /** 版本 */
  version: number
  project?: string
  kind: 'window' | 'receipt'
  start?: string
  end?: string
  lanes?: string
  route?: [number, number][]
  /** 撤单回执指向被撤回的外部记录 id */
  receiptFor?: string
  reason?: string
  pushedAt: string
}

/** 对账产生的冲突 */
export interface ReconcileConflict {
  id: string
  level: '高' | '中'
  segmentId: string
  title: string
  detail: string
  /** 占用来源，如 “ADJ-2026-042 云河路东段雨污分流工程 · 占用慢车道” */
  source: string
  externalEngineeringNo?: string
  externalRecordId?: string
  windowStart?: string
  windowEnd?: string
  status: 'active' | 'withdrawn' | 'invalidated'
}

/** 单条外部记录的对账结果 */
export interface ReconcileOutcome {
  recordId: string
  engineeringNo: string
  version: number
  /** 同编号重复推送时指向首次结果 */
  duplicateOf?: string
  withdrawn?: boolean
  conflictIds: string[]
}

export type BatchStatus = 'pending' | 'processing' | 'failed' | 'done'

/** 对账批次：施工阶段、绕行、会签意见与外部回执接入同一份批次 */
export interface ReconciliationBatch {
  id: string
  createdAt: string
  status: BatchStatus
  /** 断点：下一条待写入记录的下标 */
  cursor: number
  recordIds: string[]
  outcomes: ReconcileOutcome[]
  error?: string
  /** 阶段变化触发的重算批次 */
  recalc?: boolean
  /** 已消耗过一次注入的写入失败，恢复时不再重复注入 */
  failureConsumed?: boolean
}
