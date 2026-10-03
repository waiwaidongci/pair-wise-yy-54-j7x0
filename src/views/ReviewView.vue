<script setup lang="ts">
import { ref } from 'vue'
import { useMutation } from '@vue/apollo-composable'
import { Message } from '@arco-design/web-vue'
import { COMMENTS_MUTATION, PUSH_EXTERNAL_MUTATION, RUN_BATCH_MUTATION } from '../graphql'
import { useSchemeStore } from '../store/scheme'

const store = useSchemeStore()
const { mutate } = useMutation(COMMENTS_MUTATION)
const { mutate: pushMutate } = useMutation(PUSH_EXTERNAL_MUTATION)
const { mutate: runMutate } = useMutation(RUN_BATCH_MUTATION)
const compare = ref(['ST-01', 'ST-02'])
const selectedVersion = ref('v7')
const versions = [
  { id: 'v7', author: '建设组', time: '今天 16:22', summary: '调整第二阶段夜间全封闭范围，保留急救通道' },
  { id: 'v6', author: '交通组', time: '今天 14:50', summary: '补充江海大道信号配时和现场疏导岗位' },
  { id: 'v5', author: '公交组', time: '昨天 19:10', summary: '提交临时站点与线路绕行方案' },
]

function resolve(id: string, status: '已接受' | '已退回') {
  store.resolveComment(id, status)
  void mutate({ id, status })
}
function exportNotice() {
  const result = store.exportNotice()
  if (result.blocked) Message.warning(result.reason || '存在未完成对账批次，公开通告导出已阻止')
  else Message.success('公开通告包已导出')
}
async function runBatch(batchId: string) {
  await store.runBatch(batchId)
  void runMutate({ id: batchId })
}
function pushDemo() {
  const id = store.pushDemoBatch()
  void pushMutate({ records: [] })
  Message.info(`已创建对账批次 ${id}，可开始对账`)
}
function batchStatusColor(status: string) {
  return status === 'done' ? 'green' : status === 'failed' ? 'red' : status === 'processing' ? 'blue' : 'orange'
}
function batchStatusText(status: string) {
  return status === 'done' ? '已完成' : status === 'failed' ? '写入失败 · 可恢复' : status === 'processing' ? '写入中' : '待对账'
}
function isBatchProcessing(batch: { status: string }) { return batch.status === 'processing' }
</script>

<template>
  <section class="page-head compact"><div><p class="eyebrow">条件会签 · 外部对账 · 版本批复</p><h1>路段意见与阶段审批</h1><p>施工阶段、绕行路线、会签意见与外部回执接入同一份对账批次；未完成批次挡住公开通告导出。</p></div><a-space><a-button type="primary" :disabled="!store.canExport" @click="exportNotice">导出公开通告包</a-button><a-button @click="pushDemo">推送外部记录</a-button></a-space></section>

  <a-alert v-if="!store.canExport" type="warning" class="mb16" title="存在未完成对账批次，公开通告导出已阻止" content="外部改期与撤回需经对账批次写入冲突结果后才会反映到协调台；批次未完成前不得导出公开通告。" />

  <div class="review-grid">
    <article class="card">
      <div class="panel-head"><div><h2>会签意见</h2><p>原意见不可覆盖，处理动作进入审计记录</p></div><a-tag color="orange">{{ store.scheme.comments.filter((item) => item.status === '待处理').length }} 待处理</a-tag></div>
      <button v-for="comment in store.scheme.comments" :key="comment.id" class="comment" :class="{ active: store.selectedCommentId === comment.id }" @click="store.selectedCommentId = comment.id">
        <div class="comment-head"><span>{{ comment.unit }}</span><b>{{ comment.author }}</b><a-tag :color="comment.status === '已接受' ? 'green' : comment.status === '已退回' ? 'red' : 'orange'">{{ comment.status }}</a-tag></div>
        <p>{{ comment.content }}</p><small v-if="comment.condition">条件：{{ comment.condition }}</small><em>锚点 {{ comment.segmentId }}</em>
        <div class="chips"><a-tag v-if="comment.stale" color="orange">阶段变化 · 待重算</a-tag><a-tag v-if="comment.frozen" color="blue">已冻结依据</a-tag></div>
      </button>
    </article>
    <div class="right">
      <article class="card">
        <div class="panel-head"><div><h2>阶段条件处理</h2><p>{{ store.selectedComment?.segmentId }} · {{ store.selectedComment?.unit }}</p></div></div>
        <div v-if="store.selectedComment" class="condition"><b>要求条件</b><p>{{ store.selectedComment.condition || '无附加条件' }}</p><b>影响解释</b><p>{{ store.selectedComment.content }}</p><template v-if="store.selectedComment.frozen"><b>冻结依据</b><p class="frozen">{{ store.selectedComment.frozenBasis }}<small>（{{ store.selectedComment.frozenAt }} 接受时快照，阶段变化不失效）</small></p></template></div>
        <a-space><a-button status="danger" :disabled="store.selectedComment?.status !== '待处理'" @click="resolve(store.selectedComment!.id, '已退回')">退回方案</a-button><a-button type="primary" :disabled="store.selectedComment?.status !== '待处理'" @click="resolve(store.selectedComment!.id, '已接受')">接受条件</a-button></a-space>
      </article>
      <article class="card">
        <div class="panel-head"><div><h2>几何版本比较</h2><p>并排核对阶段起止、围挡与绕行</p></div><a-select v-model="selectedVersion" style="width:110px"><a-option v-for="version in versions" :key="version.id" :value="version.id">{{ version.id }}</a-option></a-select></div>
        <div class="version-list"><div v-for="version in versions" :key="version.id" :class="{ selected: selectedVersion === version.id }"><b>{{ version.id }} · {{ version.author }}</b><small>{{ version.time }}</small><p>{{ version.summary }}</p></div></div>
        <a-divider />
        <h3>阶段差异</h3><div class="diff"><a-tag color="red">修改</a-tag><span>ST-02 夜间封闭边界缩短 28 米，保留急救中心南门 4 米通道。</span></div><div class="diff"><a-tag color="green">新增</a-tag><span>江海大道口增加 2 名交通疏导员和临时信号配时方案。</span></div>
      </article>
    </div>
  </div>

  <article class="card mt16">
    <div class="panel-head"><div><h2>外部工程对账批次</h2><p>外部记录带工程编号与版本，同编号重复推送沿用第一次结果；重叠窗口保留双方并指出占用来源</p></div><a-tag :color="store.canExport ? 'green' : 'orange'">{{ store.pendingBatches.length }} 个未完成批次</a-tag></div>

    <div class="batch-list">
      <div v-for="batch in store.batches" :key="batch.id" class="batch">
        <div class="batch-head">
          <div><b>{{ batch.id }}</b><small>{{ batch.createdAt }}</small></div>
          <a-tag :color="batchStatusColor(batch.status)">{{ batchStatusText(batch.status) }}</a-tag>
        </div>
        <div class="batch-progress"><span>已写入 {{ batch.cursor }} / {{ batch.recordIds.length }}</span><a-progress :percent="Math.round((batch.cursor / batch.recordIds.length) * 100)" :show-text="false" size="small" /></div>
        <p v-if="batch.error" class="batch-error">断点：{{ batch.error }}</p>
        <div class="batch-actions">
          <a-button v-if="batch.status === 'pending' || batch.status === 'failed'" type="primary" size="small" :loading="isBatchProcessing(batch)" @click="runBatch(batch.id)">{{ batch.status === 'failed' ? '从断点恢复' : '开始对账' }}</a-button>
          <a-tag v-if="batch.status === 'done'" color="green">已完成 · 结果已写入</a-tag>
        </div>
      </div>
    </div>

    <a-divider />
    <h3>外部记录</h3>
    <div class="record-list">
      <div v-for="rec in store.externalRecords" :key="rec.id" class="record">
        <div class="record-main">
          <b>{{ rec.engineeringNo }}</b><a-tag color="gray">v{{ rec.version }}</a-tag><a-tag :color="store.externalRecordStatus(rec).color">{{ store.externalRecordStatus(rec).label }}</a-tag>
        </div>
        <small v-if="rec.project">{{ rec.project }}</small>
        <small v-if="rec.kind === 'window'">{{ rec.start }} → {{ rec.end }} · 占用{{ rec.lanes }}</small>
        <small v-else>撤单回执 · 撤回 {{ rec.receiptFor }} · {{ rec.reason }}</small>
      </div>
    </div>
  </article>
