/* ============================================================
   付费 / 收入分析模块 — 字段采集 + 产物生成
   ============================================================ */

// 团队产品口径（来自 .kiro/steering 数据字典）
const PRODUCT_META = {
  P10:  { active_table: 'dw_ods_common_mn02.dm_mn02_player_active_info', uid: 'account_id' },
  SKB:  { active_table: 'dw_ods_common_mn04.dm_mn04_player_active_info', uid: 'account_id' },
  UNO:  { active_table: 'dw_ods_mn01.dm_mn01_player_active_info',         uid: 'role_id' },
  UNO2: { active_table: 'dw_ods_mn08.dm_mn08_player_active_info',         uid: 'role_id',
          note: '广告/付费明细另见 dw_ods_mn08.c_client_app_ad_log；安卓金额字段需 /1000000' },
  ALL:  { active_table: '（多产品，按各自表 UNION）', uid: 'account_id / role_id（按产品）' },
};

const LABELS = {
  channels: { IAP: 'IAP 内购', '3PP_EMBED': '3PP 内嵌', '3PP_WEB': '3PP 主站', OTHER: '其他' },
  metrics: {
    ARPU: 'ARPU', ARPPU: 'ARPPU', pay_rate: '付费率', pay_count: '付费次数',
    iap_amount: 'IAP 金额', '3pp_amount': '3PP 金额', transfer_rate: '3PP 转移比例', total_revenue: '总收入',
  },
  user_metrics: {
    payers: '付费人数', new_payers: '新付费人数', back_payers: '回流付费人数',
    pay_freq: '付费频次', aov: '客单价',
  },
  dims: {
    platform: '设备平台', lifecycle: '生命周期(LT)', reg_days: '注册天数',
    '3pp_ratio': '3PP 比例分桶', product_type: '商品类型',
  },
};

// 指标 → 推荐图表（套用 data-visualization 技能规则）
const METRIC_CHART = {
  ARPU: '折线图(随时间/LT) 或 分组柱状图(分渠道对比)',
  ARPPU: '分组柱状图',
  pay_rate: '折线图 或 柱状图（含分母：付费人数/活跃人数）',
  pay_count: '柱状图',
  iap_amount: '堆叠面积图（与 3PP 构成对比）',
  '3pp_amount': '堆叠面积图',
  transfer_rate: '折线图（趋势）+ 实验组/对照组双线对比',
  total_revenue: '堆叠柱状图（IAP vs 3PP 构成）',
};

