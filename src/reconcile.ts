import type { ClosureStage, ExternalRecord, ReconcileConflict, ReconcileOutcome } from './types'

export function windowsOverlap(aStart?: string, aEnd?: string, bStart?: string, bEnd?: string): boolean {
  if (!aStart || !aEnd || !bStart || !bEnd) return false
  return new Date(aStart).getTime() <= new Date(bEnd).getTime() && new Date(bStart).getTime() <= new Date(aEnd).getTime()
}

export function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const start = new Date(Math.max(new Date(aStart).getTime(), new Date(bStart).getTime()))
  const end = new Date(Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime()))
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
}

/** 同工程编号去重：重复推送沿用第一次结果 */
export function dedupe(records: ExternalRecord[]): { first: Map<string, ExternalRecord>; duplicates: Set<string> } {
  const first = new Map<string, ExternalRecord>()
  const duplicates = new Set<string>()
  for (const rec of records) {
    if (rec.kind === 'receipt') continue
    if (first.has(rec.engineeringNo)) duplicates.add(rec.id)
    else first.set(rec.engineeringNo, rec)
  }
  return { first, duplicates }
}

let conflictSeq = 0
export function resetConflictSeq() { conflictSeq = 0 }
export function seedConflictSeq(max: number) { conflictSeq = max }
function nextConflictId() { return `RCF-${String(++conflictSeq).padStart(2, '0')}` }

/**
 * 对账单条外部记录。纯函数：不修改入参，冲突的落库由 store 原子写入。
 * - window：与本阶段窗口重叠则保留双方并指出占用来源
 * - receipt：撤回回执，把指向记录产生的冲突置为 withdrawn（保留审计）
 */
export function reconcileRecord(
  rec: ExternalRecord,
  stages: ClosureStage[],
  existing: ReconcileConflict[],
): { outcome: ReconcileOutcome; conflicts: ReconcileConflict[] } {
  const outcome: ReconcileOutcome = { recordId: rec.id, engineeringNo: rec.engineeringNo, version: rec.version, conflictIds: [] }
  const conflicts: ReconcileConflict[] = []

  if (rec.kind === 'receipt') {
    outcome.withdrawn = true
    const target = existing.find((item) => item.externalRecordId === rec.receiptFor && item.status === 'active')
    if (target) conflicts.push({ ...target, status: 'withdrawn' })
    return { outcome, conflicts }
  }

  for (const stage of stages) {
    if (!windowsOverlap(rec.start, rec.end, stage.start, stage.end)) continue
    const days = overlapDays(rec.start!, rec.end!, stage.start, stage.end)
    const id = nextConflictId()
    conflicts.push({
      id,
      level: '高',
      segmentId: stage.id,
      title: `相邻工程窗口与 ${stage.name} 重叠`,
      detail: `${rec.engineeringNo}${rec.project ? ` ${rec.project}` : ''}（占用${rec.lanes ?? '占道'}）窗口 ${rec.start} 至 ${rec.end} 与本阶段 ${stage.start} 至 ${stage.end} 重叠 ${days} 天，双方窗口均保留。`,
      source: `${rec.engineeringNo}${rec.project ? ` ${rec.project}` : ''} · 占用${rec.lanes ?? '占道'}`,
      externalEngineeringNo: rec.engineeringNo,
      externalRecordId: rec.id,
      windowStart: rec.start,
      windowEnd: rec.end,
      status: 'active',
    })
    outcome.conflictIds.push(id)
  }
  return { outcome, conflicts }
}