</template>

<style scoped>
.mb16{margin-bottom:16px}.mt16{margin-top:16px}
.review-grid{display:grid;grid-template-columns:1fr 1.15fr;gap:16px}.right{display:grid;gap:16px;height:fit-content}.panel-head{display:flex;justify-content:space-between;margin-bottom:12px}.panel-head h2{font-size:17px;margin:0 0 4px}.panel-head p{color:#7a8798;font-size:12px;margin:0}.comment{display:block;width:100%;text-align:left;border:1px solid #e7ebf1;background:#fff;border-radius:7px;padding:13px;margin-bottom:9px;color:inherit;cursor:pointer}.comment:hover,.comment.active{border-color:#2563eb;background:#f5f8ff}.comment-head{display:flex;align-items:center;gap:8px}.comment-head>span{display:grid;place-items:center;width:36px;height:36px;border-radius:6px;background:#eef2f7;font-weight:800}.comment-head b{flex:1}.comment p{margin:9px 0 5px;color:#475569}.comment small,.comment em{display:block;color:#7a8798}.comment em{margin-top:6px;font-style:normal}.chips{display:flex;gap:6px;margin-top:8px}.condition p{color:#475569}.condition p.frozen{color:#2563eb;background:#eff6ff;border-left:3px solid #2563eb;padding:8px 10px;border-radius:4px;margin-top:4px}.condition p.frozen small{display:block;color:#7a8798;margin-top:2px}.version-list>div{padding:11px;border:1px solid #edf0f5;border-radius:6px;margin-bottom:7px}.version-list>div.selected{border-color:#2563eb;background:#f5f8ff}.version-list b,.version-list small{display:block}.version-list small{color:#7a8798;margin-top:3px}.version-list p{margin:7px 0 0;color:#475569}.diff{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid #edf0f5}
.batch-list{display:grid;gap:10px}.batch{border:1px solid #e7ebf1;border-radius:7px;padding:12px}.batch-head{display:flex;justify-content:space-between;align-items:center}.batch-head b{display:block}.batch-head small{color:#7a8798}.batch-progress{display:flex;align-items:center;gap:10px;margin:10px 0 6px}.batch-progress span{color:#475569;font-size:13px;white-space:nowrap}.batch-progress :deep(.arco-progress){flex:1}.batch-error{color:#e11d48;font-size:13px;margin:4px 0 8px}.batch-actions{display:flex;gap:8px}
.record-list{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.record{border:1px solid #edf0f5;border-radius:6px;padding:10px}.record-main{display:flex;align-items:center;gap:6px;margin-bottom:4px}.record-main b{font-size:13px}.record small{display:block;color:#7a8798;font-size:12px;margin-top:2px}
@media(max-width:980px){.review-grid{grid-template-columns:1fr}.record-list{grid-template-columns:1fr}}
</style>
