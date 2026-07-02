/* ============================================================
日报/周报分析工作台 — 全流程自动化
OmniEye 提数 → CSV 整理 → AI 分析 → 飞书文档 → 卡片推送
============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  FF.init();

  // 修复默认选中的 radio chips 初始样式
  document.querySelectorAll('.chip input[type="radio"]:checked').forEach(inp => {
    const chip = inp.closest('.chip');
    if (chip) chip.classList.add('checked');
  });
  document.querySelectorAll('.chip input[type="checkbox"]:checked').forEach(inp => {
    const chip = inp.closest('.chip');
    if (chip) chip.classList.add('checked');
  });

  // Wizard 步骤配置
  FF.initWizard([
    { title: '基本信息', question: '生成什么报告？', explain: '选报告类型、数据日期、覆盖产品。', example: '<b>例：</b>日报，2026-06-28，全部产品' },
    { title: '数据源', question: '从哪里取数据？', explain: '配置数据来源、数据类型和需要拉取的维度。', example: '<b>例：</b>OmniEye 自动拉取，Log 数据，全维度' },
    { title: '分析输出', question: '分析和输出配置', explain: '选模板、设分析要求、配推送渠道。填业务背景让分析更准。', example: '<b>例：</b>标准模板 + 归因分析 + 推送 Mobile Growth 群' },
  ]);

  // 报告类型切换
  document.querySelectorAll('input[name="report_type"]').forEach(r => {
    r.addEventListener('change', () => {
      const label = document.querySelector('label[for="report_date"]') ||
        document.getElementById('report_date').previousElementSibling;
    });
  });

  // 动态行：标准化文档参考
  const templateRefDyn = FF.initDynamic('dr-template-ref-rows', 'dr-add-template-ref', (data) => {
    const d = data || {};
    return `<input type="text" data-f="doc_name" placeholder="文档名" value="${FF.esc(d.doc_name||'')}" style="flex:0 0 160px;">` +
    `<input type="text" data-f="doc_url" placeholder="文档链接（选填）" value="${FF.esc(d.doc_url||'')}" style="flex:1;">`;
  }, { rowClass: 'dyn-row' }) || { addRow: () => {}, container: null };

  // 数据源切换：OmniEye ↔ CSV 上传
  document.querySelectorAll('input[name="data_source"]').forEach(r => {
    r.addEventListener('change', () => {
      const isCSV = document.querySelector('input[name="data_source"]:checked')?.value === 'csv';
      document.getElementById('csv-upload-area').style.display = isCSV ? 'block' : 'none';
      document.getElementById('source-hint-omnieye').style.display = isCSV ? 'none' : 'block';
      document.getElementById('field-data-type').style.display = isCSV ? 'none' : '';
    });
  });

  // CSV 文件上传
  const csvDrop = document.getElementById('dr-csv-drop');
  if (csvDrop) {
    csvDrop.addEventListener('dragover', e => { e.preventDefault(); csvDrop.style.borderColor = 'var(--brand-1)'; csvDrop.style.background = '#fff5f0'; });
    csvDrop.addEventListener('dragleave', () => { csvDrop.style.borderColor = 'var(--border)'; csvDrop.style.background = '#fafafa'; });
    csvDrop.addEventListener('drop', e => {
      e.preventDefault();
      csvDrop.style.borderColor = 'var(--border)'; csvDrop.style.background = '#fafafa';
      const file = e.dataTransfer.files[0];
      if (file) showCsvFile(file);
    });
    csvDrop.addEventListener('click', () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = '.csv,.tsv,.txt';
      inp.onchange = () => { if (inp.files[0]) showCsvFile(inp.files[0]); };
      inp.click();
    });
  }

  function showCsvFile(file) {
    document.getElementById('csv-file-info').style.display = 'block';
    document.getElementById('csv-file-name').textContent = file.name;
    document.getElementById('csv-file-size').textContent = (file.size / 1024).toFixed(1) + ' KB';
    window.__uploadedCsvFile = file;
  }

  // 重置
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('确认重置？')) location.reload();
  });

  // 提交
  document.getElementById('dr-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!FF.validate(e.target)) return;
    const data = collect();
    const fullPrompt = buildFullPrompt(data);
    const dataPrompt = buildDataPrompt(data);
    const analysisPrompt = buildAnalysisPrompt(data);
    FF.renderArtifacts([
      { key: 'full', label: '🚀 全能日报 Prompt', content: fullPrompt },
      { key: 'data', label: '📊 数据提取 Prompt', content: dataPrompt },
      { key: 'analysis', label: '📝 分析模板 Prompt', content: analysisPrompt },
      { key: 'json', label: '⚙️ 结构化配置 JSON', content: JSON.stringify(data, null, 2) },
    ], { collectFn: collect });
  });
});

/* ---------- 数据收集 ---------- */
function collect() {
  return {
    module: 'daily_report',
    report_type: document.querySelector('input[name="report_type"]:checked')?.value || 'daily',
    report_date: FF.val('report_date'),
    products: FF.getCheckedChips('dr_products'),
    data_source: document.querySelector('input[name="data_source"]:checked')?.value || 'omnieye',
    data_type: document.querySelector('input[name="data_type"]:checked')?.value || 'log',
    dims: FF.getCheckedChips('dr_dims'),
    compare: FF.getCheckedChips('dr_compare'),
    template: document.querySelector('input[name="analysis_template"]:checked')?.value || 'standard',
    template_refs: FF.collectRows('dr-template-ref-rows', ['doc_name', 'doc_url']),
    reqs: FF.getCheckedChips('dr_reqs'),
    context: FF.val('dr_context'),
    outputs: FF.getCheckedChips('dr_output'),
    project: 'MG 变现日报',
    goal: '生成变现日报',
  };
}

