/* ============================================================
   漏斗转化分析模块
   内置 MG 团队真实漏斗预设（3PP支付、UNO周报转化、RM弹窗）
   ============================================================ */

const PRESETS = {
  '3pp_payment': [
    { name: '访问游戏中心', event: 'visit', metric: '访问用户数' },
    { name: '登录成功', event: 'login_success', metric: '登录用户数' },
    { name: '点击购买', event: 'click_buy', metric: '点击购买用户数' },
    { name: '下单成功', event: 'order_created', metric: '下单用户数' },
    { name: '支付成功', event: 'payment_success', metric: '支付成功用户数' },
  ],
  'weekly_report': [
    { name: '拍脸图触达', event: 'popup_show (wndid=688)', metric: 'DAU触达数' },
    { name: '拍脸图点击', event: 'popup_click', metric: '点击用户数' },
    { name: '周报P1浏览', event: 'weeklyreport_p1', metric: 'P1用户数' },
    { name: '周报P5完成', event: 'weeklyreport_p5', metric: 'P5用户数' },
    { name: '3PP跳转', event: 'store_redirect', metric: '跳转用户数' },
    { name: '3PP登录', event: 'store_login', metric: '登录用户数' },
    { name: '3PP付费', event: 'store_payment', metric: '付费用户数' },
  ],
  'rm_popup': [
    { name: '弹窗展示', event: 'rm_popup_show', metric: '展示用户数' },
    { name: '用户点击(选择渠道)', event: 'rm_popup_click', metric: '点击用户数' },
    { name: '跳转支付页', event: 'rm_redirect_pay', metric: '跳转用户数' },
    { name: '支付成功', event: 'rm_pay_success', metric: '支付成功用户数' },
  ],
};

