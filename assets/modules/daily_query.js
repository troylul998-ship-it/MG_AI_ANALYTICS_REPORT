/* ============================================================
   日常取数工作台 — 轻量 SQL 生成
   ============================================================ */

const PRODUCT_META = {
  P10:  { active_table: 'dw_ods_common_mn02.dm_mn02_player_active_info', uid: 'account_id' },
  SKB:  { active_table: 'dw_ods_common_mn04.dm_mn04_player_active_info', uid: 'account_id' },
  UNO:  { active_table: 'dw_ods_mn01.dm_mn01_player_active_info',         uid: 'role_id' },
  UNO2: { active_table: 'dw_ods_mn08.dm_mn08_player_active_info',         uid: 'role_id',
          note: 'UNO2 广告明细另见 dw_ods_mn08.c_client_app_ad_log；安卓 advalue 字段需 /1000000' },
  ALL:  { active_table: '（按各产品表 UNION）', uid: '按产品而定' },
};

document.addEventListener('DOMContentLoaded', () => {
  FF.init();

  // Wizard
  FF.initWizard([
    { title: '产品', question: '取哪个产品的数据？', explain: '选产品 + 日期范围。', example: '<b>例：</b>P10，最近 7 天' },
    { title: '需求', question: '你想取什么数据？', explain: '用白话写，或点选常用场景。选拆分维度和过滤条件。', example: '<b>例：</b>"帮我拉分平台 DAU 和付费人数"，按天+按平台拆分' },
    { title: '数据源', question: '数据源', explain: '字段、埋点、历史 SQL，填了生成的 SQL 更准。没有就直接生成。', example: '<b>例：</b>字段 dau/付费人数，埋点 pay_success' },
  ]);

  // 日期快捷按钮
  document.querySelectorAll('.date-quick').forEach(btn => {
    btn.addEventListener('click', () => {
      const range = btn.dataset.range;
      const today = new Date();
      const fmt = d => d.toISOString().slice(0, 10);
      let start, end;
      if (range === 'month') {
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = today;
      } else if (range === 'lastmonth') {
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0);
      } else {
        const days = parseInt(range);
        start = new Date(today); start.setDate(today.getDate() - days + 1);
        end = today;
      }
      document.getElementById('date_start').value = fmt(start);
      document.getElementById('date_end').value = fmt(end);
      document.querySelectorAll('.date-quick').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // 产品 radio → 同步 select
  document.querySelectorAll('#chips-product-dq .chip').forEach(chip => {
    const inp = chip.querySelector('input');
    inp.addEventListener('change', () => {
      chip.closest('.chips').querySelectorAll('.chip').forEach(c => c.classList.remove('checked'));
      chip.classList.add('checked');
      document.getElementById('product').value = inp.value;
    });
  });

  // 场景预设 → 填充 textarea
  document.querySelectorAll('#chips-dq-presets .chip').forEach(chip => {
    const inp = chip.querySelector('input');
    inp.addEventListener('change', () => {
      chip.closest('.chips').querySelectorAll('.chip').forEach(c => c.classList.remove('checked'));
      chip.classList.add('checked');
      if (inp.value) document.getElementById('query_desc').value = inp.value;
      else document.getElementById('query_desc').focus();
    });
  });

  // 动态行：列映射
  const mapDyn = FF.initDynamic('dq-map-rows', 'dq-add-map', (data) => {
    const d = data || {};
    return `<input type="text" data-f="col_name" placeholder="列名" value="${FF.esc(d.col_name||'')}" style="flex:0 0 140px;">` +
    `<input type="text" data-f="col_desc" placeholder="含义说明" value="${FF.esc(d.col_desc||'')}" style="flex:1;">` +
    `<select data-f="col_type" style="flex:0 0 120px;">` +
      `<option value="metric"${d.col_type==='metric'?' selected':''}>指标</option>` +
      `<option value="dimension"${d.col_type==='dimension'?' selected':''}>维度</option>` +
      `<option value="date"${d.col_type==='date'?' selected':''}>日期</option>` +
      `<option value="id"${d.col_type==='id'?' selected':''}>主键/ID</option></select>`;
  }, { rowClass: 'dyn-row' }) || { addRow: () => {}, container: null };

  // 自动生成列：根据前面选择的需求和维度
  function autoGenerateColumns() {
    FF.clearContainer('dq-map-rows');
    const product = FF.val('product');
    const dims = FF.getCheckedChips('dq_dims');
    const desc = FF.val('query_desc') || '';

    // 默认加主键
    if (product && PRODUCT_META[product]) {
      mapDyn.addRow({ col_name: PRODUCT_META[product].uid, col_desc: '用户主键', col_type: 'id' });
    }
    // 日期列
    if (dims.includes('date')) mapDyn.addRow({ col_name: 'date', col_desc: '日期', col_type: 'date' });
    // 维度列
    dims.filter(d => d !== 'date').forEach(d => {
      const dimDescMap = {
        platform: 'platform',
        country: 'country',
        area_type: 'T地区 (US/T1/T2/T3)',
        area_group: 'Group地区 (US/GroupA/GroupB/GroupC)',
        reg_days: '注册天数',
      };
      mapDyn.addRow({ col_name: d, col_desc: dimDescMap[d] || d, col_type: 'dimension' });
    });
    // 从需求描述中提取常见指标关键词
    const keywords = [
      { kw: /dau/i, col: 'dau', desc: '日活跃用户数' },
      { kw: /付费人数|付费用户/i, col: 'pay_users', desc: '付费用户数' },
      { kw: /付费金额|收入|revenue/i, col: 'revenue', desc: '付费金额' },
      { kw: /arpu/i, col: 'arpu', desc: 'ARPU' },
      { kw: /arppu/i, col: 'arppu', desc: 'ARPPU' },
      { kw: /付费率/i, col: 'pay_rate', desc: '付费率' },
      { kw: /留存/i, col: 'retention', desc: '留存率' },
      { kw: /广告收入|ad.*revenue/i, col: 'ad_revenue', desc: '广告收入' },
      { kw: /ecpm/i, col: 'ecpm', desc: 'eCPM' },
    ];
    keywords.forEach(k => {
      if (k.kw.test(desc)) mapDyn.addRow({ col_name: k.col, col_desc: k.desc, col_type: 'metric' });
    });
  }

  // 第3步时自动生成列
  // 使用 wizard 的 onEnter 回调方式：监听 wiz-nav 按钮点击
  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-next');
    if (!btn) return;
    // 下一帧检查是否到第3步
    setTimeout(() => {
      const cards = document.querySelectorAll('.fcard');
      if (cards[2] && cards[2].classList.contains('wiz-active')) {
        if (!document.getElementById('dq-map-rows').children.length) autoGenerateColumns();
      }
    }, 100);
  });

  // CSV 拖拽/点击识别
  const csvDrop = document.getElementById('dq-csv-drop');
  const csvPaste = document.getElementById('dq-csv-paste');
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
    FF.clearContainer('dq-map-rows');
    cols.forEach(c => mapDyn.addRow({ col_name: c.col, col_desc: '', col_type: c.type }));
  }

  // 动态行：埋点参考
  const logDyn = FF.initDynamic('dq-log-ref-rows', 'dq-add-log-ref', (data) => {
    const d = data || {};
    return `<input type="text" data-f="log_name" placeholder="埋点名" value="${FF.esc(d.log_name||'')}" style="flex:0 0 140px;">` +
    `<input type="text" data-f="doc_url" placeholder="文档链接（选填）" value="${FF.esc(d.doc_url||'')}" style="flex:1;">` +
    `<input type="text" data-f="fields" placeholder="可获取的指标/字段" value="${FF.esc(d.fields||'')}" style="flex:1;">`;
  }, { rowClass: 'dyn-row' }) || { addRow: () => {}, container: null };

  // 埋点预设数据（基于产品自动适配）
  const LOG_PRESETS = {
    active: { log_name: 'dm_player_active_info', doc_url: 'https://confluence.mattel163.cn/pages/viewpage.action?pageId=122297374', fields: 'DAU、活跃天数、平台、渠道' },
    pay:    { log_name: 'pay_success / order_complete', doc_url: 'https://confluence.mattel163.cn/pages/viewpage.action?pageId=162420600', fields: '付费金额、商品ID、支付方式、首充/复购' },
    ad:     { log_name: 'ad_show / ad_complete', doc_url: 'https://confluence.mattel163.cn/pages/viewpage.action?pageId=162417980', fields: '广告位、eCPM、adchannel、展示/完成' },
    login:  { log_name: 'login / register', doc_url: 'https://confluence.mattel163.cn/pages/viewpage.action?pageId=122297374', fields: '登录时间、注册时间、设备、IP国家' },
    retain: { log_name: 'dm_player_active_info', doc_url: 'https://confluence.mattel163.cn/pages/viewpage.action?pageId=122297374', fields: 'D1/D3/D7/D14/D30 留存标记' },
  };

  // 埋点预设 chip 点选 → 自动添加行
  document.querySelectorAll('#chips-dq-log-presets .chip').forEach(chip => {
    const inp = chip.querySelector('input');
    inp.addEventListener('change', () => {
      if (inp.checked) {
        const preset = LOG_PRESETS[inp.value];
        if (preset) logDyn.addRow(preset);
      }
    });
  });

  // 动态行：历史 SQL 参考（改为名称+链接形式）
  const sqlDyn = FF.initDynamic('dq-sql-ref-rows', 'dq-add-sql-ref', (data) => {
    const d = data || {};
    return `<input type="text" data-f="sql_label" placeholder="SQL 指标名称" value="${FF.esc(d.sql_label||'')}" style="flex:0 0 160px;">` +
    `<input type="text" data-f="sql_code" placeholder="SQL 文档链接" value="${FF.esc(d.sql_code||'')}" style="flex:1;">`;
  }, { rowClass: 'dyn-row' }) || { addRow: () => {}, container: null };

  // SQL 预设数据（飞书/Confluence 链接）
  const SQL_PRESETS = {
    dau:       { sql_label: 'DAU 取数', sql_code: 'https://mattel163.feishu.cn/wiki/ENifwYm8JiO2wJkaoMTcqqdUnxe' },
    revenue:   { sql_label: '付费收入', sql_code: 'https://mattel163.feishu.cn/docx/GhMEdzxyIoYGfSxRrGscQYnLnWh' },
    retention: { sql_label: '留存率', sql_code: 'https://mattel163.feishu.cn/docx/KiLqdlhjqosgsDxPUCuc1lFGnmf' },
    ad_rev:    { sql_label: '广告收入', sql_code: 'https://confluence.mattel163.cn/pages/viewpage.action?pageId=162417980' },
  };

  // SQL 预设 chip 点选 → 自动添加行
  document.querySelectorAll('#chips-dq-sql-presets .chip').forEach(chip => {
    const inp = chip.querySelector('input');
    inp.addEventListener('change', () => {
      if (inp.checked) {
        const preset = SQL_PRESETS[inp.value];
        if (preset) sqlDyn.addRow(preset);
      }
    });
  });

  // 重置
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('确认重置？')) location.reload();
  });

  // 过滤条件快捷预设 → 追加到输入框
  const FILTER_SQL_MAP = {
    '只看APP': "AND UPPER(client) = 'APP'",
    '只看成年人': 'AND is_adult = 1 -- 剔除未成年',
    '只看新用户': 'AND been_reg_days = 1 -- 注册天数=1 当日新增',
    '剔除机器人(UNO)': "AND NOT regexp_like(LOWER(account_id), '(ai|fb).163.com') -- 仅UNO生效",
  };
  document.querySelectorAll('#chips-dq-filter-presets .chip').forEach(chip => {
    const inp = chip.querySelector('input');
    inp.addEventListener('change', () => {
      const filterEl = document.getElementById('dq_filter');
      const current = filterEl.value.trim();
      if (inp.checked) {
        filterEl.value = current ? current + '；' + inp.value : inp.value;
      } else {
        // 取消选中时从输入框移除
        filterEl.value = current.replace(new RegExp('[；;，,\\s]*' + inp.value.replace(/[()]/g, '\\$&'), 'g'), '').replace(/^[；;，,\s]+/, '');
      }
    });
  });

  // 全局搜索开关
  const searchToggle = document.getElementById('dq_global_search_toggle');
  const searchWrap = document.getElementById('dq-search-input-wrap');
  const searchStatus = document.getElementById('dq-search-status');
  if (searchToggle) {
    searchToggle.addEventListener('change', () => {
      if (searchToggle.checked) {
        searchWrap.style.display = 'block';
        searchStatus.textContent = '已启用';
        searchStatus.style.color = 'var(--brand-1)';
        searchStatus.style.fontWeight = '600';
        document.getElementById('dq_search_keywords').focus();
      } else {
        searchWrap.style.display = 'none';
        searchStatus.textContent = '未启用';
        searchStatus.style.color = 'var(--text-3)';
        searchStatus.style.fontWeight = '500';
      }
    });
  }

  // 看板口径开关
  const dashboardToggle = document.getElementById('dq_dashboard_toggle');
  const dashboardDesc = document.getElementById('dq-dashboard-desc');
  const dashboardStatus = document.getElementById('dq-dashboard-status');
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

  // 提交
  document.getElementById('dq-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!FF.validate(e.target)) return;
    const data = collect();
    const sqlPrompt = buildPrompt(data);
    const analysisPrompt = buildAnalysisTemplate(data);
    const fullPrompt = buildFullPrompt(data, sqlPrompt, analysisPrompt);
    FF.renderArtifacts([
      { key: 'sql', label: 'SQL Prompt', content: sqlPrompt },
      { key: 'analysis', label: '分析 Prompt', content: analysisPrompt },
      { key: 'full', label: '全能数分 Prompt', content: fullPrompt },
      { key: 'json', label: '结构化需求 JSON', content: JSON.stringify(data, null, 2) },
    ], { collectFn: collect });
  });
});