/* ---------- 全能日报 Prompt ---------- */
function buildFullPrompt(d) {
  const typeLabel = d.report_type === 'daily' ? '日报' : '周报';
  const productList = d.products.join('、');
  const chatNames = {
    'oc_efab06bc2b4f283575440499e8f802e2': 'Mobile Growth',
    'oc_9b0689b9a37e1eebf014fb39d8c78638': 'MG 变现小群',
    'oc_44ce402d9ee9d0f901b61e6885cc33b1': '赛博牛马🐂'
  };

  const L = [];
  L.push(`# Mobile Growth 变现${typeLabel}生成任务`);
  L.push('');
  L.push(`> 请为 ${productList} 生成 ${d.report_date} 的变现${typeLabel}，完整执行以下 5 个步骤。`);
  L.push('');
  L.push('**⚠️ 日报命名规则**：日报标题使用"生成日期"（今天），而非数据日期。数据总结里"日期"填数据日期，"环比"为数据日期 vs 前一天。');
  L.push('');
  L.push('**📐 格式参考（必须严格遵循）**：');
  L.push('- 日报分析模板：https://troylul998-ship-it.github.io/MG_AI_ANALYTICS_REPORT/methodology.html （左侧导航"日报分析模板"章节）');
  L.push('- 飞书卡片推送模板：https://troylul998-ship-it.github.io/MG_AI_ANALYTICS_REPORT/methodology.html （左侧导航"日报卡片推送"章节）');
  L.push('');
  L.push('---');
  L.push('');

  // Step 1
  L.push('## Step 1：从 OmniEye 提取数据');
  L.push('');
  L.push(buildDataPrompt(d));
  L.push('');
  L.push('---');
  L.push('');

  // Step 2
  L.push('## Step 2：整理为 CSV 文件');
  L.push('');
  L.push('将拉取到的数据整理为以下 CSV 文件：');
  L.push('1. `01_summary_table.csv` — 汇总报表（含环比/周同比计算）');
  L.push('2. `02_data_overview.csv` — 数据概况（RV/INT/Banner 细分）');
  L.push('3. `03_overall_revenue.csv` — 整体数据（分 AND/IOS 收入和 ARPU）');
  L.push('4. `04_platform_data.csv` — 平台数据（Freq/DAU 和 eCPM）');
  L.push('5. `05_online_duration.csv` — 在线时长');
  L.push('6. `06_channel_data.csv` — 渠道数据（分平台×渠道）');
  L.push('7. `07_ad_placement.csv` — 点位数据（Top 广告点位）');
  L.push('');
  if (d.compare.includes('dod')) L.push('- **环比计算**：当日 vs 前一日');
  if (d.compare.includes('wow')) L.push('- **周同比计算**：当日 vs 7天前同期');
  L.push('');
  L.push('---');
  L.push('');

  // Step 3
  L.push('## Step 3：按固定模板生成分析');
  L.push('');
  L.push(buildAnalysisPrompt(d));
  L.push('');
  L.push('---');
  L.push('');

  // Step 4
  if (d.outputs.includes('feishu_doc')) {
    L.push('## Step 4：创建飞书文档');
    L.push('');
    L.push('```bash');
    L.push('# 1. 创建文档');
    L.push('cmd /c "lark-cli docs +create --api-version v2 --doc-format markdown --content @report.md --as bot"');
    L.push('');
    L.push('# 2. 授予管理权限（必须执行）');
    L.push('cmd /c "lark-cli drive permission.members create --as bot --yes --params @perm_params.json --data @perm_data.json"');
    L.push('```');
    L.push('');
    L.push('perm_data.json 内容：');
    L.push('```json');
    L.push('{"member_type": "openid", "member_id": "ou_34119b0418e16d76e5f0f620a59a2399", "perm": "full_access", "type": "user"}');
    L.push('```');
    L.push('');
    L.push('---');
    L.push('');
  }

  // Step 5
  if (d.outputs.includes('feishu_card')) {
    L.push('## Step 5：推送飞书卡片通知（需确认）');
    L.push('');
    L.push('> 📨 日报生成完成后，请询问用户：');
    L.push('');
    L.push('**请问是否需要将日报推送到飞书群？**');
    L.push('- 如果需要，请告诉我要推送到哪个群组？（如：Mobile Growth、MG 变现小群、赛博牛马🐂）');
    L.push('- 是否需要 @ 通知特定成员？如果需要，请告诉我成员的名字。');
    L.push('');
    L.push('**推送格式说明：**');
    L.push('- 使用飞书卡片 JSON 2.0 格式（`schema: "2.0"`，`body.elements` 结构）');
    L.push('- 卡片结构：报告信息 → 收入概况表格（飞书原生 `table` 组件）→ 日报重点 → 近期趋势');
    L.push('- 推送方式：Node.js 脚本 + cmd.exe（转义 `"` 为 `\\"` 且 `&` 为 `^&`）');
    L.push('- @ 提及格式：`<at user_id="ou_xxx">姓名</at>`');
    L.push('');
    L.push('**已知群组 ID：**');
    L.push('| 群组名 | chat_id |');
    L.push('|--------|---------|');
    L.push('| Mobile Growth | oc_efab06bc2b4f283575440499e8f802e2 |');
    L.push('| MG 变现小群 | oc_9b0689b9a37e1eebf014fb39d8c78638 |');
    L.push('| 赛博牛马🐂 | oc_44ce402d9ee9d0f901b61e6885cc33b1 |');
    L.push('');
    L.push('**已知成员 open_id：**');
    L.push('| 姓名 | open_id |');
    L.push('|------|---------|');
    L.push('| 徐丹 | ou_a007e6683d73240f2b45117b1a4265bd |');
    L.push('| 李超 | ou_42dc86ba9e33cd81a2c81fa0a68d4e00 |');
    L.push('| 陆嘉欣 | ou_34119b0418e16d76e5f0f620a59a2399 |');
  }

  return L.join('\n');
}

