/* ============================================================
   AB 实验分析模块
   ============================================================ */

const PRODUCT_META = {
  P10:  { active_table: 'dw_ods_common_mn02.dm_mn02_player_active_info', uid: 'account_id' },
  SKB:  { active_table: 'dw_ods_common_mn04.dm_mn04_player_active_info', uid: 'account_id' },
  UNO:  { active_table: 'dw_ods_mn01.dm_mn01_player_active_info',         uid: 'role_id' },
  UNO2: { active_table: 'dw_ods_mn08.dm_mn08_player_active_info',         uid: 'role_id',
          note: 'UNO2 广告明细另见 dw_ods_mn08.c_client_app_ad_log；安卓 advalue /1000000' },
};

const METRIC_LABELS = {
  transfer_rate: '3PP 转移比例', ARPU: 'ARPU', pay_rate: '付费率',
  revenue: '收入', retention: '留存率', engagement: '活跃/参与度',
  retention_d7: 'D7 留存', crash_rate: '崩溃率', session_time: '会话时长',
};

document.addEventListener('DOMContentLoaded', () => {
  FF.init();

  FF.initWizard([
    { title: '背景', question: '什么实验、什么时间？', explain: '选产品，写实验目的，填日期。', example: '<b>例：</b>P10 RM弹窗实验，6/1~6/14' },
    { title: '分组', question: '实验组和对照组怎么分？', explain: '填标签名和分组字段。', example: '<b>例：</b>实验组 rm_on / 对照组 rm_off' },
    { title: '指标', question: '看哪些指标？', explain: '选核心指标 + 护栏 + 下钻维度。', example: '<b>例：</b>核心看 3PP 转移比例，护栏看 ARPU' },
    { title: '数据源', question: '数据从哪来？', explain: '填主键，贴埋点/历史 SQL。', example: '<b>例：</b>account_id + pay_order_log 文档' },
    { title: '问题', question: '报告要回答什么？', explain: '勾选常用的，或自己写。', example: '<b>例：</b>"是否显著？" "建议全量吗？"' },
  ]);

  // 产品 radio
  document.querySelectorAll('#chips-ab-product .chip').forEach(chip => {
    const inp = chip.querySelector('input');
    inp.addEventListener('change', () => {
      chip.closest('.chips').querySelectorAll('.chip').forEach(c => c.classList.remove('checked'));
      chip.classList.add('checked');
      document.getElementById('product').value = inp.value;
    });
  });

  // 问题预设
  document.querySelectorAll('#chips-ab-presetq input').forEach(inp => {
    FF.wireChip(inp.closest('.chip'));
    inp.addEventListener('change', () => { if (inp.checked) addQ({ question: inp.value }); });
  });

  // 动态行
  let qIdx = 0;
  const qDyn = FF.initDynamic('ab-q-rows', 'add-ab-q', (d = {}) => {
    qIdx++;
    return `<div class="qhead"><span class="qtag">Q${qIdx}</span></div>
      <input type="text" data-f="question" placeholder="分析问题" style="margin-bottom:6px" value="${FF.esc(d.question || '')}">`;
  }, { rowClass: 'question-block', initial: [{}] });
  function addQ(d) { qDyn.addRow(d); }

  FF.initDynamic('ab-log-ref-rows', 'add-ab-log-ref', (d = {}) =>
    `<input type="text" data-f="log_name" placeholder="埋点名" value="${d.log_name || ''}" style="flex:0 0 160px;">
     <input type="text" data-f="doc_url" placeholder="Confluence 链接" value="${d.doc_url || ''}">
     <input type="text" data-f="fields" placeholder="可用字段" value="${d.fields || ''}">`,
    { initial: [] }
  );

  document.getElementById('btn-reset').addEventListener('click', () => { if (confirm('确认重置？')) location.reload(); });

  document.getElementById('ab-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!FF.validate(e.target)) return;
    const data = collect();
    FF.renderArtifacts([
      { key: 'sql', label: '① SQL Prompt', content: buildSqlPrompt(data) },
      { key: 'contract', label: '② 分析契约', content: buildContract(data) },
      { key: 'json', label: '③ JSON', content: JSON.stringify(data, null, 2) },
    ], { collectFn: collect });
  });
});

function collect() {
  return {
    module: 'ab_test',
    product: FF.val('product'),
    project: FF.val('product') + ' AB实验 - ' + (FF.val('ab_goal') || '').slice(0, 20),
    goal: FF.val('ab_goal'),
    date_range: [FF.val('date_start'), FF.val('date_end')],
    aa_range: [FF.val('aa_start'), FF.val('aa_end')],
    treat_label: FF.val('treat_label'),
    ctrl_label: FF.val('ctrl_label'),
    group_col: FF.val('group_col'),
    population_filter: FF.val('population_filter'),
    metrics: FF.getCheckedChips('ab_metrics'),
    guardrails: FF.getCheckedChips('ab_guardrails'),
    dims: FF.getCheckedChips('ab_dims'),
    pk: FF.val('pk'),
    log_refs: FF.collectRows('ab-log-ref-rows', ['log_name', 'doc_url', 'fields']),
    sql_ref: FF.val('ab_sql_ref'),
    questions: FF.collectRows('ab-q-rows', ['question']),
    notes: FF.val('notes'),
  };
}

