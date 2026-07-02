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

// 产品名 → MCP sql_query 的 project 参数映射
const PRODUCT_PROJECT_MAP = {
  'P10': 'phase10', 'SKB': 'skipbo', 'UNO': 'uno', 'UNO2': 'uno wonder', 'ALL': 'uno',
};

document.addEventListener('DOMContentLoaded', () => {
  FF.init();

  FF.initWizard([
    { title: '实验背景', question: '什么实验、怎么分组？', explain: '选产品、写目的、填日期，再定义实验组/对照组。', example: '<b>例：</b>P10 RM弹窗实验，6/1~6/14，rm_on vs rm_off' },
    { title: '评估指标', question: '看哪些指标、回答什么问题？', explain: '选核心指标 + 护栏 + 下钻维度，勾选报告要回答的问题。', example: '<b>例：</b>核心看 3PP 转移比例，护栏看 ARPU，"是否建议全量？"' },
    { title: '数据源', question: '数据从哪来？', explain: '填主键，贴埋点/历史 SQL。', example: '<b>例：</b>account_id + pay_order_log 文档' },
  ]);

  // 产品 checkbox（支持多选）
  document.querySelectorAll('#chips-ab-product .chip').forEach(chip => {
    const inp = chip.querySelector('input');
    inp.addEventListener('change', () => {
      // 选"全部"时取消其他，选其他时取消"全部"
      if (inp.value === 'ALL' && inp.checked) {
        chip.closest('.chips').querySelectorAll('input').forEach(i => { if (i !== inp) { i.checked = false; i.closest('.chip').classList.remove('checked'); } });
      } else if (inp.checked) {
        const allInp = chip.closest('.chips').querySelector('input[value="ALL"]');
        if (allInp) { allInp.checked = false; allInp.closest('.chip').classList.remove('checked'); }
      }
      chip.classList.toggle('checked', inp.checked);
      const selected = [...chip.closest('.chips').querySelectorAll('input:checked')].map(i => i.value);
      document.getElementById('product').value = selected.join(',') || '';
    });
  });

  // 问题预设
  document.querySelectorAll('#chips-ab-presetq input').forEach(inp => {
    FF.wireChip(inp.closest('.chip'));
    inp.addEventListener('change', () => { if (inp.checked) addQ({ question: inp.value }); });
  });

  // 动态行：分析问题
  let qIdx = 0;
  const qDyn = FF.initDynamic('ab-q-rows', 'add-ab-q', (d = {}) => {
    qIdx++;
    return `<div class="qhead"><span class="qtag">Q${qIdx}</span></div>
      <input type="text" data-f="question" placeholder="分析问题" style="margin-bottom:6px" value="${FF.esc(d.question || '')}">`;
  }, { rowClass: 'question-block', initial: [{}] });
  function addQ(d) { qDyn.addRow(d); }

  // 动态行：数据列映射（复刻日常取数）
  const mapDyn = FF.initDynamic('ab-map-rows', 'ab-add-map', (data) => {
    const d = data || {};
    return `<input type="text" data-f="col_name" placeholder="列名" value="${FF.esc(d.col_name||'')}" style="flex:0 0 140px;">` +
    `<input type="text" data-f="col_desc" placeholder="含义说明" value="${FF.esc(d.col_desc||'')}" style="flex:1;">` +
    `<select data-f="col_type" style="flex:0 0 120px;">` +
      `<option value="metric"${d.col_type==='metric'?' selected':''}>指标</option>` +
      `<option value="dimension"${d.col_type==='dimension'?' selected':''}>维度</option>` +
      `<option value="date"${d.col_type==='date'?' selected':''}>日期</option>` +
      `<option value="id"${d.col_type==='id'?' selected':''}>主键/ID</option></select>`;
  }, { rowClass: 'dyn-row' }) || { addRow: () => {}, container: null };

  // CSV 拖拽/点击识别
  const csvDrop = document.getElementById('ab-csv-drop');
  const csvPaste = document.getElementById('ab-csv-paste');
  if (csvDrop) {
    csvDrop.addEventListener('dragover', e => { e.preventDefault(); csvDrop.classList.add('drag'); });
    csvDrop.addEventListener('dragleave', () => csvDrop.classList.remove('drag'));
    csvDrop.addEventListener('drop', e => {
      e.preventDefault(); csvDrop.classList.remove('drag');
      const file = e.dataTransfer.files[0];
      if (file) readCsvFile(file);
    });
    csvDrop.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.csv,.tsv,.txt';
      inp.onchange = () => { if (inp.files[0]) readCsvFile(inp.files[0]); };
      inp.click();
    });
  }
  if (csvPaste) {
    csvPaste.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const cols = FF.parseCsvHeader(csvPaste.value);
        if (cols.length) fillMapFromCols(cols);
      }
    });
  }
  function readCsvFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      const cols = FF.parseCsvHeader(reader.result);
      if (cols.length) fillMapFromCols(cols);
    };
    reader.readAsText(file);
  }
  function fillMapFromCols(cols) {
    FF.clearContainer('ab-map-rows');
    cols.forEach(c => mapDyn.addRow({ col_name: c.col, col_desc: '', col_type: c.type }));
  }

  // 动态行：埋点参考（复刻日常取数）
  const logDyn = FF.initDynamic('ab-log-ref-rows', 'add-ab-log-ref', (data) => {
    const d = data || {};
    return `<input type="text" data-f="log_name" placeholder="埋点名" value="${FF.esc(d.log_name||'')}" style="flex:0 0 140px;">` +
    `<input type="text" data-f="doc_url" placeholder="文档链接（选填）" value="${FF.esc(d.doc_url||'')}" style="flex:1;">` +
    `<input type="text" data-f="fields" placeholder="可获取的指标/字段" value="${FF.esc(d.fields||'')}" style="flex:1;">`;
  }, { rowClass: 'dyn-row' }) || { addRow: () => {}, container: null };

  const LOG_PRESETS = {
    active: { log_name: 'dm_player_active_info', doc_url: 'https://confluence.mattel163.cn/pages/viewpage.action?pageId=122297374', fields: 'DAU、活跃天数、平台、渠道' },
    pay:    { log_name: 'pay_success / order_complete', doc_url: 'https://confluence.mattel163.cn/pages/viewpage.action?pageId=162420600', fields: '付费金额、商品ID、支付方式、首充/复购' },
    ad:     { log_name: 'ad_show / ad_complete', doc_url: 'https://confluence.mattel163.cn/pages/viewpage.action?pageId=162417980', fields: '广告位、eCPM、adchannel、展示/完成' },
    login:  { log_name: 'login / register', doc_url: 'https://confluence.mattel163.cn/pages/viewpage.action?pageId=122297374', fields: '登录时间、注册时间、设备、IP国家' },
    retain: { log_name: 'dm_player_active_info', doc_url: 'https://confluence.mattel163.cn/pages/viewpage.action?pageId=122297374', fields: 'D1/D3/D7/D14/D30 留存标记' },
  };
  document.querySelectorAll('#chips-ab-log-presets .chip').forEach(chip => {
    const inp = chip.querySelector('input');
    inp.addEventListener('change', () => {
      if (inp.checked) { const preset = LOG_PRESETS[inp.value]; if (preset) logDyn.addRow(preset); }
    });
  });

  // 动态行：历史 SQL 参考（复刻日常取数）
  const sqlDyn = FF.initDynamic('ab-sql-ref-rows', 'ab-add-sql-ref', (data) => {
    const d = data || {};
    return `<input type="text" data-f="sql_label" placeholder="SQL 指标名称" value="${FF.esc(d.sql_label||'')}" style="flex:0 0 160px;">` +
    `<input type="text" data-f="sql_code" placeholder="SQL 文档链接" value="${FF.esc(d.sql_code||'')}" style="flex:1;">`;
  }, { rowClass: 'dyn-row' }) || { addRow: () => {}, container: null };

  const SQL_PRESETS = {
    dau:       { sql_label: 'DAU 取数', sql_code: 'https://mattel163.feishu.cn/wiki/ENifwYm8JiO2wJkaoMTcqqdUnxe' },
    revenue:   { sql_label: '付费收入', sql_code: 'https://mattel163.feishu.cn/docx/GhMEdzxyIoYGfSxRrGscQYnLnWh' },
    retention: { sql_label: '留存率', sql_code: 'https://mattel163.feishu.cn/docx/KiLqdlhjqosgsDxPUCuc1lFGnmf' },
    ad_rev:    { sql_label: '广告收入', sql_code: 'https://confluence.mattel163.cn/pages/viewpage.action?pageId=162417980' },
  };
  document.querySelectorAll('#chips-ab-sql-presets .chip').forEach(chip => {
    const inp = chip.querySelector('input');
    inp.addEventListener('change', () => {
      if (inp.checked) { const preset = SQL_PRESETS[inp.value]; if (preset) sqlDyn.addRow(preset); }
    });
  });

  document.getElementById('btn-reset').addEventListener('click', () => { if (confirm('确认重置？')) location.reload(); });

  // 全局搜索开关
  const searchToggle = document.getElementById('ab_global_search_toggle');
  const searchWrap = document.getElementById('ab-search-input-wrap');
  const searchStatus = document.getElementById('ab-search-status');
  if (searchToggle) {
    searchToggle.addEventListener('change', () => {
      if (searchToggle.checked) {
        searchWrap.style.display = 'block';
        searchStatus.textContent = '已启用';
        searchStatus.style.color = 'var(--brand-1)';
        searchStatus.style.fontWeight = '600';
        document.getElementById('ab_search_keywords').focus();
      } else {
        searchWrap.style.display = 'none';
        searchStatus.textContent = '未启用';
        searchStatus.style.color = 'var(--text-3)';
        searchStatus.style.fontWeight = '500';
      }
    });
  }

  // 看板口径开关
  const dashboardToggle = document.getElementById('ab_dashboard_toggle');
  const dashboardDesc = document.getElementById('ab-dashboard-desc');
  const dashboardStatus = document.getElementById('ab-dashboard-status');
  if (dashboardToggle) {
    dashboardToggle.addEventListener('change', () => {
      if (dashboardToggle.checked) {
        dashboardDesc.style.display = 'block';
        dashboardStatus.textContent = '已启用';
        dashboardStatus.style.color = 'var(--brand-1)';
        dashboardStatus.style.fontWeight = '600';
      } else {
        dashboardDesc.style.display = 'none';
        dashboardStatus.textContent = '未启用';
        dashboardStatus.style.color = 'var(--text-3)';
        dashboardStatus.style.fontWeight = '500';
      }
    });
  }

  // SQL 自检开关
  const sqlVerifyToggle = document.getElementById('ab_sql_verify_toggle');
  const sqlVerifyDesc = document.getElementById('ab-sql-verify-desc');
  const sqlVerifyStatus = document.getElementById('ab-sql-verify-status');
  if (sqlVerifyToggle) {
    sqlVerifyToggle.addEventListener('change', () => {
      if (sqlVerifyToggle.checked) {
        sqlVerifyDesc.style.display = 'block';
        sqlVerifyStatus.textContent = '已启用';
        sqlVerifyStatus.style.color = 'var(--brand-1)';
        sqlVerifyStatus.style.fontWeight = '600';
      } else {
        sqlVerifyDesc.style.display = 'none';
        sqlVerifyStatus.textContent = '未启用';
        sqlVerifyStatus.style.color = 'var(--text-3)';
        sqlVerifyStatus.style.fontWeight = '500';
      }
    });
  }

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
  const searchEnabled = document.getElementById('ab_global_search_toggle') && document.getElementById('ab_global_search_toggle').checked;
  const dashboardEnabled = document.getElementById('ab_dashboard_toggle') && document.getElementById('ab_dashboard_toggle').checked;
  const sqlVerifyEnabled = document.getElementById('ab_sql_verify_toggle') && document.getElementById('ab_sql_verify_toggle').checked;
  return {
    module: 'ab_test',
    product: FF.val('product'),
    project: FF.val('product') + ' AB实验 - ' + (FF.val('ab_goal') || '').slice(0, 20),
    owner: FF.val('owner'),
    goal: FF.val('ab_goal'),
    global_search: searchEnabled ? (FF.val('ab_search_keywords') || '').trim() : '',
    dashboard_mode: dashboardEnabled,
    sql_verify_mode: sqlVerifyEnabled,
    date_range: [FF.val('date_start'), FF.val('date_end')],
    aa_range: [FF.val('aa_start'), FF.val('aa_end')],
    treat_label: FF.val('treat_label'),
    treat_sql: FF.val('treat_sql'),
    ctrl_label: FF.val('ctrl_label'),
    ctrl_sql: FF.val('ctrl_sql'),
    metrics: FF.getCheckedChips('ab_metrics'),
    guardrails: FF.getCheckedChips('ab_guardrails'),
    dims: FF.getCheckedChips('ab_dims'),
    pk: '',
    column_map: FF.collectRows('ab-map-rows', ['col_name', 'col_desc', 'col_type']),
    log_refs: FF.collectRows('ab-log-ref-rows', ['log_name', 'doc_url', 'fields']),
    sql_refs: FF.collectRows('ab-sql-ref-rows', ['sql_label', 'sql_code']),
    questions: FF.collectRows('ab-q-rows', ['question']),
    notes: FF.val('notes'),
  };
}