document.addEventListener('DOMContentLoaded', () => {
  FF.init();

  // Wizard 引导模式步骤定义
  FF.initWizard([
    {
      title: '背景',
      question: '分析哪个产品、哪段时间？',
      explain: '选产品 → 选日期 → 一句话写目的。',
      example: '<b>例：</b>P10，6月1日~6月30日，看 RM 弹窗效果',
    },
    {
      title: '北极星',
      question: '你最想盯住哪个数？',
      explain: '填一个公式或指标名。留空默认按 ARPU 处理。',
      example: '<b>例：</b>付费率、ARPU、毛利率、3PP转移比例 等任意公式',
    },
    {
      title: '看什么',
      question: '报告里要看哪些指标？',
      explain: '点亮你想看的，不确定就多选几个。',
      example: '<b>最常选：</b>ARPU + 付费率 + 3PP转移比例',
    },
    {
      title: '按啥拆',
      question: '需要按商品类型拆分看吗？',
      explain: '不需要就直接下一步。',
      example: '<b>例：</b>选 starpass + diamond 对比',
    },
    {
      title: '数据列',
      question: '数据有哪些列？',
      explain: '已根据你前面的选择自动生成。拖入 CSV 可覆盖。',
      example: '<b>最快：</b>把文件拖进来就行',
      onEnter: () => autoGenerateColumns(),
    },
    {
      title: '问题',
      question: '你想回答什么问题？',
      explain: '勾选常用的，或自己写 1~3 个。',
      example: '<b>例：</b>"转移比例有没有涨？"',
    },
    {
      title: '确认',
      question: '最后确认数据格式',
      explain: '选粒度、填主键，就完事了。',
      example: '<b>例：</b>用户级 + account_id',
    },
  ]);

  // 产品选择 radio chips → 同步到隐藏 select
  document.querySelectorAll('#chips-product-select .chip').forEach(chip => {
    const inp = chip.querySelector('input');
    inp.addEventListener('change', () => {
      chip.closest('.chips').querySelectorAll('.chip').forEach(c => c.classList.remove('checked'));
      chip.classList.add('checked');
      document.getElementById('product').value = inp.value;
    });
  });

  // 目标预设 radio chips → 同步到 textarea
  document.querySelectorAll('#chips-goal-presets .chip').forEach(chip => {
    const inp = chip.querySelector('input');
    inp.addEventListener('change', () => {
      chip.closest('.chips').querySelectorAll('.chip').forEach(c => c.classList.remove('checked'));
      chip.classList.add('checked');
      if (inp.value) {
        document.getElementById('goal').value = inp.value;
      } else {
        document.getElementById('goal').focus();
      }
    });
  });

  // 列映射动态行（初始为空，wizard 第5步自动生成）
  const mapDyn = FF.initDynamic('map-rows', 'add-map', (d = {}) =>
    `<input type="text" data-f="col" placeholder="CSV 列名" value="${d.col || ''}">
     <input type="text" data-f="meaning" placeholder="含义" value="${d.meaning || ''}">
     <select data-f="type">
       <option value="dimension"${d.type === 'dimension' ? ' selected' : ''}>维度</option>
       <option value="metric"${d.type === 'metric' ? ' selected' : ''}>指标(数值)</option>
       <option value="id"${d.type === 'id' ? ' selected' : ''}>主键/ID</option>
       <option value="date"${d.type === 'date' ? ' selected' : ''}>日期</option>
     </select>`,
    { initial: [] }
  );
  window.__addMapRow = (d) => mapDyn.addRow(d);

  // CSV 自动识别列名
  initCsvDetect();

  // 埋点/日志参考动态行
  FF.initDynamic('log-ref-rows', 'add-log-ref', (d = {}) =>
    `<input type="text" data-f="log_name" placeholder="埋点/日志名，如 pay_order_log" value="${d.log_name || ''}" style="flex:0 0 180px;">
     <input type="text" data-f="doc_url" placeholder="Confluence 文档链接" value="${d.doc_url || ''}">
     <input type="text" data-f="fields" placeholder="可获取的指标/字段，如：order_id, amount, channel" value="${d.fields || ''}">`,
    { initial: [] }
  );

  // 历史 SQL 参考动态行
  FF.initDynamic('sql-ref-rows', 'add-sql-ref', (d = {}) =>
    `<input type="text" data-f="sql_label" placeholder="指标/用途，如：P10 付费率趋势" value="${d.sql_label || ''}" style="flex:0 0 200px;margin-bottom:6px;">
     <textarea data-f="sql_code" placeholder="粘贴历史 SQL" rows="3" style="flex:1;min-height:60px;font-family:monospace;font-size:12px;">${d.sql_code || ''}</textarea>`,
    { rowClass: 'dyn-row', initial: [] }
  );

  // 常用付费问题：勾选即添加为章节
  document.querySelectorAll('#chips-preset-q input').forEach(inp => {
    FF.wireChip(inp.closest('.chip'));
    inp.addEventListener('change', () => {
      if (inp.checked) addQuestion({ question: inp.value });
    });
  });

  // 自定义商品类型 → 自动同步明细行
  initCustomProductSync();

  // 分析问题动态行
  window.__addQ = FF.initDynamic('q-rows', 'add-q', qRowHtml,
    { rowClass: 'question-block', initial: [{}] });

  // 重置
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('确认重置整个表单？')) location.reload();
  });

  // 提交
  document.getElementById('rev-form').addEventListener('submit', e => {
    e.preventDefault();
    // 快速模式下如果列映射为空，自动生成
    const existingRows = FF.collectRows('map-rows', ['col', 'meaning', 'type']);
    if (existingRows.length === 0) autoGenerateColumns();
    if (!FF.validate(e.target)) return;
    const data = collect();
    FF.renderArtifacts([
      { key: 'sql', label: '① SQL Prompt', content: buildSqlPrompt(data) },
      { key: 'contract', label: '② 分析契约 (Analysis Contract)', content: buildContract(data) },
      { key: 'json', label: '③ 结构化需求 JSON', content: JSON.stringify(data, null, 2) },
    ], { collectFn: collect });
  });
});