function collect() {
  const searchEnabled = document.getElementById('dq_global_search_toggle') && document.getElementById('dq_global_search_toggle').checked;
  const dashboardEnabled = document.getElementById('dq_dashboard_toggle') && document.getElementById('dq_dashboard_toggle').checked;
  return {
    module: 'daily_query',
    product: FF.val('product'),
    project: FF.val('product') + ' 日常取数',
    owner: FF.val('owner'),
    goal: FF.val('query_desc'),
    date_range: [FF.val('date_start'), FF.val('date_end')],
    query_desc: FF.val('query_desc'),
    dims: FF.getCheckedChips('dq_dims'),
    filter: FF.val('dq_filter'),
    column_map: FF.collectRows('dq-map-rows', ['col_name', 'col_desc', 'col_type']),
    log_refs: FF.collectRows('dq-log-ref-rows', ['log_name', 'doc_url', 'fields']),
    sql_refs: FF.collectRows('dq-sql-ref-rows', ['sql_label', 'sql_code']),
    global_search: searchEnabled ? (FF.val('dq_search_keywords') || '').trim() : '',
    dashboard_mode: dashboardEnabled,
  };
}

function buildPrompt(d) {
  const meta = PRODUCT_META[d.product] || {};
  const L = [];
  L.push('# 角色');
  L.push('你是资深数据分析师，精通 Presto/Trino。请基于以下需求编写一段可直接执行的取数 SQL。');
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
    L.push('4. 如果搜索到的口径与数据口径字典有冲突，以搜索结果为准');
    L.push('');
  }
  L.push('# 需求');
  L.push(d.query_desc);
  L.push('');
  L.push('# 数据源');
  L.push(`- 产品：${d.product}`);
  L.push(`- 活跃/主表：${meta.active_table || '（请确认）'}`);
  L.push(`- 用户主键：${meta.uid || '（请确认）'}`);
  L.push('- 引擎：Presto/Trino；客户端 UPPER(client)=\'APP\'；平台 UPPER(platform) IN (\'IOS\',\'ANDROID\')');
  if (meta.note) L.push(`- ⚠️ ${meta.note}`);
  if (d.date_range[0] || d.date_range[1]) L.push(`- 时间范围：${d.date_range[0] || '不限'} ~ ${d.date_range[1] || '不限'}`);
  L.push('');
  if (d.dims.length) {
    L.push('# 输出维度');
    d.dims.forEach(dim => L.push(`- ${dim}`));
    L.push('');
    // 地区维度 SQL 片段
    if (d.dims.includes('area_type')) {
      L.push('# area_type (T地区) SQL 片段');
      L.push("```sql");
      L.push("CASE");
      L.push("  WHEN UPPER(country) IN ('US') THEN 'US'");
      L.push("  WHEN UPPER(country) IN ('AU','CA','CN','DE','HK','JP','KR','NZ','SG','TW','GB','FR') THEN 'T1'");
      L.push("  WHEN UPPER(country) IN ('AE','AT','BE','BS','CH','CY','CZ','DK','EE','ES','FI','HU','IE','IL','IS','IT','KW','LU','NL','NO','PL','PR','PT','QA','RU','SA','SE','SM','SV','TR') THEN 'T2'");
      L.push("  ELSE 'T3'");
      L.push("END AS area_type");
      L.push("```");
      L.push('');
    }
    if (d.dims.includes('area_group')) {
      L.push('# area_group (Group地区) SQL 片段');
      L.push("```sql");
      L.push("CASE");
      L.push("  WHEN country = 'US' THEN 'US'");
      L.push("  WHEN country IN ('TZ','BG','BW','UA','GE','LT','NZ','CG','TR','GB','UZ','GT','CY','ZA','HN','UY','SR','JM','PK','YE','DE','RS','RO','GH','IT','CA','NA','FI','KY','EE','OM','IE','TG','AL','EG','BB','DK','SI','AW','HK','AO','JP','SE','WS','SA','JO','NL','BE','LU','AU','MT','AT','BN','SG','CS','HR','NO','GP','BS','NC','GM','CH','LB','CN','FJ','PR','LY','AE','YT','IL','NG','MU','GI','SC','MR','MQ','CM','BH','LI','MV','GR','LA','FO','CV','GG','IM','QA','NE','GU','IO','IS','DM','KW','GA','VU','SL','BZ','GY','MS','AI','ZW','RU','RW') THEN 'GroupA'");
      L.push("  WHEN country IN ('TN','GF','MW','GD','BD','AM','HU','MA','NI','DO','SK','ZM','IR','MY','ES','PA','PL','LR','TW','LV','SN','VN','FR') THEN 'GroupB'");
      L.push("  ELSE 'GroupC'");
      L.push("END AS area_group");
      L.push("```");
      L.push('');
    }
    if (d.dims.includes('reg_days')) {
      L.push('# reg_days (注册天数分段) SQL 片段');
      L.push("```sql");
      L.push("CASE");
      L.push("  WHEN been_reg_days = 1                       THEN 'A:1'");
      L.push("  WHEN been_reg_days BETWEEN 2   AND 7         THEN 'B:2~7'");
      L.push("  WHEN been_reg_days BETWEEN 8   AND 15        THEN 'C:8~15'");
      L.push("  WHEN been_reg_days BETWEEN 16  AND 30        THEN 'D:16~30'");
      L.push("  WHEN been_reg_days BETWEEN 31  AND 60        THEN 'E:31~60'");
      L.push("  WHEN been_reg_days BETWEEN 61  AND 90        THEN 'F:61~90'");
      L.push("  WHEN been_reg_days BETWEEN 91  AND 180       THEN 'G:91~180'");
      L.push("  WHEN been_reg_days BETWEEN 181 AND 360       THEN 'H:181~360'");
      L.push("  WHEN been_reg_days >= 361                    THEN 'I:360+'");
      L.push("  ELSE 'Z:others'");
      L.push("END AS been_reg_days_type");
      L.push("```");
      L.push('');
    }
  }
  if (d.filter) {
    L.push('# 额外过滤');
    // 把快捷预设翻译成 SQL 条件
    let filterText = d.filter;
    const filterMap = {
      '只看APP': "AND UPPER(client) = 'APP'",
      '只看成年人': 'AND is_adult = 1 -- 剔除未成年',
      '只看新用户': 'AND been_reg_days = 1 -- 注册天数=1 当日新增',
      '剔除机器人(UNO)': "AND NOT regexp_like(LOWER(account_id), '(ai|fb)\\.163\\.com') -- 仅UNO产品生效",
    };
    Object.entries(filterMap).forEach(([k, v]) => {
      filterText = filterText.replace(k, v);
    });
    L.push(filterText);
    L.push('');
  }
  // 看板口径 DAU
  if (d.dashboard_mode) {
    L.push('# ⚠️ 看板口径【必须遵循】');
    L.push('> **重要：用户已启用看板口径模式。计算 DAU 时必须严格使用以下 SQL 口径，注意表名和过滤条件！**');
    L.push('');
    if (d.product === 'UNO' || d.product === 'ALL') {
      L.push('## UNO 看板 DAU 口径');
      L.push('```sql');
      L.push("SELECT date, COUNT(DISTINCT account_id) AS dau");
      L.push("FROM dw_ods_mn01.dm_mn01_player_active_info");
      L.push("WHERE date = '日期'");
      L.push("  AND NOT regexp_like(LOWER(account_id), '(ai|fb).163.com') -- 剔除机器人");
      L.push("  AND is_adult = 1");
      L.push("  AND UPPER(client) = 'APP'");
      L.push("GROUP BY 1");
      L.push('```');
      L.push('');
    }
    if (d.product === 'P10' || d.product === 'ALL') {
      L.push('## P10 看板 DAU 口径');
      L.push('```sql');
      L.push("SELECT date, COUNT(DISTINCT account_id) AS dau");
      L.push("FROM dw_ods_common_mn02.dm_mn02_player_active_info");
      L.push("WHERE date = '日期'");
      L.push("  AND is_adult = 1");
      L.push("  AND UPPER(client) = 'APP'");
      L.push("GROUP BY 1");
      L.push('```');
      L.push('');
    }
    if (d.product === 'SKB' || d.product === 'ALL') {
      L.push('## SKB 看板 DAU 口径');
      L.push('```sql');
      L.push("SELECT date, COUNT(DISTINCT account_id) AS dau");
      L.push("FROM dw_ods_common_mn04.dm_mn04_sdk_player_active_info");
      L.push("WHERE date = '日期'");
      L.push("  AND is_adult = 1");
      L.push("  AND UPPER(client) = 'APP'");
      L.push("GROUP BY 1");
      L.push('```');
      L.push('');
    }
    if (d.product === 'UNO2' || d.product === 'ALL') {
      L.push('## UNO2 看板 DAU 口径');
      L.push('```sql');
      L.push("SELECT date, COUNT(DISTINCT account_id) AS dau");
      L.push("FROM dw_ods_mn08.dm_mn08_player_active_info");
      L.push("WHERE date = '日期'");
      L.push("  AND is_adult = 1");
      L.push("  AND UPPER(client) = 'APP'");
      L.push("GROUP BY 1");
      L.push('```');
      L.push('');
    }
    // 看板口径：广告收入计算规则
    L.push('## 看板口径：广告收入计算规则');
    L.push('> **启用看板口径时，广告收入必须从各产品活跃用户表中直接取字段，不要用原始日志表计算。**');
    L.push('');
    L.push('| 产品 | 活跃表 | 总广告收入 | RV收入 | INT收入 | 说明 |');
    L.push('|------|--------|-----------|--------|---------|------|');
    L.push('| UNO | dm_mn01_player_active_info | advalue_sum_1d | advalue_reward_sum_1d | advalue_interstitial_sum_1d | 分RV/INT |');
    L.push('| P10 | dm_mn02_player_active_info | advalue_sum_1d | advalue_reward_sum_1d | advalue_interstitial_sum_1d | 分RV/INT |');
    L.push('| SKB | dm_mn04_sdk_player_active_info | advalue_sum_1d | advalue_reward_sum_1d | advalue_interstitial_sum_1d | 分RV/INT |');
    L.push('| UNO2 | dm_mn08_player_active_info | advalue_sum_1d | 明细表计算 | 明细表计算 | 总收入用advalue_sum_1d；分类型需从 dw_ods_mn08.c_client_app_ad_log (log_subtype=advalue) 计算；安卓需/1000000 |');
    L.push('');
    L.push('**注意事项：**');
    L.push('- 总广告收入统一用 `advalue_sum_1d` 字段（含 RV + INT + Banner）');
    L.push('- 如需分广告类型：RV 用 `advalue_reward_sum_1d`，INT 用 `advalue_interstitial_sum_1d`');
    L.push('- UNO2 总收入用 `advalue_sum_1d`；分广告类型需从明细表 `dw_ods_mn08.c_client_app_ad_log` (log_subtype=advalue) 按 adtype 分组计算，安卓需 /1000000');

    L.push('');
  }
  // 数据口径字典引用
  L.push('# ⚠️ 数据口径字典【必须参考】');
  L.push('> **编写 SQL 前，必须先阅读以下数据口径字典页面的全部内容，严格遵循其中定义的表名、字段名、过滤条件和指标公式。不得自行编造任何字段或过滤逻辑。**');
  L.push('');
  L.push('📖 字典地址：https://troylul998-ship-it.github.io/MG_AI_ANALYTICS_REPORT/dictionary.html');
  L.push('');
  L.push('字典涵盖：');
  L.push('- 各产品数据源总览（表名、主键、广告收入字段）');
  L.push('- 各产品核心字段定义（UNO/P10/SKB/UNO2）');
  L.push('- 常用过滤条件标准写法（APP端、双端、新用户、成年人）');
  L.push('- 生命周期分段（LT7/LT30/LT60/LT90/LT180）');
  L.push('- 付费分层定义（pay_activity_type 0~7）');
  L.push('- 广告类型（RV/INT/Banner）');
  L.push('- 地区分组维度（T地区、Group地区 完整 CASE WHEN）');
  L.push('- 广告变现指标公式（eCPM/Freq/ARPU/LTV）');
  L.push('- 三方支付指标口径');
  L.push('');
  if (d.column_map && d.column_map.length) {
    L.push('# 数据列定义');
    L.push('| 列名 | 含义 | 类型 |');
    L.push('|------|------|------|');
    d.column_map.forEach(c => L.push(`| ${c.col_name} | ${c.col_desc} | ${c.col_type} |`));
    L.push('');
  }
  if (d.log_refs && d.log_refs.length) {
    L.push('# ⚠️ 埋点 / 日志参考【必须参考】');
    L.push('> **重要：编写 SQL 时必须优先参考以下埋点文档中的表名、字段名和口径定义，严禁自行猜测字段。**');
    L.push('');
    d.log_refs.forEach(r => {
      let line = `- 埋点：${r.log_name}`;
      if (r.doc_url) line += ` | 文档：${r.doc_url}`;
      if (r.fields) line += ` | 可获取：${r.fields}`;
      L.push(line);
    });
    L.push('');
  }
  if (d.sql_refs && d.sql_refs.length) {
    L.push('# ⚠️ 历史 SQL 参考【必须参考】');
    L.push('> **重要：以下历史 SQL 是经过验证可执行的，编写新 SQL 时必须优先参考其中的表名、JOIN 逻辑、字段名和过滤条件，保持口径一致。**');
    L.push('');
    d.sql_refs.forEach(r => {
      if (r.sql_label) L.push(`## ${r.sql_label}`);
      L.push('```sql'); L.push(r.sql_code); L.push('```');
    });
    L.push('');
  }
  L.push('# 要求');
  L.push('1. **必须先阅读数据口径字典页面**，从中获取真实表名、字段名、过滤条件和指标公式，不得自行编造');
  L.push('2. **必须优先参考上方提供的埋点文档和历史 SQL**，保持口径一致');
  L.push('3. **统计三方相关指标时，能用三方中间表的尽量用三方中间表**（如 `dm_mnXX_player_3pp_payment_info`），避免直接查 `omni_server_payment` 原始表。中间表每天刷新，字段包含 `third_payment_sum_1d`、`third_ingame_payment_sum_1d`、`third_web_payment_sum_1d` 等，可直接获取三方总收入/内嵌收入/主站收入');
  L.push('4. **UNO 产品的 account_id 需要做 split 处理**：`split(account_id, \'@\')[1] AS account_id`。UNO 原始 account_id 格式为 `xxx@yyy`，取 `@` 后面部分才是真实 account_id，用于与三方中间表等外部表 JOIN 时必须先 split');
  L.push('5. 输出可直接执行的完整 SQL');
  L.push('6. 列名用英文蛇形命名');
  L.push('7. 加简短注释说明每个 CTE 的作用');
  return L.join('\n');
}

