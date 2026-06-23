/* ============================================================
   留存 & LTV 分析模块
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  FF.init();

  FF.initWizard([
    { title: 'Cohort', question: '哪批用户、什么时间？', explain: '选产品、Cohort 日期、用户范围。', example: '<b>例：</b>P10 新注册用户，6/1~6/30' },
    { title: '留存/LTV', question: '看哪些留存节点和 LTV？', explain: '选留存天数 + LTV 类型 + 时间窗口。', example: '<b>例：</b>D1/D7/D30 + IAA LTV LT7~LT180' },
    { title: '对比', question: '按什么维度对比？', explain: '选分组维度，不对比就跳过。', example: '<b>例：</b>分平台 + 分广告类型(RV/INT)' },
    { title: '数据源', question: '数据从哪来？', explain: '填主键、收入字段、贴参考。', example: '<b>例：</b>account_id + ad_revenue 字段' },
  ]);

  // 产品 radio
  document.querySelectorAll('#chips-ret-product .chip').forEach(chip => {
    const inp = chip.querySelector('input');
    inp.addEventListener('change', () => {
      chip.closest('.chips').querySelectorAll('.chip').forEach(c => c.classList.remove('checked'));
      chip.classList.add('checked');
      document.getElementById('product').value = inp.value;
    });
  });

  FF.initDynamic('ret-log-ref-rows', 'add-ret-log-ref', (d = {}) =>
    `<input type="text" data-f="log_name" placeholder="表名/埋点" value="${d.log_name || ''}" style="flex:0 0 160px;">
     <input type="text" data-f="doc_url" placeholder="文档链接" value="${d.doc_url || ''}">
     <input type="text" data-f="fields" placeholder="字段" value="${d.fields || ''}">`,
    { initial: [] }
  );

  document.getElementById('btn-reset').addEventListener('click', () => { if (confirm('确认重置？')) location.reload(); });

  document.getElementById('ret-form').addEventListener('submit', e => {
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
    module: 'retention_ltv',
    product: FF.val('product'),
    project: FF.val('product') + ' 留存LTV分析',
    goal: FF.val('ret_goal'),
    cohort_range: [FF.val('cohort_start'), FF.val('cohort_end')],
    user_scope: document.querySelector('input[name="user_scope"]:checked')?.value || 'new_users',
    ret_days: FF.getCheckedChips('ret_days'),
    ret_type: document.querySelector('input[name="ret_type"]:checked')?.value || 'classic',
    ltv_type: FF.getCheckedChips('ltv_type'),
    ltv_windows: FF.getCheckedChips('ltv_windows'),
    dims: FF.getCheckedChips('ret_dims'),
    pk: FF.val('pk'),
    revenue_col: FF.val('revenue_col'),
    log_refs: FF.collectRows('ret-log-ref-rows', ['log_name', 'doc_url', 'fields']),
    sql_ref: FF.val('ret_sql_ref'),
    notes: FF.val('ret_notes'),
  };
}

function buildSqlPrompt(d) {
  const PRODUCT_META = {
    P10: { table: 'dw_ods_common_mn02.dm_mn02_player_active_info', uid: 'account_id' },
    SKB: { table: 'dw_ods_common_mn04.dm_mn04_player_active_info', uid: 'account_id' },
    UNO: { table: 'dw_ods_mn01.dm_mn01_player_active_info', uid: 'role_id' },
    UNO2: { table: 'dw_ods_mn08.dm_mn08_player_active_info', uid: 'role_id', note: 'UNO2 advalue 安卓需 /1000000' },
  };
  const meta = PRODUCT_META[d.product] || {};
  const L = [];
  L.push('# 角色');
  L.push('你是资深数据分析师，精通 Presto/Trino，擅长留存和 LTV 分析。');
  L.push('');
  L.push('# 分析背景');
  L.push(`- 产品：${d.product}　Cohort：${d.cohort_range[0]} ~ ${d.cohort_range[1]}`);
  L.push(`- 用户范围：${d.user_scope === 'new_users' ? '新注册用户 (been_reg_days=1)' : d.user_scope}`);
  if (d.goal) L.push(`- 目标：${d.goal}`);
  L.push('');
  L.push('# 留存定义');
  L.push(`- 类型：${d.ret_type === 'classic' ? '经典留存（第N天回访）' : '滚动留存（第N天内回访）'}`);
  L.push(`- 节点：${d.ret_days.join(', ')}`);
  L.push('');
  L.push('# LTV 定义');
  L.push(`- LTV 类型：${d.ltv_type.join(', ')}`);
  L.push(`- 时间窗口（累积式）：${d.ltv_windows.join(', ')}`);
  L.push('- IAA LTV = 广告收入 / 用户数；IAP LTV = 付费收入 / 用户数');
  L.push('');
  L.push('# 数据源');
  L.push(`- 主表：${meta.table || '（请确认）'}`);
  L.push(`- 主键：${d.pk || meta.uid}　收入字段：${d.revenue_col || '表内聚合字段'}`);
  L.push('- 引擎：Presto/Trino；UPPER(client)=\'APP\'；平台 IN (\'IOS\',\'ANDROID\')');
  if (meta.note) L.push(`- ⚠️ ${meta.note}`);
  L.push('');
  if (d.dims.length) { L.push('# 对比维度'); L.push(`- ${d.dims.join('、')}`); L.push(''); }
  L.push('# SQL 要求');
  L.push('1. CTE 分层：① 新用户筛选 → ② 日维度活跃/收入 → ③ 生命周期聚合(LT7/30/60...) → ④ 留存率计算');
  L.push('2. 留存率 = 第N天活跃用户数 / Cohort 用户数');
  L.push('3. LTV 累积式：LTx = 用户注册后 x 天内总收入 / Cohort 用户数');
  if (d.dims.length) L.push('4. 平台汇总用 CUBE(platform) 自动生成 ALL');
  if (d.log_refs.length) { L.push(''); L.push('# 埋点参考'); d.log_refs.forEach(r => L.push(`- ${r.log_name} ${r.doc_url || ''} ${r.fields || ''}`)); }
  if (d.sql_ref) { L.push(''); L.push('# 历史 SQL'); L.push('```sql'); L.push(d.sql_ref); L.push('```'); }
  if (d.notes) { L.push(''); L.push('# 补充'); L.push(d.notes); }
  return L.join('\n');
}

function buildContract(d) {
  const L = [];
  L.push('# 留存 & LTV 分析契约');
  L.push('');
  L.push('## 1. Cohort 定义');
  L.push(`- 产品：${d.product}　范围：${d.user_scope}`);
  L.push(`- 时间：${d.cohort_range[0]} ~ ${d.cohort_range[1]}`);
  L.push('');
  L.push('## 2. 指标体系');
  L.push(`- 留存节点：${d.ret_days.join(', ')}（${d.ret_type === 'classic' ? '经典' : '滚动'}）`);
  L.push(`- LTV 类型：${d.ltv_type.join(', ')}`);
  L.push(`- LTV 时间窗口：${d.ltv_windows.join(', ')}`);
  if (d.dims.length) L.push(`- 对比维度：${d.dims.join('、')}`);
  L.push('');
  L.push('## 3. 图表规划');
  L.push('- 留存曲线（折线图，X 轴为天数，多 Cohort/维度值对比）');
  L.push('- LTV 趋势（折线图，X 轴为 LT 窗口，分产品/平台/广告类型）');
  L.push('- 留存热力图（Cohort × 天数矩阵）');
  L.push('');
  L.push('## 4. 基准参考');
  L.push('- 行业休闲游戏 D1 留存 ≈ 35-40%，D7 ≈ 15-20%，D30 ≈ 5-8%');
  L.push('- MG 历史 IAA LTV：P10 LT30 ≈ $1.4，LT180 ≈ $2.2（团队基线）');
  L.push('');
  L.push('## 5. 输出物');
  L.push('- HTML 报告（ECharts 留存曲线 + LTV 趋势 + 热力图）');
  L.push('- 飞书文档 + 卡片');
  return L.join('\n');
}