let qIndex = 0;
function qRowHtml(d = {}) {
  qIndex++;
  return `<div class="qhead">
      <span class="qtag">Q${qIndex}</span>
      <span style="font-size:12px;color:var(--text-3)">这个问题将成为报告的一个章节</span>
    </div>
    <input type="text" data-f="question" placeholder="分析问题，如：RM 弹窗是否提升了 3PP 转移比例？" style="margin-bottom:8px" value="${FF.esc(d.question || '')}">
    <input type="text" data-f="hint" placeholder="（选填）期望的对比/拆分，如：实验组 vs 对照组，分平台" value="${FF.esc(d.hint || '')}">`;
}
function addQuestion(d) { if (window.__addQ) window.__addQ.addRow(d); }

/* ---------- CSV 自动识别 ---------- */
function initCsvDetect() {
  const drop = document.getElementById('csv-drop');
  const file = document.getElementById('csv-file');
  const paste = document.getElementById('csv-paste');
  const detected = document.getElementById('csv-detected');

  const apply = (text) => {
    const cols = FF.parseCsvHeader(text);
    if (!cols.length) return;
    _csvUploadedManually = true;
    FF.clearContainer('map-rows');
    const typeMeaning = { id: '主键/ID', date: '日期', metric: '指标', dimension: '维度' };
    cols.forEach(c => {
      window.__addMapRow({ col: c.col, meaning: typeMeaning[c.type] || '', type: c.type });
    });
    detected.style.display = 'block';
    detected.textContent = `✓ 已识别 ${cols.length} 列：${cols.map(c => c.col).join(', ')}`;
  };

  if (drop && file) {
    drop.addEventListener('click', () => file.click());
    file.addEventListener('change', () => {
      const f = file.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => apply(r.result);
      r.readAsText(f, 'utf-8');
    });
    ['dragover', 'dragenter'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev =>
      drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
    drop.addEventListener('drop', e => {
      const f = e.dataTransfer.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => apply(r.result);
      r.readAsText(f, 'utf-8');
    });
  }
  if (paste) {
    paste.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); if (paste.value.trim()) apply(paste.value); }
    });
  }
}

/* ---------- 采集 ---------- */
function collect() {
  const metrics = FF.getCheckedChips('metrics');
  // 分组维度：常规 chip + 自定义输入合并
  const dims = FF.getCheckedChips('dims');
  const dimsCustom = FF.nonEmpty(FF.val('dims_custom').split(/[,，]/).map(s => s.trim()));
  // 商品类型：预设 chip + 自定义输入合并
  const productType = FF.getCheckedChips('product_type');
  const productCat = FF.getCheckedChips('product_cat');
  const productsFocusCustom = FF.nonEmpty(FF.val('products_focus').split(/[\s,，]+/));
  return {
    module: 'revenue_analysis',
    project: FF.val('product') + ' - ' + (FF.val('goal') || '付费收入分析').slice(0, 30),
    owner: FF.val('owner'),
    goal: FF.val('goal'),
    product: FF.val('product'),
    date_range: [FF.val('date_start'), FF.val('date_end')],
    north_star_formula: FF.val('transfer_formula'),
    products_focus: [...productType, ...productsFocusCustom],
    product_cat: productCat,
    price_buckets: FF.val('price_buckets'),
    metrics,
    user_metrics: FF.getCheckedChips('user_metrics'),
    dims: [...dims, ...dimsCustom],
    column_map: FF.collectRows('map-rows', ['col', 'meaning', 'type']),
    log_refs: FF.collectRows('log-ref-rows', ['log_name', 'doc_url', 'fields']),
    sql_refs: FF.collectRows('sql-ref-rows', ['sql_label', 'sql_code']),
    questions: FF.collectRows('q-rows', ['question', 'hint']),
    grain: FF.val('grain'),
    pk: FF.val('pk'),
    encoding: FF.val('encoding'),
    notes: FF.val('notes'),
  };
}