function buildSqlPrompt(d) {
  const meta = PRODUCT_META[d.product] || {};
  const mList = d.metrics.map(m => METRIC_LABELS[m] || m).join('、');
  const gList = d.guardrails.map(m => METRIC_LABELS[m] || m).join('、');
  const L = [];
  L.push('# 角色');
  L.push('你是资深数据分析师，精通 Presto/Trino 和 AB 实验分析。请编写取数 SQL。');
  L.push('');
  L.push('# 实验背景');
  L.push(`- 实验：${d.goal}`);
  L.push(`- 产品：${d.product}`);
  L.push(`- 实验期：${d.date_range[0]} ~ ${d.date_range[1]}`);
  if (d.aa_range[0]) L.push(`- AA 基线期：${d.aa_range[0]} ~ ${d.aa_range[1]}`);
  L.push(`- 实验组：${d.treat_label}　对照组：${d.ctrl_label}`);
  if (d.group_col) L.push(`- 分组字段：${d.group_col}`);
  if (d.population_filter) L.push(`- 人群过滤：${d.population_filter}`);
  L.push('');
  L.push('# 数据源');
  L.push(`- 主表：${meta.active_table || '（请确认）'}`);
  L.push(`- 主键：${d.pk || meta.uid}`);
  L.push('- 引擎：Presto/Trino；UPPER(client)=\'APP\'');
  if (meta.note) L.push(`- ⚠️ ${meta.note}`);
  L.push('');
  L.push('# 指标');
  L.push(`- 核心指标：${mList}`);
  if (gList) L.push(`- 护栏指标：${gList}`);
  if (d.dims.length) L.push(`- 下钻维度：${d.dims.join('、')}`);
  L.push('');
  L.push('# SQL 要求');
  L.push('1. 分 CTE：① 用户分组分配 → ② 指标计算 → ③ 分组聚合对比');
  L.push('2. 输出：group_label, metric_name, value_treat, value_ctrl, diff, diff_pct');
  L.push('3. 如有 AA 期，同样结构输出 AA 期对比');
  if (d.dims.length) L.push('4. 每个维度值单独一组对比行');
  L.push('5. 比率指标标注分子分母');
  if (d.log_refs.length) {
    L.push('');
    L.push('# 埋点参考');
    d.log_refs.forEach(r => {
      L.push(`- **${r.log_name}**${r.doc_url ? ' 文档:' + r.doc_url : ''}${r.fields ? ' 字段:' + r.fields : ''}`);
    });
  }
  if (d.sql_ref) { L.push(''); L.push('# 历史 SQL 参考'); L.push('```sql'); L.push(d.sql_ref); L.push('```'); }
  if (d.notes) { L.push(''); L.push('# 补充'); L.push(d.notes); }
  return L.join('\n');
}

function buildContract(d) {
  const L = [];
  L.push('# AB 实验分析契约');
  L.push('');
  L.push('## 1. 实验信息');
  L.push(`- 实验：${d.goal}`);
  L.push(`- 产品：${d.product}　时间：${d.date_range[0]} ~ ${d.date_range[1]}`);
  L.push(`- 分组：实验组「${d.treat_label}」vs 对照组「${d.ctrl_label}」`);
  if (d.aa_range[0]) L.push(`- AA 基线：${d.aa_range[0]} ~ ${d.aa_range[1]}`);
  L.push('');
  L.push('## 2. 指标体系');
  L.push(`- 核心指标：${d.metrics.map(m => METRIC_LABELS[m] || m).join('、')}`);
  if (d.guardrails.length) L.push(`- 护栏指标：${d.guardrails.map(m => METRIC_LABELS[m] || m).join('、')}`);
  if (d.dims.length) L.push(`- 下钻维度：${d.dims.join('、')}`);
  L.push('');
  L.push('## 3. 报告章节');
  d.questions.forEach((q, i) => { L.push(`### 第 ${i+1} 章：${q.question}`); L.push(''); });
  L.push('## 4. 分析方法');
  L.push('- 独立样本 t 检验 / Mann-Whitney U 检验（按数据分布选择）');
  L.push('- 如有 AA 期：DID（双重差分）校正');
  L.push('- 显著性标准：p < 0.05');
  L.push('- 效应量：绝对差异 + 相对变化率');
  L.push('');
  L.push('## 5. 必备注意事项');
  L.push('- 检查分组均衡性（样本量、基线特征）');
  L.push('- 确认无 SRM（样本比例不匹配）');
  L.push('- 护栏指标即使不显著也须报告方向');
  L.push('');
  L.push('## 6. 输出物');
  L.push('- HTML 报告（ECharts 图表 + 结论）');
  L.push('- 飞书文档 + 卡片');
  return L.join('\n');
}