document.addEventListener('DOMContentLoaded', () => {
  FF.init();

  FF.initWizard([
    { title: '背景', question: '分析哪个漏斗？', explain: '选产品、填目的、选日期。', example: '<b>例：</b>游戏中心 3PP 支付漏斗，6 月数据' },
    { title: '步骤', question: '漏斗有哪些步骤？', explain: '选预设快速填充，也可手动改。', example: '<b>最常用：</b>3PP 支付漏斗（5步）' },
    { title: '指标', question: '看哪些指标、按什么拆？', explain: '选指标 + 下钻维度。', example: '<b>例：</b>步骤转化率 + 按国家/平台拆' },
    { title: '数据源', question: '数据从哪来？', explain: '填主键、贴埋点/历史SQL。', example: '<b>例：</b>game_aid + game_client_log' },
    { title: '问题', question: '报告要回答什么？', explain: '勾选常用的或自己写。', example: '<b>例：</b>"哪一步流失最多？"' },
  ]);

  // 产品 radio
  document.querySelectorAll('#chips-fn-product .chip').forEach(chip => {
    const inp = chip.querySelector('input');
    inp.addEventListener('change', () => {
      chip.closest('.chips').querySelectorAll('.chip').forEach(c => c.classList.remove('checked'));
      chip.classList.add('checked');
      document.getElementById('product').value = inp.value;
    });
  });

  // 漏斗步骤动态行
  let stepIdx = 0;
  const stepDyn = FF.initDynamic('fn-step-rows', 'add-fn-step', (d = {}) => {
    stepIdx++;
    return `<span style="flex:none;width:24px;font-weight:700;color:var(--brand-1);">${stepIdx}</span>
      <input type="text" data-f="name" placeholder="步骤名称" value="${FF.esc(d.name || '')}" style="flex:0 0 140px;">
      <input type="text" data-f="event" placeholder="事件/埋点标识" value="${FF.esc(d.event || '')}">
      <input type="text" data-f="metric" placeholder="衡量指标" value="${FF.esc(d.metric || '')}">`;
  }, { rowClass: 'dyn-row', initial: [] });

  // 预设填充
  document.querySelectorAll('#chips-fn-preset .chip').forEach(chip => {
    const inp = chip.querySelector('input');
    inp.addEventListener('change', () => {
      chip.closest('.chips').querySelectorAll('.chip').forEach(c => c.classList.remove('checked'));
      chip.classList.add('checked');
      const key = inp.value;
      if (PRESETS[key]) {
        FF.clearContainer('fn-step-rows');
        stepIdx = 0;
        PRESETS[key].forEach(s => stepDyn.addRow(s));
      }
    });
  });

  // 问题预设
  document.querySelectorAll('#chips-fn-presetq input').forEach(inp => {
    FF.wireChip(inp.closest('.chip'));
    inp.addEventListener('change', () => { if (inp.checked) qDyn.addRow({ question: inp.value }); });
  });

  let qIdx = 0;
  const qDyn = FF.initDynamic('fn-q-rows', 'add-fn-q', (d = {}) => {
    qIdx++;
    return `<div class="qhead"><span class="qtag">Q${qIdx}</span></div>
      <input type="text" data-f="question" placeholder="分析问题" value="${FF.esc(d.question || '')}">`;
  }, { rowClass: 'question-block', initial: [{}] });

  // 埋点参考
  FF.initDynamic('fn-log-ref-rows', 'add-fn-log-ref', (d = {}) =>
    `<input type="text" data-f="log_name" placeholder="埋点/表名" value="${d.log_name || ''}" style="flex:0 0 160px;">
     <input type="text" data-f="doc_url" placeholder="Confluence 链接" value="${d.doc_url || ''}">
     <input type="text" data-f="fields" placeholder="可用字段" value="${d.fields || ''}">`,
    { initial: [] }
  );

  document.getElementById('btn-reset').addEventListener('click', () => { if (confirm('确认重置？')) location.reload(); });

  document.getElementById('funnel-form').addEventListener('submit', e => {
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
    module: 'funnel',
    product: FF.val('product'),
    project: FF.val('product') + ' 漏斗分析',
    goal: FF.val('fn_goal'),
    date_range: [FF.val('date_start'), FF.val('date_end')],
    steps: FF.collectRows('fn-step-rows', ['name', 'event', 'metric']),
    metrics: FF.getCheckedChips('fn_metrics'),
    dims: FF.getCheckedChips('fn_dims'),
    is_ab: document.querySelector('input[name="fn_is_ab"]:checked')?.value || 'no',
    pk: FF.val('pk'),
    date_col: FF.val('date_col'),
    log_refs: FF.collectRows('fn-log-ref-rows', ['log_name', 'doc_url', 'fields']),
    sql_ref: FF.val('fn_sql_ref'),
    questions: FF.collectRows('fn-q-rows', ['question']),
    notes: FF.val('fn_notes'),
  };
}

function buildSqlPrompt(d) {
  const L = [];
  L.push('# 角色');
  L.push('你是资深数据分析师，精通 Presto/Trino 和漏斗分析。请编写取数 SQL。');
  L.push('');
  L.push('# 分析背景');
  L.push(`- 目标：${d.goal}`);
  L.push(`- 产品：${d.product}　时间：${d.date_range[0]} ~ ${d.date_range[1]}`);
  L.push('');
  L.push('# 漏斗步骤定义（有序）');
  d.steps.forEach((s, i) => L.push(`${i+1}. **${s.name}** — 事件: ${s.event || '(待定)'} — 指标: ${s.metric || '用户数'}`));
  L.push('');
  L.push('# 指标要求');
  L.push(`- 核心指标：${d.metrics.join('、')}`);
  if (d.dims.length) L.push(`- 下钻维度：${d.dims.join('、')}`);
  if (d.is_ab === 'yes') L.push('- 需按 AB 实验组对比漏斗');
  L.push('');
  L.push('# 数据源');
  L.push(`- 主键：${d.pk}　日期字段：${d.date_col || 'date'}`);
  L.push('- 引擎：Presto/Trino；UPPER(client)=\'APP\'');
  L.push('');
  L.push('# SQL 要求');
  L.push('1. 每步一个 CTE，统计去重用户数');
  L.push('2. 最终 SELECT 输出：step_name, step_order, users, cvr_from_prev, cvr_from_first, drop_rate');
  if (d.dims.length) L.push('3. 每个维度值独立一组漏斗');
  L.push('4. 转化率显式标注分子分母');
  if (d.log_refs.length) { L.push(''); L.push('# 埋点参考'); d.log_refs.forEach(r => L.push(`- ${r.log_name}${r.doc_url ? ' ' + r.doc_url : ''}${r.fields ? ' 字段:' + r.fields : ''}`)); }
  if (d.sql_ref) { L.push(''); L.push('# 历史 SQL'); L.push('```sql'); L.push(d.sql_ref); L.push('```'); }
  if (d.notes) { L.push(''); L.push('# 补充'); L.push(d.notes); }
  return L.join('\n');
}

function buildContract(d) {
  const L = [];
  L.push('# 漏斗转化分析契约');
  L.push('');
  L.push('## 1. 漏斗定义');
  d.steps.forEach((s, i) => L.push(`${i+1}. ${s.name}（${s.event || '-'}）→ ${s.metric || '用户数'}`));
  L.push('');
  L.push('## 2. 报告章节');
  d.questions.forEach((q, i) => L.push(`### 第 ${i+1} 章：${q.question}`));
  L.push('');
  L.push('## 3. 图表规划');
  L.push('- 漏斗图：整体 + 分维度');
  L.push('- 步骤转化率柱状图');
  if (d.dims.length) L.push('- 分组对比：' + d.dims.join(' × '));
  L.push('');
  L.push('## 4. 基准参考');
  L.push('- 3PP 支付成功率行业基准 ≈ 75%（PayerMax 休闲游戏参考）');
  L.push('- 访问→付费整体转化率基线 ≈ 0.7%（MG 历史数据）');
  L.push('');
  L.push('## 5. 输出物');
  L.push('- HTML 报告 + 飞书文档/卡片');
  return L.join('\n');
}