function buildAnalysisTemplate(d) {
  const L = [];
  L.push('# 分析模板');
  L.push('');
  L.push('> ⚠️ **必须先阅读分析方法论页面，严格按照其中的分析框架和方法论来组织分析思路和输出结构。**');
  L.push('> 📖 方法论地址：https://troylul998-ship-it.github.io/MG_AI_ANALYTICS_REPORT/methodology.html');
  L.push('');
  L.push('## 1. 分析背景');
  L.push(`- 产品：${d.product}`);
  L.push(`- 时间范围：${d.date_range[0] || '不限'} ~ ${d.date_range[1] || '不限'}`);
  L.push(`- 需求：${d.query_desc}`);
  if (d.dims.length) L.push(`- 拆分维度：${d.dims.join('、')}`);
  if (d.filter) L.push(`- 过滤条件：${d.filter}`);
  L.push('');
  L.push('## 2. 核心指标定义');
  if (d.column_map && d.column_map.length) {
    d.column_map.filter(c => c.col_type === 'metric').forEach(c => {
      L.push(`- **${c.col_name}**：${c.col_desc || '（待补充定义）'}`);
    });
  }
  if (!d.column_map || !d.column_map.filter(c => c.col_type === 'metric').length) {
    L.push('- （根据 SQL 结果补充指标定义）');
  }
  L.push('');
  L.push('## 3. 分析思路');
  L.push('1. 先看整体趋势：指标随时间的变化');
  if (d.dims.length) L.push(`2. 按维度拆分：${d.dims.join('、')}，找差异最大的分组`);
  L.push(`${d.dims.length ? '3' : '2'}. 对比基准：环比/同比，判断变化是否异常`);
  L.push(`${d.dims.length ? '4' : '3'}. 结论：一句话说清核心发现 + 建议动作`);
  L.push('');
  L.push('## 4. 数据解读框架');
  L.push('跑完 SQL 拿到数据后，按以下框架解读：');
  L.push('');
  L.push('### 整体概览');
  L.push('- 核心指标的绝对值和变化幅度');
  L.push('- 是否在合理范围内（对比历史同期）');
  L.push('');
  if (d.dims.length) {
    L.push('### 维度拆解');
    d.dims.forEach(dim => {
      L.push(`- **${dim}**：哪个分组贡献最大/变化最明显`);
    });
    L.push('');
  }
  L.push('### 结论与建议');
  L.push('- 核心发现：（一句话）');
  L.push('- 可能原因：（列出 2-3 个假设）');
  L.push('- 建议动作：（下一步做什么）');
  L.push('');
  L.push('## 5. 注意事项');
  L.push('- 确认数据口径与文档一致');
  L.push('- 关注是否有数据缺失或异常值');
  L.push('- 部分期间数据不要和完整期间直接对比');
  L.push('');
  L.push('## 6. 分析方法论参考');
  L.push('分析过程中必须参考以下方法论文档，确保分析框架、归因逻辑和结论格式符合团队标准：');
  L.push('📖 https://troylul998-ship-it.github.io/MG_AI_ANALYTICS_REPORT/methodology.html');
  return L.join('\n');
}