/* ---------- ① SQL Prompt ---------- */
function buildSqlPrompt(d) {
  const meta = PRODUCT_META[d.product] || {};
  const mList = d.metrics.map(m => LABELS.metrics[m] || m).join('、');
  const dims = d.dims.map(x => LABELS.dims[x] || x);
  const focus = (d.products_focus || []).join(' ');
  const L = [];
  L.push('# 角色');
  L.push('你是资深数据分析师，精通 Presto/Trino。请基于以下需求编写一段可直接执行的 SQL，用于付费/收入分析取数。');
  L.push('');
  L.push('# 分析背景');
  L.push(`- 项目：${d.project}`);
  L.push(`- 分析目标：${d.goal}`);
  L.push(`- 产品：${d.product}`);
  L.push(`- 时间范围：${d.date_range[0]} ~ ${d.date_range[1]}`);
  L.push('');
  L.push('# 数据源与口径（团队约定，务必遵守）');
  L.push(`- 活跃/主表：${meta.active_table || '（请确认表名）'}`);
  L.push(`- 用户主键：${meta.uid || d.pk}`);
  L.push('- 引擎：Presto/Trino；客户端过滤 UPPER(client)=\'APP\'；平台过滤 UPPER(platform) IN (\'IOS\',\'ANDROID\')');
  if (meta.note) L.push(`- ⚠️ 产品特殊口径：${meta.note}`);
  if (d.north_star_formula) L.push(`- 北极星指标公式：${d.north_star_formula}`);
  L.push('');
  L.push('# 需要产出的指标');
  L.push(`- 核心指标：${mList}`);
  if (d.user_metrics.length) L.push(`- 用户指标：${d.user_metrics.map(m => LABELS.user_metrics[m] || m).join('、')}`);
  L.push('');
  L.push('# 分组 / 拆分维度');
  L.push(dims.length ? '- ' + dims.join('\n- ') : '- 无（整体汇总）');
  if (focus) L.push(`- 重点商品：${focus}`);
  if (d.price_buckets) L.push(`- 价格分桶：${d.price_buckets}`);
  L.push('');
  L.push('# SQL 编写要求');
  L.push('1. 用 CTE 分层：① 用户/订单筛选 → ② 收入/指标聚合 → ③ 维度汇总 → ④ 最终 SELECT。');
  L.push('2. 涉及多渠道收入时按渠道拆列（如 revenue_iap / revenue_3pp），便于算占比/转移比例。');
  L.push('3. 比率类指标显式写出分子/分母，避免整数除法（用 CAST 或 ×1.0）。');
  if (dims.includes('设备平台')) L.push('4. 平台汇总用 CUBE(platform) 自动生成分平台 + ALL 汇总。');
  L.push('5. 输出列名用英文蛇形命名，并与下方「CSV 列映射」对齐，方便后续报告处理。');
  L.push('');
  L.push('# 期望输出 CSV 列（与列映射对齐）');
  d.column_map.forEach(c => L.push(`- ${c.col || '(待定)'}：${c.meaning}（${c.type}）`));
  if (d.log_refs && d.log_refs.length) {
    L.push('');
    L.push('# 埋点/日志参考（SQL 须基于这些真实数据源编写）');
    d.log_refs.forEach(r => {
      L.push(`- **${r.log_name}**`);
      if (r.doc_url) L.push(`  - 文档：${r.doc_url}`);
      if (r.fields) L.push(`  - 可用字段/指标：${r.fields}`);
    });
    L.push('');
    L.push('⚠️ 请务必参考上述埋点文档中的真实表名和字段名编写 SQL，不要自行猜测。');
  }
  if (d.sql_refs && d.sql_refs.length) {
    L.push('');
    L.push('# 历史 SQL 参考（请参考其中的表名、字段、JOIN 和过滤逻辑）');
    d.sql_refs.forEach(r => {
      L.push(`## ${r.sql_label || '历史参考'}`);
      L.push('```sql');
      L.push(r.sql_code);
      L.push('```');
      L.push('');
    });
  }
  if (d.notes) { L.push(''); L.push('# 补充说明'); L.push(d.notes); }
  L.push('');
  L.push('请输出：1) 完整 SQL；2) 每个 CTE 的一句话注释；3) 结果列说明。');
  return L.join('\n');
}