function buildSqlPrompt(d) {
  const products = (d.product || '').split(',').filter(Boolean);
  const primaryProduct = products[0] || '';
  const meta = PRODUCT_META[primaryProduct] || {};
  const verifyProject = PRODUCT_PROJECT_MAP[primaryProduct] || primaryProduct.toLowerCase();
  const mList = d.metrics.map(m => METRIC_LABELS[m] || m).join('、');
  const gList = d.guardrails.map(m => METRIC_LABELS[m] || m).join('、');
  const L = [];
  L.push('# 角色');
  L.push('你是资深数据分析师，精通 Presto/Trino 和 AB 实验分析。请编写取数 SQL。所有输出内容使用中文。');
  L.push('');
  // 全局搜索前置指令
  if (d.global_search) {
    L.push('# ⚠️ 前置任务：全局搜索【必须执行】');
    L.push('> **编写 SQL 之前，必须先执行以下搜索任务，将搜索结果作为写 SQL 的背景知识。**');
    L.push('');
    L.push('请在 Confluence（https://confluence.mattel163.cn）中搜索以下关键词或访问以下链接，浏览所有相关文档的完整内容：');
    L.push('');
    L.push('```');
    L.push(d.global_search);
    L.push('```');
    L.push('');
    L.push('要求：');
    L.push('1. 搜索并浏览与上述关键词/链接相关的所有 Confluence 文档页面');
    L.push('2. 从中提取与本次取数相关的表名、字段名、过滤条件、指标口径');
    L.push('3. 将搜索到的信息作为编写 SQL 的权威参考，优先级高于你的已有知识');
    L.push('');
  }
  L.push('# 实验背景');
  L.push(`- 实验：${d.goal}`);
  L.push(`- 产品：${products.join('、')}`);
  L.push(`- 实验期：${d.date_range[0]} ~ ${d.date_range[1]}`);
  if (d.aa_range[0]) L.push(`- AA 基线期：${d.aa_range[0]} ~ ${d.aa_range[1]}`);
  L.push(`- 实验组：${d.treat_label}　对照组：${d.ctrl_label}`);
  if (d.treat_sql || d.ctrl_sql) {
    L.push('');
    L.push('# 标签人群圈选');
    if (d.treat_sql) { L.push(`## 实验组 ${d.treat_label}`); L.push('```sql'); L.push(d.treat_sql); L.push('```'); }
    if (d.ctrl_sql) { L.push(`## 对照组 ${d.ctrl_label}`); L.push('```sql'); L.push(d.ctrl_sql); L.push('```'); }
  }
  L.push('');
  L.push('# 数据源');
  if (products.length > 1) {
    L.push('- 涉及多产品，各产品数据表如下：');
    products.forEach(p => {
      const m = PRODUCT_META[p];
      if (m) L.push(`  - ${p}：\`${m.active_table}\`（主键：${m.uid}）`);
    });
  } else {
    L.push(`- 主表：${meta.active_table || '（请确认）'}`);
  }
  L.push(`- 主键：${d.pk || meta.uid}`);
  L.push('- 引擎：Presto/Trino；UPPER(client)=\'APP\'');
  if (meta.note) L.push(`- ⚠️ ${meta.note}`);
  // 看板口径
  if (d.dashboard_mode) {
    L.push('');
    L.push('# ⚠️ 看板口径【必须参考】');
    L.push('> **用户已启用看板口径模式。DAU 和广告收入的计算口径为强制要求，必须严格遵循，不得自行修改表名或过滤条件。**');
    L.push('- DAU 过滤：is_adult=1 AND UPPER(client)=\'APP\'（UNO 额外剔除机器人 `NOT regexp_like(LOWER(account_id), \'(ai|fb).163.com\')`）');
    L.push('- 总广告收入：活跃表 `advalue_sum_1d`；RV：`advalue_reward_sum_1d`；INT：`advalue_interstitial_sum_1d`');
    L.push('- UNO2 分类型需从 `dw_ods_mn08.c_client_app_ad_log` (log_subtype=advalue) 按 adtype 分组，安卓 /1000000');
  }
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
  if (d.column_map && d.column_map.length) {
    L.push('');
    L.push('# 数据列定义');
    L.push('| 列名 | 含义 | 类型 |');
    L.push('|------|------|------|');
    d.column_map.forEach(c => L.push(`| ${c.col_name} | ${c.col_desc} | ${c.col_type} |`));
  }
  if (d.log_refs.length) {
    L.push('');
    L.push('# 埋点参考');
    d.log_refs.forEach(r => {
      L.push(`- **${r.log_name}**${r.doc_url ? ' 文档:' + r.doc_url : ''}${r.fields ? ' 字段:' + r.fields : ''}`);
    });
  }
  if (d.sql_refs && d.sql_refs.length) {
    L.push('');
    L.push('# 历史 SQL 参考');
    d.sql_refs.forEach(r => {
      if (r.sql_label) L.push(`## ${r.sql_label}`);
      if (r.sql_code) L.push(r.sql_code);
    });
  }
  if (d.notes) { L.push(''); L.push('# 补充'); L.push(d.notes); }
  // SQL 自检流程
  if (d.sql_verify_mode) {
    L.push('');
    L.push('# SQL 自检流程【交付方式】');
    L.push('');
    L.push('## 第一步：先输出初版 SQL');
    L.push('根据上述需求先生成一版完整可执行的 SQL，并告诉用户：');
    L.push('> 以上是初版 SQL，你可以先去 Omnieye 运行。如果报错或对结果不置信，把报错/结果发我，我再启动 SQL 自检帮你排查修正。');
    L.push('> ⚠️ SQL 自检需逐步验证字段、枚举值和 JOIN 逻辑，可能需要 3-5 分钟。');
    L.push('');
    L.push('## 第二步：用户反馈后启动自检');
    L.push('当用户反馈报错或对结果不置信时，使用 MCP 工具 `sql_query` 逐步执行自检，确认后输出修正版 SQL。');
    L.push('');
    L.push('**执行参数：**');
    L.push(`- project：\`${verifyProject}\``);
    L.push('- 超时规则：单个自检语句超过 1 分钟未返回 → 视为失败，换写法或跳过该条，不要无限等待');
    L.push('');
    L.push('- Step 1 字段存在性：`SELECT * FROM 表名 WHERE date=\'最近一天\' LIMIT 5`，逐一核对字段是否存在，不存在则从其他表 JOIN 补充');
    L.push('- Step 2 枚举值检查：`SELECT 字段, COUNT(1) FROM 表名 WHERE date BETWEEN ... GROUP BY 字段 ORDER BY cnt DESC`，确认枚举值格式与过滤写法一致');
    L.push('- Step 3 JOIN 字段一致性：对 JOIN 两表分别 `SELECT DISTINCT 用户字段 ... LIMIT 5`，确认字段名、格式、粒度一致');
    L.push('- Step 4 输出自检结论摘要，说明发现的问题及修正方式');
  }
  return L.join('\n');
}

function buildContract(d) {
  const L = [];
  L.push('# AB 实验分析契约');
  L.push('');
  L.push('## 1. 实验信息');
  L.push(`- 实验：${d.goal}`);
  L.push(`- 产品：${(d.product || '').split(',').filter(Boolean).join('、')}　时间：${d.date_range[0]} ~ ${d.date_range[1]}`);
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