// 产品名 → MCP sql_query 的 project 参数映射
const PRODUCT_PROJECT_MAP = {
  'P10': 'phase10',
  'SKB': 'skipbo',
  'UNO': 'uno',
  'UNO2': 'uno wonder',
  'ALL': 'uno',
};

function buildFullPrompt(d, sqlPrompt, analysisPrompt) {
  const project = PRODUCT_PROJECT_MAP[d.product] || d.product.toLowerCase();
  const L = [];

  L.push('# 全能数分 Prompt');
  L.push('');
  L.push('> 本 Prompt 将引导你逐步完成「生成 SQL → 执行取数 → 数据分析」全流程。');
  L.push('> 请严格按照以下三个步骤顺序执行，每一步完成后再进入下一步。');
  L.push('');
  L.push('---');
  L.push('');

  // Step 1: SQL Prompt
  L.push('## 📝 Step 1：生成取数 SQL');
  L.push('');
  L.push('请根据以下需求生成可直接执行的 Presto/Trino SQL：');
  L.push('');
  L.push(sqlPrompt);
  L.push('');
  L.push('---');
  L.push('');

  // Step 2: Run SQL
  L.push('## ⚡ Step 2：执行 SQL 取数');
  L.push('');
  L.push('SQL 生成完成后，请使用 MCP 工具 `sql_query` 执行上面生成的 SQL。');
  L.push('');
  L.push('**执行参数：**');
  L.push(`- project：\`${project}\``);
  L.push('- sql：上一步生成的完整 SQL 语句');
  L.push('');
  L.push('**执行要求：**');
  L.push('1. 将 Step 1 生成的 SQL 直接传入 `sql_query` 工具执行');
  L.push('2. 执行成功后，记录返回的 CSV 文件本地路径');
  L.push('3. 如果执行报错，根据错误信息修正 SQL 后重新执行（最多重试 2 次）');
  L.push('4. 执行成功后，读取 CSV 文件内容，展示前 10 行数据预览');
  L.push('');
  L.push('---');
  L.push('');

  // Step 3: Analysis Prompt
  L.push('## 📊 Step 3：数据分析');
  L.push('');
  L.push('SQL 执行成功并获取到数据后，请基于 CSV 结果进行分析：');
  L.push('');
  L.push(analysisPrompt);
  L.push('');
  L.push('---');
  L.push('');

  // Final output format
  L.push('## 📋 最终输出格式');
  L.push('');
  L.push('完成以上三步后，请按以下格式整理输出：');
  L.push('');
  L.push('### 1. 取数 SQL');
  L.push('```sql');
  L.push('（粘贴最终执行成功的 SQL）');
  L.push('```');
  L.push('');
  L.push('### 2. 数据文件');
  L.push('- CSV 本地路径：`（填入 sql_query 返回的文件路径）`');
  L.push('- 数据行数：X 行');
  L.push('- 数据预览：（前 10 行表格）');
  L.push('');
  L.push('### 3. 分析结论');
  L.push('（按 Step 3 的分析框架输出结论）');
  L.push('');
  L.push('---');
  L.push('');
  L.push('### 4. 是否需要生成分析报告？');
  L.push('');
  L.push('> 📄 数据分析已完成。是否需要我进一步生成一份 **可视化分析报告（HTML 格式）**？');
  L.push('> 报告将包含：数据图表、核心发现、维度拆解、结论建议，可直接在浏览器打开查看或分享给团队。');
  L.push('');
  L.push('请回复「需要」或「不需要」。');
  L.push('');
  L.push('---');
  L.push('');
  L.push('### 5. 是否需要推送飞书？');
  L.push('');
  L.push('> 📨 是否需要将分析结论推送到 **飞书群** 中？');
  L.push('> 推送内容为标准化的飞书卡片消息，包含以下信息：');
  L.push('');
  L.push('**飞书卡片内容：**');
  L.push('- 📊 **分析摘要**：核心发现 + 结论建议（2-3 句话）');
  L.push('- 📈 **关键指标**：核心数据变化（如 DAU +5%、付费率 -2%）');
  L.push('- 📄 **分析报告**：[点击打开 HTML 报告]（按钮形式，链接到本地报告文件路径）');
  L.push('- 📁 **数据源文件**：[点击下载 CSV 数据]（按钮形式，链接到本地 CSV 文件路径）');
  L.push('');
  L.push('**推送格式要求：**');
  L.push('使用飞书 MCP 工具 `im_v1_message_create` 发送卡片消息（msg_type: interactive），卡片结构如下：');
  L.push('');
  L.push('```json');
  L.push('{');
  L.push('  "config": { "wide_screen_mode": true },');
  L.push('  "header": {');
  L.push('    "title": { "tag": "plain_text", "content": "📊 数据分析报告 - [产品名] [需求描述]" },');
  L.push('    "template": "green"');
  L.push('  },');
  L.push('  "elements": [');
  L.push('    { "tag": "markdown", "content": "**核心发现：**\\n（填入 1-2 句话的分析结论）\\n\\n**关键指标：**\\n（填入核心数据变化）" },');
  L.push('    { "tag": "hr" },');
  L.push('    { "tag": "markdown", "content": "**📅 分析周期：** （时间范围）\\n**🎮 产品：** （产品名）\\n**📐 维度：** （拆分维度）" },');
  L.push('    { "tag": "hr" },');
  L.push('    { "tag": "action", "actions": [');
  L.push('      { "tag": "button", "text": { "tag": "plain_text", "content": "📄 打开分析报告" }, "url": "file:///（HTML报告本地路径）", "type": "primary" },');
  L.push('      { "tag": "button", "text": { "tag": "plain_text", "content": "📁 下载数据文件" }, "url": "file:///（CSV文件本地路径）", "type": "default" }');
  L.push('    ] }');
  L.push('  ]');
  L.push('}');
  L.push('```');
  L.push('');
  L.push('请回复「需要推送」并告诉我目标飞书群的 chat_id，或回复「不需要」。');

  return L.join('\n');
}