/* ---------- ② 分析契约 ---------- */
function buildContract(d) {
  const L = [];
  L.push('# 分析契约 (Analysis Contract)');
  L.push('> 本契约在跑数前锁定分析框架。拿到 CSV 后，报告须严格按此结构生成，保证质量一致、不跑偏。');
  L.push('');
  L.push('## 1. 分析元信息');
  L.push(`- 模块：付费/收入分析`);
  L.push(`- 项目：${d.project}`);
  L.push(`- 目标（决策问题）：${d.goal}`);
  L.push(`- 产品：${d.product}　时间：${d.date_range[0]} ~ ${d.date_range[1]}`);
  L.push(`- 数据粒度：${d.grain}　主键：${d.pk}`);
  L.push('');
  L.push('## 2. 指标定义与口径');
  d.metrics.forEach(m => {
    L.push(`- **${LABELS.metrics[m] || m}**：${metricDef(m)}`);
  });
  if (d.north_star_formula) L.push(`- **北极星指标**：${d.north_star_formula}`);
  L.push('');
  L.push('## 3. 报告章节规划（问题 → 章节 → 图表）');
  L.push('> 每个分析问题对应一个章节；图表类型按数据可视化规则预选。');
  d.questions.forEach((q, i) => {
    L.push(`### 第 ${i + 1} 章：${q.question}`);
    if (q.hint) L.push(`- 对比/拆分：${q.hint}`);
    L.push(`- 推荐图表：${recommendChart(d, q)}`);
    L.push(`- 解读要点：量化结论 + 对比基准 + 注意事项各一句。`);
    L.push('');
  });
  L.push('## 4. 对比基准');
  const dims = d.dims.map(x => LABELS.dims[x] || x);
  L.push(dims.length ? `- 拆分维度：${dims.join('、')}` : '- 整体汇总，无拆分');
  if ((d.products_focus || []).length) L.push(`- 重点商品：${d.products_focus.join('、')}`);
  L.push('');
  L.push('## 5. 必备注意事项（Caveats）');
  L.push('- 比率指标须标注分母口径，避免「平均的平均」。');
  L.push('- 渠道收入对比须确认 IAP/3PP 金额单位一致（货币、是否含税、是否已扣分成）。');
  L.push('- 期间对比须为完整周期对完整周期，避免部分期偏差。');
  if ((PRODUCT_META[d.product] || {}).note) L.push(`- ${PRODUCT_META[d.product].note}`);
  if (d.notes) L.push(`- 业务补充：${d.notes}`);
  L.push('');
  L.push('## 6. 输出物');
  L.push('- 自包含 HTML 报告（ECharts，悬浮目录 + 核心结论 + 分章节图表），沿用团队报告模板。');
  L.push('- 飞书文档（结论 + 维度说明 + SQL）与飞书卡片，均由同一结果对象派生。');
  return L.join('\n');
}

function metricDef(m) {
  return ({
    ARPU: '总收入 ÷ 活跃用户数（按所选时间/生命周期口径）',
    ARPPU: '总收入 ÷ 付费用户数',
    pay_rate: '付费用户数 ÷ 活跃用户数（显式分子分母）',
    pay_count: '付费订单/交易笔数',
    iap_amount: 'IAP 渠道收入金额',
    '3pp_amount': '3PP（内嵌+主站）渠道收入金额',
    transfer_rate: '3PP 收入 ÷ 总收入，反映付费向三方支付的转移程度',
    total_revenue: 'IAP + 3PP 等所有渠道收入合计',
  })[m] || '（待补充定义）';
}

function recommendChart(d, q) {
  // 优先用问题命中的指标推荐，否则给通用建议
  const hit = d.metrics.find(m => q.question.includes(LABELS.metrics[m]));
  if (hit && METRIC_CHART[hit]) return METRIC_CHART[hit];
  if (q.question.includes('转移') || q.question.includes('趋势')) return '折线图（趋势对比）';
  if (q.question.includes('构成') || q.question.includes('占比')) return '堆叠柱状图 / 堆叠面积图';
  if (q.question.includes('对比') || q.question.includes('差异')) return '分组柱状图';
  return '折线图或分组柱状图（按数据形态定）';
}

/* ---------- 自定义商品类型 → 自动同步明细行 ---------- */
function initCustomProductSync() {
  const detail = document.getElementById('custom-product-detail');
  const group = document.getElementById('chips-product-type');
  if (!detail || !group) return;

  // 监听 chip 区域变化（MutationObserver 监听新增 chip-custom）
  const observer = new MutationObserver(() => syncCustomProducts());
  observer.observe(group, { childList: true });

  function syncCustomProducts() {
    // 找出所有自定义 chip（.chip-custom）的 value
    const customs = Array.from(group.querySelectorAll('.chip-custom input[type=checkbox]'))
      .map(i => i.value);
    // 对每个自定义值，确保有一行明细
    customs.forEach(val => {
      if (detail.querySelector(`[data-val="${CSS.escape(val)}"]`)) return;
      const row = document.createElement('div');
      row.className = 'dyn-row';
      row.dataset.val = val;
      row.innerHTML =
        `<input type="text" value="${FF.esc(val)}" readonly style="flex:0 0 140px;background:#f5f5f5;font-weight:600;">` +
        `<input type="text" data-f="note" placeholder="备注：如含义、筛选条件等">` +
        `<button type="button" class="del" title="删除">×</button>`;
      row.querySelector('.del').addEventListener('click', () => {
        // 同时取消对应 chip
        const cb = group.querySelector(`.chip-custom input[value="${CSS.escape(val)}"]`);
        if (cb) { cb.checked = false; cb.closest('.chip').remove(); }
        row.remove();
      });
      detail.appendChild(row);
    });
    // 删除已不在 chips 中的行
    detail.querySelectorAll('.dyn-row').forEach(row => {
      if (!customs.includes(row.dataset.val)) row.remove();
    });
  }
}

