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
  status: '待处理' | '已接受' | '已退回' | '已失效'
  /** 已接受的应急条件按接受时的阶段窗口与方案版本冻结，后续改期不重算 */
  frozenBasis?: string
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

export type ExternalKind = '施工窗口' | '占用车道' | '撤单回执'
export type ReceiptStatus = '生效' | '已撤单'

/** 相邻道路工程平台推送的外部回执，工程编号 + 类型为幂等键 */
export interface ExternalReceipt {
  projectNo: string
  version: number
  kind: ExternalKind
  corridor: string
  start: string
  end: string
  lanes: string
  receivedAt: string
  status: ReceiptStatus
}

/** 对账冲突：本地阶段与外部工程双方均保留，并标注占用来源 */
export interface ReconcileConflict {
  id: string
  stageId: string
  externalProjectNo: string
  level: '高' | '中'
  title: string
  source: string
  basis: string
  detail: string
}

export type BatchState = '待写入' | '写入中' | '写入失败' | '已完成'

/** 对账批次：receipts 为原批次快照，checkpoint 之后的状态从断点恢复 */
export interface ReconcileBatch {
  id: string
  createdAt: string
  state: BatchState
  checkpoint: number
  receipts: ExternalReceipt[]
  conflicts: ReconcileConflict[]
  error?: string
}