/* ---------- 数据提取 Prompt ---------- */
function buildDataPrompt(d) {
  const productMap = { 'UNO': 'uno', 'UNO2': 'uno wonder', 'P10': 'phase10', 'SKB': 'skipbo' };
  const L = [];
  L.push('### 数据提取配置');
  L.push('');
  L.push('- **平台**：OmniEye 关键数据趋势看板');
  L.push('- **链接**：https://omnieye.mattel163.com/index.html#/v3/adverAna/keytrend');
  L.push(`- **数据类型**：${d.data_type === 'log' ? 'Log（客户端打点）' : 'API（渠道回传）'}`);
  L.push(`- **日期范围**：${d.report_date} 前后 10 天`);
  L.push(`- **产品**：${d.products.map(p => `${p}(${productMap[p]})`).join('、')}`);
  L.push('');
  L.push('### 需要调用的接口');
  L.push('');
  if (d.dims.includes('summary')) L.push('- `adverAnakeytrendTable` — 汇总报表');
  if (d.dims.includes('overview')) L.push('- `adverAnakeytrendTable` — 数据概况（含 RV/INT/Banner 子项）');
  if (d.dims.includes('revenue')) L.push('- `adverAnakeytrendRevenue` — 整体数据（分平台收入/ARPU/在线时长）');
  if (d.dims.includes('platform')) L.push('- `adverAnakeytrendeCPM` — 平台数据（分 RV/INT Freq/DAU、eCPM）');
  if (d.dims.includes('channel')) L.push('- `adverAnakeytrendTableAdchannel` — 渠道数据（需分 AND/IOS 各调一次）');
  if (d.dims.includes('placement')) L.push('- `adverAnakeytrendTablePointLog` — 点位数据');
  L.push('');
  L.push('### 公共参数模板');
  L.push('```json');
  L.push(`{"adchannel": ["all"], "adtype": ["all"], "country": ["All"], "dataType": "${d.data_type}", "dateEnd": "${d.report_date}", "dateStart": "前10天", "dateType": "date", "platform": ["All"]}`);
  L.push('```');
  L.push('');
  L.push('**注意**：渠道数据需额外用 `platform: ["ANDROID"]` 和 `platform: ["IOS"]` 各调一次。');
  return L.join('\n');
}

