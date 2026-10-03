<script setup lang="ts">
import { ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { useSchemeStore } from '../store/scheme'
import type { ExternalReceipt } from '../types'

const store = useSchemeStore()
const resuming = ref('')

type PushRecord = Omit<ExternalReceipt, 'receivedAt' | 'status'>

async function push(records: PushRecord[], label: string) {
  const { batch, reused } = await store.ingestExternal(records)
  reused.forEach((line) => Message.info(line))
  if (!batch) return
  if (batch.state === '已完成') Message.success(`${label}：批次 ${batch.id} 对账完成，写入冲突 ${batch.conflicts.length} 条`)
  else Message.error(`${label}：批次 ${batch.id} 写入失败（${batch.error}），可从断点恢复`)
}
function pushWindow() {
  void push([
    { projectNo: 'EXT-2026-121', version: 1, kind: '施工窗口', corridor: '江海大道东段', start: '2026-10-28', end: '2026-11-02', lanes: '夜间占用快车道 2 条' },
    { projectNo: 'EXT-2026-122', version: 2, kind: '占用车道', corridor: '云河路辅道', start: '2026-10-10', end: '2026-10-14', lanes: '占用非机动车道' },
  ], '相邻工程平台推送')
}
function pushDuplicate() {
  void push([{ projectNo: 'EXT-2026-121', version: 2, kind: '施工窗口', corridor: '江海大道东段', start: '2026-10-29', end: '2026-11-03', lanes: '夜间占用快车道 2 条' }], '重复推送')
}
function pushCancel() {
  void push([{ projectNo: 'EXT-2026-114', version: 4, kind: '撤单回执', corridor: '江海大道东段', start: '2026-10-26', end: '2026-10-30', lanes: '撤回全部占用' }], '撤单回执')
}
async function resume(id: string) {
  resuming.value = id
  await store.resumeBatch(id)
  resuming.value = ''
  const batch = store.ledger.batches.find((item) => item.id === id)
  if (batch?.state === '已完成') Message.success(`批次 ${id} 已按原批次从断点恢复并完成`)
  else Message.error(`批次 ${id} 恢复后仍失败：${batch?.error ?? '未知原因'}`)
}
const stateColor = (state: string) => (state === '已完成' ? 'green' : state === '写入失败' ? 'red' : 'orange')
</script>

<template>
  <section class="page-head compact">
    <div><p class="eyebrow">相邻工程平台 → 封路协调台</p><h1>外部工程对账批次</h1><p>施工窗口、占用车道与撤单回执按工程编号幂等入账；重叠窗口保留双方并标注占用来源。</p></div>
    <a-space>
      <a-checkbox v-model="store.failNextWrite">模拟下次写入失败</a-checkbox>
      <a-button type="primary" @click="pushWindow">推送施工窗口批次</a-button>
      <a-button @click="pushDuplicate">重复推送（幂等）</a-button>
      <a-button status="danger" @click="pushCancel">推送撤单回执</a-button>
    </a-space>
  </section>
  <a-alert v-if="store.exportBlocked" type="warning" class="mb16" :title="`存在未处理完的对账批次（${store.pendingBatches.map((batch) => batch.id).join('、')}），公开通告导出已锁定`" />
  <div class="recon-grid">
    <article class="card">
      <div class="panel-head"><div><h2>对账批次</h2><p>写入失败按原批次从断点恢复，不留半写结果</p></div><a-tag color="orange">{{ store.pendingBatches.length }} 未结</a-tag></div>
      <div v-for="batch in store.ledger.batches" :key="batch.id" class="batch">
        <div class="batch-head">
          <b>{{ batch.id }}</b>
          <a-tag :color="stateColor(batch.state)">{{ batch.state }}</a-tag>
          <span class="progress">断点 {{ batch.checkpoint }} / {{ batch.receipts.length }} 步</span>
          <a-button v-if="batch.state === '写入失败'" size="mini" type="primary" :loading="resuming === batch.id" @click="resume(batch.id)">从断点恢复</a-button>
        </div>
        <p v-if="batch.error" class="error">{{ batch.error }}</p>
        <div v-for="receipt in batch.receipts" :key="`${receipt.projectNo}-${receipt.kind}`" class="line">
          <span>{{ receipt.projectNo }} · {{ receipt.kind }} v{{ receipt.version }}</span>
          <small>{{ receipt.start }} → {{ receipt.end }}｜{{ receipt.corridor }}｜{{ receipt.lanes }}</small>
        </div>
        <small class="meta">入账 {{ batch.createdAt }} · 写入冲突 {{ batch.conflicts.length }} 条</small>
      </div>
    </article>
    <div class="right">
      <article class="card">
        <div class="panel-head"><div><h2>外部回执台账</h2><p>工程编号 + 类型幂等，撤单后不再参与冲突</p></div></div>
        <a-table :data="store.ledger.receipts" :pagination="false" row-key="projectNo" size="small">
          <template #columns>
            <a-table-column title="工程编号" data-index="projectNo" />
            <a-table-column title="类型" data-index="kind" :width="90" />
            <a-table-column title="版本" data-index="version" :width="60" />
            <a-table-column title="窗口" :width="180"><template #cell="{ record }">{{ record.start }} → {{ record.end }}</template></a-table-column>
            <a-table-column title="状态" :width="80"><template #cell="{ record }"><a-tag :color="record.status === '生效' ? 'green' : 'gray'">{{ record.status }}</a-tag></template></a-table-column>
          </template>
        </a-table>
      </article>
      <article class="card">
        <div class="panel-head"><div><h2>对账冲突（保留双方）</h2><p>阶段改期或封路线变化后立即失效重算</p></div><a-tag color="red">{{ store.ledger.conflicts.length }} 条</a-tag></div>
        <div v-for="item in store.ledger.conflicts" :key="item.id" class="conflict" :class="item.level === '高' ? 'red' : 'amber'">
          <div class="conflict-head"><b>{{ item.title }}</b><a-tag :color="item.level === '高' ? 'red' : 'orange'">{{ item.level }}</a-tag></div>
          <p>{{ item.detail }}</p>
          <small>双方：本地 {{ item.stageId }} × 外部 {{ item.externalProjectNo }}｜{{ item.source }}｜{{ item.basis }}</small>
        </div>
        <a-empty v-if="!store.ledger.conflicts.length" description="当前无对账冲突" />
      </article>
      <article class="card">
        <div class="panel-head"><div><h2>幂等台账</h2><p>同编号重复推送直接沿用第一次结果</p></div></div>
        <div v-for="(entry, key) in store.ledger.processed" :key="key" class="line">
          <span>{{ key }}</span>
          <small>{{ entry.result }}</small>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.recon-grid{display:grid;grid-template-columns:1fr 1.2fr;gap:16px}.right{display:grid;gap:16px;height:fit-content}.panel-head{display:flex;justify-content:space-between;margin-bottom:12px}.panel-head h2{font-size:17px;margin:0 0 4px}.panel-head p{color:#7a8798;font-size:12px;margin:0}.batch{border:1px solid #e7ebf1;border-radius:7px;padding:12px;margin-bottom:10px}.batch-head{display:flex;align-items:center;gap:10px}.batch-head b{flex:0 0 auto}.progress{color:#7a8798;font-size:12px;flex:1}.error{color:#e11d48;font-size:12px;margin:8px 0 0}.line{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid #f1f4f9}.line small{color:#7a8798;text-align:right}.meta{display:block;color:#7a8798;margin-top:8px}.conflict{padding:12px;border-radius:6px;margin-bottom:9px}.conflict.red{background:#fff1f2;border-left:3px solid #e11d48}.conflict.amber{background:#fff7ed;border-left:3px solid #f59e0b}.conflict-head{display:flex;justify-content:space-between;gap:8px}.conflict p{margin:7px 0;color:#475569}.conflict small{color:#7a8798}.mb16{margin-bottom:16px}
@media(max-width:1050px){.recon-grid{grid-template-columns:1fr}}
</style>