/* ---------- 自动生成 CSV 列映射（基于前序步骤选择） ---------- */
// 列名映射规则：指标/维度 → 推荐列名 + 含义 + 类型
const COL_SUGGEST = {
  // 核心指标
  ARPU:           { col: 'arpu', meaning: 'ARPU（人均收入）', type: 'metric' },
  ARPPU:          { col: 'arppu', meaning: 'ARPPU（付费用户人均收入）', type: 'metric' },
  pay_rate:       { col: 'pay_rate', meaning: '付费率', type: 'metric' },
  pay_count:      { col: 'pay_count', meaning: '付费次数', type: 'metric' },
  iap_amount:     { col: 'revenue_iap', meaning: 'IAP 收入', type: 'metric' },
  '3pp_amount':   { col: 'revenue_3pp', meaning: '3PP 收入', type: 'metric' },
  transfer_rate:  { col: 'transfer_rate', meaning: '3PP 转移比例', type: 'metric' },
  total_revenue:  { col: 'revenue_total', meaning: '总收入', type: 'metric' },
  // 用户指标
  payers:         { col: 'payers', meaning: '付费人数', type: 'metric' },
  new_payers:     { col: 'new_payers', meaning: '新付费人数', type: 'metric' },
  back_payers:    { col: 'back_payers', meaning: '回流付费人数', type: 'metric' },
  pay_freq:       { col: 'pay_freq', meaning: '人均付费频次', type: 'metric' },
  aov:            { col: 'aov', meaning: '客单价', type: 'metric' },
  // 维度
  platform:       { col: 'platform', meaning: '设备平台(iOS/Android)', type: 'dimension' },
  lifecycle:      { col: 'lifecycle', meaning: '生命周期阶段(LT)', type: 'dimension' },
  reg_days:       { col: 'reg_days', meaning: '注册天数', type: 'dimension' },
  '3pp_ratio':    { col: '3pp_ratio_bucket', meaning: '3PP 比例分桶', type: 'dimension' },
  product_type:   { col: 'product_type', meaning: '商品类型', type: 'dimension' },
};

let _csvUploadedManually = false; // 用户是否通过 CSV 上传/粘贴手动设置过

function autoGenerateColumns() {
  // 如果用户通过 CSV 上传过，不覆盖
  if (_csvUploadedManually) return;

  const metrics = FF.getCheckedChips('metrics');
  const userMetrics = FF.getCheckedChips('user_metrics');
  const dims = FF.getCheckedChips('dims');
  const product = FF.val('product');

  // 清除旧行，重新生成
  FF.clearContainer('map-rows');

  // 基础列：主键 + 日期（根据产品自动取）
  const meta = PRODUCT_META[product] || {};
  window.__addMapRow({ col: meta.uid || 'user_id', meaning: '用户主键', type: 'id' });
  window.__addMapRow({ col: 'date', meaning: '日期', type: 'date' });

  // 活跃用户数（计算 ARPU/付费率需要）
  if (metrics.includes('ARPU') || metrics.includes('pay_rate')) {
    window.__addMapRow({ col: 'dau', meaning: '活跃用户数', type: 'metric' });
  }

  // 维度列
  dims.forEach(d => {
    const s = COL_SUGGEST[d];
    if (s) window.__addMapRow(s);
  });

  // 指标列
  metrics.forEach(m => {
    const s = COL_SUGGEST[m];
    if (s) window.__addMapRow(s);
  });

  // 用户指标列
  userMetrics.forEach(m => {
    const s = COL_SUGGEST[m];
    if (s) window.__addMapRow(s);
  });

  // 自定义维度（逗号输入框）
  const dimsCustom = FF.nonEmpty(FF.val('dims_custom').split(/[,，]/).map(s => s.trim()));
  dimsCustom.forEach(d => {
    window.__addMapRow({ col: d.toLowerCase().replace(/\s+/g, '_'), meaning: d, type: 'dimension' });
  });
}