/* ---------- 分析模板 Prompt ---------- */
function buildAnalysisPrompt(d) {
  const L = [];
  L.push('### 日报命名与日期规则');
  L.push('');
  L.push('- **日报文件/文档标题**：`Mobile Growth_变现日报速览_<生成日期>`，生成日期 = 今天（执行日报任务的日期），而非数据日期');
  L.push('- **数据总结区的"日期"字段**：填数据日期（即被分析的那一天，通常是昨天）');
  L.push('- **数据总结区的"环比"字段**：`数据日期 / 数据日期前一天`（即昨天 vs 大前天）');
  L.push('- **示例**：今天是 2026-06-30，分析 06-29 的数据 → 标题为 `_2026.06.30`，日期为 `2026-06-29`，环比为 `2026-06-29 / 2026-06-28`');
  L.push('');
  L.push('### 分析模板结构');
  L.push('');
  L.push('**1. 收入概况表**');
  L.push('| 产品 | IAA 收入 | IAA 环比 | IAA 同比 | DAU | 频次 | eCPM(log) | AdARPU | 归因 |');
  L.push('');
  L.push('**2. 分产品分析**（每产品 4 个维度）：');
  L.push('- **整体**：收入变化方向 + 主要拖累/驱动项（如"DAU 明显下滑是主要拖累项，ARPU 小幅回升"）');
  L.push('- **平台**：双端 ARPU 的变化方向和分化表现（如"AND 端小幅回升，iOS 端小幅下滑"）');
  L.push('- **渠道**：eCPM 变化方向 + 主要影响渠道（如"双端 eCPM 均有所下滑，主要受 AL 为主大部分渠道影响"）');
  L.push('- **点位**：在线时长方向 + 核心点位频次变化 + 哪些点位形成支撑/拖累（如"在线时长明显回升；核心 int_gamefinish 频次小幅回落，结算礼包和活动 token 形成支撑"）');
  L.push('');
  L.push('**3. 关键结论**：整体情况、效率分化、点位活动、关注点');
  L.push('');
  L.push('**4. 近期趋势**：每产品一条趋势总结');
  L.push('');
  L.push('### 分析输出风格规则（重要）');
  L.push('');
  L.push('**分产品分析部分（整体/平台/渠道/点位）必须遵循以下风格：**');
  L.push('');
  L.push('**"整体"维度特殊规则：**');
  L.push('- ✅ "整体"行的第一句**必须保留收入环比数值**（如"收入 -1.90%"），后接各指标方向性归因');
  L.push('- 格式："收入 X.XX%，[DAU/频次/eCPM 方向]；[对冲/加剧描述]"');
  L.push('- 示例："收入 -1.90%，DAU 基本稳定，频次小幅提升；但 eCPM(log) 与 AdARPU 下滑"');
  L.push('');
  L.push('**"平台"维度规则：**');
  L.push('- ❌ 不要只描述方向（如"AND 端降幅略大于 IOS 端"）');
  L.push('- ✅ 要指出 ARPU 变化的驱动指标是什么（eCPM？频次？DAU？）');
  L.push('- 示例："双端 ARPU 均有下滑，主要受eCPM下降影响，DAU频次小幅增长"');
  L.push('');
  L.push('**"渠道"维度规则：**');
  L.push('- ✅ 简洁直接指出核心影响渠道，❌ 绝对不出现 eCPM 具体数值（如 $27.47 vs $28.18）');
  L.push('- ✅ 分平台点名主导渠道：IOS 与 AND 的主导渠道常不同，需分别说明（如 IOS=AL、AND=moloco）');
  L.push('- ✅ eCPM 变化常按广告类型（RV/INT/Banner）分化，需分类型说方向（如"RV eCPM回升，INT和banner下滑"）');
  L.push('- ✅ 分平台说明时需体现正负因素的对冲关系');
  L.push('- 示例："双端 eCPM 小幅回落，IOS受以AL为主大部分渠道下滑影响，AND受以moloco为主大部分渠道下滑影响"');
  L.push('- 示例："iOS主要是AL增长拉高大盘，And虽然AL也有增长，但Unity和Moloco下滑起到负向对冲"');
  L.push('');
  L.push('**"点位"维度规则：**');
  L.push('- ❌ 不要写"各点位表现稳定"这种空话');
  L.push('- ✅ 指出哪类点位（INT/RV/活动/Banner）频次在变化，以及变化对大盘的影响方向');
  L.push('- ✅ 点位异动优先归因到已知业务事件（如外观点位奖励更新、活动上线/放量）');
  L.push('- ✅ 在线时长可保留变化率百分比（如"在线时长小幅回落 -1.87%"）');
  L.push('- 示例："DAU频次受外观点位奖励更新影响，单点位频次提升明显影响大盘"');
  L.push('- 示例："INT、banner、对局相关点位频次均有所下滑影响大盘"');
  L.push('');
  L.push('**方向判断规则（重要）：**');
  L.push('- ❌ 不要偏保守/模糊判断（如"gamefinish 频次保持稳定，Banner 有所恢复"）');
  L.push('- ✅ 数据显示下滑就明确说"下滑拖累大盘"，不用"稳定/恢复/无拖累"回避负向结论');
  L.push('- ✅ 整体归因可直接点明指标传导链（如"DAU频次下滑使得ARPU下降"），不必过度包装');
  L.push('');
  L.push('**其他格式规则：**');
  L.push('- 收入概况表中数值不加 emoji 标记（不要 ⚠️⬆️ 等符号）');
  L.push('- 平台/渠道/点位维度不出现 $xx、xxmin 等具体数值（在线时长变化率除外）');
  L.push('- 点位名称保留（如 int_gamefinish、rv_dig_hunter），但不列具体频次/参与率数值');
  L.push('');
  L.push('**归因描述要求（因果链条完整）：**');
  L.push('- ❌ 不要只写"DAU下降是主因"这样简单归因');
  L.push('- ✅ 要写完整因果链："DAU 明显下滑拖累收入，频次与 AdARPU 回升形成部分对冲，但 eCPM(log) 回落限制收入修复"');
  L.push('- 每个归因需包含：主因 + 对冲/加剧因素 + 综合影响方向');
  L.push('');
  L.push('**业务背景融入要求：**');
  L.push('- 结合实际业务事件（活动上下线、功能开放、赛季切换等）做归因');
  L.push('- ❌ "收入增长主要来自价格端" → ✅ "主要是挖蘑菇新开，RV频次明显增长，eCPM也有小幅增长共同带来"');
  L.push('- 如有已知的业务事件（活动上线、功能放量等），必须在相关产品分析中体现');
  L.push('');
  L.push('**近期趋势和关键结论用词规则：**');
  L.push('- 用中性前瞻性语言，不做价值判断式描述');
  L.push('- ❌ 避免："表现亮眼""创近期新高""最亮眼产品""大幅跳升"');
  L.push('- ✅ 应该："效率端修复""高位盘继续承压""需观察量端恢复""短期仍受量端压力影响"');
  L.push('');
  L.push('**正确示例（经业务审核校正 · 最新 2026.07.02）：**');
  L.push('```');
  L.push('UNO');
  L.push('整体：收入基本持平微涨，DAU 小幅下滑但频次明显回升形成有效对冲，eCPM(log) 小幅走弱限制收入向上弹性，AdARPU 在频次提升带动下小幅回升。');
  L.push('平台：双端 ARPU 均有小幅提升，主要受到DAU频次增长影响');
  L.push('渠道：双端 eCPM 小幅回落，IOS受以AL为主大部分渠道下滑影响，AND受以moloco为主大部分渠道下滑影响');
  L.push('点位：DAU频次受外观点位奖励更新影响，单点位频次提升明显影响大盘。');
  L.push('');
  L.push('UNO2');
  L.push('整体：收入小幅下滑，DAU 明显回升但频次与 AdARPU 下滑形成对冲，eCPM(log) 基本持平，DAU频次下滑使得arpu下降');
  L.push('平台：双端arpu均有所下滑，主要受DAU频次下滑影响，eCPM也有小幅下滑');
  L.push('渠道：双端RV eCPM有所回升，INT和banner eCPM有所下滑，影响大盘');
  L.push('点位：在线时长-2.72%，INT、banner、对局相关点位频次均有所下滑影响大盘');
  L.push('');
  L.push('P10');
  L.push('整体：收入继续下行，DAU 缩量与 eCPM(log) 下滑双重拖累，频次基本持平未能形成有效支撑，AdARPU 随价格端走弱而回落。');
  L.push('平台：双端 ARPU 同步下滑，主要是eCPM下滑，DAU频次也有小幅减弱');
  L.push('渠道：双端主要是AL下滑拉低大盘');
  L.push('点位：在线时长基本持平；Gameplay 插页频次小幅下滑，Drawcard 活动点位频次也有所回落，但整体频次波动幅度较小。');
  L.push('');
  L.push('SKB');
  L.push('整体：收入继续回落，频次小幅下滑叠加 eCPM(log) 是主因，DAU 基本持平，各效率指标同向走弱但幅度有限。');
  L.push('平台：双端 ARPU 均有回落，主要是eCPM下滑，DAU频次下滑集中在横幅广告。');
  L.push('渠道：双端主要是AL下滑拉低大盘，其中And侧Moloco也有明显下滑');
  L.push('点位：在线时长基本持平；pvp_offline_banner_entrance 频次有所下降，int_offline_round_over 和 int_round_over 频次也略有回落，大盘频次小幅走弱。');
  L.push('```');
  L.push('');
  L.push('### 分析规则（SKILL）');
  L.push('- 数据真实准确、口径固定、结构固定、业务语言输出');
  L.push('- 不得估算、不得补数、不得改口径');
  L.push('- 产品排序固定：**UNO → UNO2 → P10 → SKB**');
  L.push('- eCPM(log) 是 Log 口径的 eCPM，不是 IAA eCPM');
  L.push('- AdARPU 使用接口返回的 AdARPU Total 字段');
  L.push('- 分产品分析中，点位名称需保留（如 int_gamefinish、rv_commonevent_SORT 等），但不需要列出频次/参与率的具体数值');
  if (d.template_refs && d.template_refs.length > 0) {
    const refs = d.template_refs.filter(r => r.doc_name || r.doc_url);
    if (refs.length > 0) {
      L.push('- ✅ **严格参考以下标准化文档的格式**，输出的结构、措辞风格、详略程度必须与参考文档保持一致：');
      refs.forEach(r => {
        if (r.doc_url) {
          L.push(`  - [${r.doc_name || '参考文档'}](${r.doc_url})`);
        } else {
          L.push(`  - ${r.doc_name}`);
        }
      });
    }
  }
  if (d.reqs.includes('attribution')) L.push('- ✅ 需要归因分析（识别收入变化的主要驱动因素）');
  if (d.reqs.includes('anomaly')) L.push('- ✅ 需要异常识别（环比/同比超过 ±10% 重点标注）');
  if (d.reqs.includes('weekend')) L.push('- ✅ 需要标注周末效应（周末 DAU 通常回升）');
  if (d.context) {
    L.push('');
    L.push('### 业务背景');
    L.push(d.context);
  }
  return L.join('\n');
}
