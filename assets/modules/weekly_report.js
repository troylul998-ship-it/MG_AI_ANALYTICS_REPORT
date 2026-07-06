/* ============================================================
周报分析工作台
OmniEye 周数据 → 基础/渠道/点位/双聚合分析 → Confluence → 飞书推送
============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  FF.init();

  // 修复默认选中样式
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
    { title: '基本信息', question: '周报覆盖哪些产品？', explain: '选结束日期和覆盖产品。', example: '<b>例：</b>2026-06-29（周日），UNO' },
    { title: '数据维度', question: '需要分析哪些维度？', explain: '选择基础/渠道/点位/双聚合。', example: '<b>例：</b>全部维度 + 双聚合分 group' },
    { title: '分析输出', question: '输出到哪里？', explain: '选输出格式和补充业务背景。', example: '<b>例：</b>更新 Confluence + 推送飞书卡片' },
  ]);

  // 重置
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('确认重置？')) location.reload();
  });

  // 提交
  document.getElementById('wr-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!FF.validate(e.target)) return;
    const data = collect();
    const fullPrompt = buildWeeklyFullPrompt(data);
    const dataPrompt = buildWeeklyDataPrompt(data);
    const analysisPrompt = buildWeeklyAnalysisPrompt(data);
    FF.renderArtifacts([
      { key: 'full', label: '🚀 全能周报 Prompt', content: fullPrompt },
      { key: 'data', label: '📊 数据提取 Prompt', content: dataPrompt },
      { key: 'analysis', label: '📝 周报分析模板 Prompt', content: analysisPrompt },
      { key: 'json', label: '⚙️ 结构化配置 JSON', content: JSON.stringify(data, null, 2) },
    ], { collectFn: collect });
  });
});

/* ---------- 数据收集 ---------- */
function collect() {
  return {
    module: 'weekly_report',
    report_date: FF.val('wr_date'),
    products: FF.getCheckedChips('wr_products'),
    data_type: document.querySelector('input[name="wr_data_type"]:checked')?.value || 'log',
    dims: FF.getCheckedChips('wr_dims'),
    agg_focus: FF.getCheckedChips('wr_agg'),
    reqs: FF.getCheckedChips('wr_reqs'),
    context: FF.val('wr_context'),
    outputs: FF.getCheckedChips('wr_output'),
  };
}

/* ---------- 全能周报 Prompt ---------- */
function buildWeeklyFullPrompt(d) {
  const productList = d.products.join('、');
  const endDate = d.report_date;

  const L = [];
  L.push('# Mobile Growth 变现周报生成任务');
  L.push('');
  L.push(`> 请为 ${productList} 生成截止 ${endDate} 的变现周报（周一至周日），完整执行以下步骤。`);
  L.push('');
  L.push('**⚠️ 周报规则**：');
  L.push('- 周报数据范围：本周周一 ~ 周日（7天）');
  L.push('- 环比对象：上周同期（上周一 ~ 上周日）');
  L.push('- 周报分产品输出，每产品包含：数据结论、基础数据、渠道数据、点位数据、双聚合数据');
  L.push('');
  L.push('**📐 格式参考（必须严格遵循）**：');
  L.push('- 周报 Confluence 页面：https://confluence.mattel163.cn/pages/viewpage.action?pageId=182657726');
  L.push('- 严格按照该页面的表格结构输出');
  L.push('');
  L.push('---');
  L.push('');

  // Step 1
  L.push('## Step 1：从 OmniEye 提取数据');
  L.push('');
  L.push(buildWeeklyDataPrompt(d));
  L.push('');
  L.push('---');
  L.push('');

  // Step 2
  L.push('## Step 2：整理周报数据');
  L.push('');
  L.push('将 4 个模块拉取到的数据按以下维度整理：');
  L.push('');
  if (d.dims.includes('basic')) {
    L.push('**2.1 基础数据**（来自收入&ARPU模块，周维度）');
    L.push('- 本周 vs 上周：IAA 日均收入、DAU、ARPU、eCPM、频次');
    L.push('- 计算周环比：IAA%、DAU%、ARPU%');
    L.push('- 分广告类型：RV/INT/Banner 的 eCPM、频次、收入占比');
    L.push('- 分 AND/IOS：ARPU、eCPM、频次变化方向及驱动因素');
    L.push('');
  }
  if (d.dims.includes('channel')) {
    L.push('**2.2 渠道数据**（来自渠道数据趋势&渠道eCPM模块，周维度）');
    L.push('- 分 AND/IOS 的 Top 渠道 eCPM 变化');
    L.push('- 识别主要影响渠道（如 AL、moloco、unity、admob 等）');
    L.push('- 渠道收入占比变化');
    L.push('');
  }
  if (d.dims.includes('placement')) {
    L.push('**2.3 点位数据**（来自广告点位数据情况表，周维度）');
    L.push('- 分 AND/IOS 的核心点位频次/参与率变化');
    L.push('- 在线时长周环比');
    L.push('- 活动点位上下线影响');
    L.push('');
  }
  if (d.dims.includes('dual_agg')) {
    L.push('**2.4 双聚合数据**（来自双聚合看板，日维度）');
    L.push('- MAX vs Admob 的 advalue ARPU gap 变化');
    if (d.agg_focus.includes('and_overall')) L.push('- AND 端：整体 gap 趋势');
    if (d.agg_focus.includes('ios_ab')) L.push('- IOS 端 groupA&B：gap 趋势');
    if (d.agg_focus.includes('ios_c')) L.push('- IOS 端 groupC：gap 趋势');
    L.push('');
  }
  L.push('---');
  L.push('');

  // Step 3
  L.push('## Step 3：按周报模板生成分析');
  L.push('');
  L.push(buildWeeklyAnalysisPrompt(d));
  L.push('');
  L.push('---');
  L.push('');

  // Step 4: Confluence
  if (d.outputs.includes('confluence')) {
    L.push('## Step 4：更新 Confluence 文档');
    L.push('');
    L.push('将本周周报内容**追加到 Confluence 表格最顶部**（最新一周在最上面）：');
    L.push('');
    L.push('- **目标页面**：https://confluence.mattel163.cn/pages/viewpage.action?pageId=182657726');
    L.push('- **操作方式**：在现有表格的第一行数据行之前插入新行');
    L.push('- **表格结构**：| 时间 | 数据结论 | 基础数据 | 渠道数据 | 点位数据 | 双聚合数据 | 其他 |');
    L.push('');
    L.push('**各列内容格式：**');
    L.push('- **时间列**：`X.XX周数据`（加粗），如 `**6.29周数据**`');
    L.push('- **数据结论列**：用 bullet points 列出核心结论（3-5 条）');
    L.push('- **基础数据列**：插入 OmniEye 基础趋势截图');
    L.push('- **渠道数据列**：分 AND / IOS 两端的渠道截图');
    L.push('- **点位数据列**：分 AND / IOS 两端的点位截图');
    L.push('- **双聚合数据列**：AND 端整体 + IOS 端 group 分组的 gap 截图和结论');
    L.push('- **其他列**：实验结论、渠道动态等（如无则留空）');
    L.push('');
    L.push('---');
    L.push('');
  }

  // Step 5: 飞书文档
  if (d.outputs.includes('feishu_doc')) {
    const stepNum = d.outputs.includes('confluence') ? 5 : 4;
    L.push(`## Step ${stepNum}：创建飞书文档`);
    L.push('');
    L.push('创建独立飞书文档（用于卡片推送链接）：');
    L.push('```bash');
    L.push('# 1. 创建文档');
    L.push('cmd /c "lark-cli docs +create --api-version v2 --doc-format markdown --content @weekly_report.md --as bot"');
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

  // Step 6: 飞书卡片
  if (d.outputs.includes('feishu_card')) {
    let stepNum = 4;
    if (d.outputs.includes('confluence')) stepNum++;
    if (d.outputs.includes('feishu_doc')) stepNum++;
    L.push(`## Step ${stepNum}：推送飞书卡片通知（需确认）`);
    L.push('');
    L.push('> 📨 周报生成完成后，请询问用户：');
    L.push('');
    L.push('**请问是否需要将周报推送到飞书群？**');
    L.push('- 如果需要，请告诉我要推送到哪个群组？（如：Mobile Growth、MG 变现小群、赛博牛马🐂）');
    L.push('- 是否需要 @ 通知特定成员？如果需要，请告诉我成员的名字。');
    L.push('');
    L.push('**推送格式说明：**');
    L.push('- 使用飞书卡片 JSON 2.0 格式（`schema: "2.0"`，`body.elements` 结构）');
    L.push('- 卡片结构：周报标题 → 收入概况表格（本周 vs 上周）→ 分产品核心结论 → 双聚合 gap 变化');
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

/* ---------- 数据提取 Prompt（周报） ---------- */
function buildWeeklyDataPrompt(d) {
  const productMap = { 'UNO': 'uno', 'UNO2': 'uno wonder', 'P10': 'phase10', 'SKB': 'skipbo' };
  const L = [];
  L.push('### 周报数据提取配置');
  L.push('');
  L.push(`- **产品**：${d.products.map(p => `${p}(${productMap[p]})`).join('、')}`);
  L.push(`- **数据类型**：${d.data_type === 'log' ? 'Log（客户端打点）' : 'API（渠道回传）'}`);
  L.push(`- **周报结束日期**：${d.report_date}（周日）`);
  L.push('');
  L.push('### 数据来源与操作');
  L.push('');
  L.push('按以下 4 个模块分别获取数据，每个模块需按产品分别调用：');
  L.push('');

  if (d.dims.includes('basic')) {
    L.push('---');
    L.push('');
    L.push('#### 📊 1. 基础数据（收入 & ARPU）');
    L.push('');
    L.push('- **看板链接**：https://omnieye.mattel163.com/index.html#/v3/adverAna/keytrend');
    L.push('- **模块**：收入 & ARPU 模块');
    L.push('- **周期筛选器**：切换为「周」');
    L.push('- **时间范围**：近 2 个月的周数据');
    L.push('- **关注指标**：IAA 日均收入、DAU、ARPU、eCPM(log)、频次');
    L.push('');
    L.push('需要调用的接口：');
    L.push('- `adverAnakeytrendTable` — 汇总报表（周维度）');
    L.push('- `adverAnakeytrendRevenue` — 整体数据（分平台收入/ARPU/在线时长，周维度）');
    L.push('- `adverAnakeytrendeCPM` — 平台数据（分 RV/INT Freq/DAU、eCPM，周维度）');
    L.push('');
    L.push('```json');
    L.push(`{"adchannel": ["all"], "adtype": ["all"], "country": ["All"], "dataType": "${d.data_type}", "dateEnd": "${d.report_date}", "dateStart": "近2个月起始日期", "dateType": "week", "platform": ["All"]}`);
    L.push('```');
    L.push('');
  }

  if (d.dims.includes('channel')) {
    L.push('---');
    L.push('');
    L.push('#### 📡 2. 渠道数据（渠道数据趋势 & 渠道 eCPM）');
    L.push('');
    L.push('- **看板链接**：https://omnieye.mattel163.com/index.html#/v3/adverAna/keytrend');
    L.push('- **模块**：渠道数据趋势 & 渠道数据 eCPM 模块');
    L.push('- **周期筛选器**：切换为「周」');
    L.push('- **时间范围**：近 2 个月的周数据');
    L.push('- **关注指标**：各渠道 eCPM、收入占比变化');
    L.push('- **需分平台各调一次**：AND / IOS');
    L.push('');
    L.push('需要调用的接口：');
    L.push('- `adverAnakeytrendTableAdchannel` — 渠道数据（AND）');
    L.push('- `adverAnakeytrendTableAdchannel` — 渠道数据（IOS）');
    L.push('');
    L.push('```json');
    L.push(`{"adchannel": ["all"], "adtype": ["all"], "country": ["All"], "dataType": "${d.data_type}", "dateEnd": "${d.report_date}", "dateStart": "近2个月起始日期", "dateType": "week", "platform": ["ANDROID"]}`);
    L.push('```');
    L.push('```json');
    L.push(`{"adchannel": ["all"], "adtype": ["all"], "country": ["All"], "dataType": "${d.data_type}", "dateEnd": "${d.report_date}", "dateStart": "近2个月起始日期", "dateType": "week", "platform": ["IOS"]}`);
    L.push('```');
    L.push('');
  }

  if (d.dims.includes('placement')) {
    L.push('---');
    L.push('');
    L.push('#### 📍 3. 点位数据（广告点位数据情况表）');
    L.push('');
    L.push('- **看板链接**：https://omnieye.mattel163.com/index.html#/v3/adverAna/keytrend');
    L.push('- **模块**：广告点位数据情况表');
    L.push('- **周期筛选器**：切换为「周」');
    L.push('- **时间范围**：近 2 个月的周数据');
    L.push('- **关注指标**：各点位参与率、DEU频次、人均频次DAU');
    L.push('- **需分平台各调一次**：AND / IOS');
    L.push('');
    L.push('需要调用的接口：');
    L.push('- `adverAnakeytrendTablePointLog` — 点位数据（AND）');
    L.push('- `adverAnakeytrendTablePointLog` — 点位数据（IOS）');
    L.push('');
    L.push('```json');
    L.push(`{"adchannel": ["all"], "adtype": ["all"], "country": ["All"], "dataType": "${d.data_type}", "dateEnd": "${d.report_date}", "dateStart": "近2个月起始日期", "dateType": "week", "platform": ["ANDROID"]}`);
    L.push('```');
    L.push('```json');
    L.push(`{"adchannel": ["all"], "adtype": ["all"], "country": ["All"], "dataType": "${d.data_type}", "dateEnd": "${d.report_date}", "dateStart": "近2个月起始日期", "dateType": "week", "platform": ["IOS"]}`);
    L.push('```');
    L.push('');
  }

  if (d.dims.includes('dual_agg')) {
    L.push('---');
    L.push('');
    L.push('#### 🔀 4. 双聚合数据（MAX vs Admob）');
    L.push('');
    L.push('- **看板链接**：https://omnieye.mattel163.com/index.html#/v3/MultiAggregationTesting2');
    L.push('- **周期筛选器**：「日」（注意：双聚合看日维度）');
    L.push('- **时间范围**：近 2 个月的日数据');
    L.push('- **关注指标**：advalue ARPU 在聚合之间的差异（gap）');
    L.push('- **需分平台各调一次**：AND / IOS');
    L.push('');
    L.push('**⚠️ 注意**：双聚合数据用「日」维度，不是「周」！主要看近期 gap 走势和变化方向。');
    L.push('');
    if (d.agg_focus.includes('ios_ab') || d.agg_focus.includes('ios_c')) {
      L.push('IOS 端需关注：');
      if (d.agg_focus.includes('ios_ab')) L.push('- groupA&B 地区的 gap');
      if (d.agg_focus.includes('ios_c')) L.push('- groupC 地区的 gap');
      L.push('');
    }
    if (d.agg_focus.includes('and_overall')) {
      L.push('AND 端需关注：');
      L.push('- 整体 gap 趋势');
      L.push('');
    }
  }

  L.push('---');
  L.push('');
  L.push('### 数据整理要求');
  L.push('');
  L.push('拉取完数据后，按产品汇总为以下结构：');
  L.push('- **本周 vs 上周**：计算 IAA、DAU、ARPU 的周环比');
  L.push('- **双端对比**：AND/IOS 分端的 ARPU、eCPM、频次变化');
  L.push('- **渠道 Top5**：各端 Top 渠道的 eCPM 变化方向');
  L.push('- **点位异动**：频次变化超过 ±5% 的点位');
  L.push('- **双聚合 gap**：本周 vs 上周的 gap 变化方向');
  return L.join('\n');
}

/* ---------- 周报分析模板 Prompt ---------- */
function buildWeeklyAnalysisPrompt(d) {
  const L = [];
  L.push('### 周报输出结构（严格遵循 Confluence 表格格式）');
  L.push('');
  L.push('周报按以下表格结构输出，**每产品一行**：');
  L.push('');
  L.push('| 时间 | 数据结论 | 基础数据 | 渠道数据 | 点位数据 | 双聚合数据 | 其他 |');
  L.push('|------|----------|----------|----------|----------|------------|------|');
  L.push('');
  L.push('---');
  L.push('');
  L.push('### 各列填写规范');
  L.push('');
  L.push('**「数据结论」列（核心，3-5 条 bullet points）：**');
  L.push('');
  L.push('格式要求：');
  L.push('1. **第一句**：IAA 周环比 + 日均收入 + 主因拆解（DAU vs ARPU 哪个是主因）');
  L.push('2. **第二句**：双端 ARPU 变化方向 + 驱动因素（eCPM？频次？）');
  L.push('3. **第三句**：双端 eCPM 变化 + 主要影响渠道（点名具体渠道）');
  L.push('4. **第四句**：DAU 频次变化 + 原因归因（活动/版更/在线时长/新增等）');
  L.push('');
  L.push('**正确示例（从 Confluence 真实周报提取）：**');
  L.push('```');
  L.push('* 上周IAA-4.42%，日均41435，DAU+7.85%，arpu-11.38%，受到DAU频次和eCPM双重下降的影响');
  L.push('* 双端arpu均有所下滑，eCPM主要受到AL渠道下滑的影响，降幅最明显，权重影响最大');
  L.push('* DAU频次则是受到在线时长下滑影响，INT等对局相关点位频次均有所下滑，其次是受到赛季末期卡包点位频次大幅下滑影响，再叠加接龙活动，上周频次较低');
  L.push('```');
  L.push('');
  L.push('**更多示例：**');
  L.push('```');
  L.push('* 上周IAA+5.48%，DAU-2.9%，arpu+8.93%主要受到arpu提升的影响');
  L.push('* 双端arpu均有增长，主要受到DAU频次提升的影响，eCPM有所下滑');
  L.push('* 双端eCPM均下滑，AND端主要受到moloco，meta等渠道影响，IOS主要受到AL等渠道影响');
  L.push('* 双端DAU频次均有明显增长，一方面受到在线时长增长影响，INT和对局相关点位频次表现较好；另一方面受到活动点位效果好的影响，以及外观点位月初频次高峰的影响');
  L.push('```');
  L.push('');
  L.push('**「基础数据」列：**');
  L.push('- 插入 OmniEye 基础趋势截图（收入趋势图 + eCPM/频次趋势图）');
  L.push('- 格式：直接放图片引用');
  L.push('');
  L.push('**「渠道数据」列：**');
  L.push('- 分 AND / IOS 两端各放一张渠道 eCPM 截图');
  L.push('- 格式：');
  L.push('```');
  L.push('AND');
  L.push('[AND渠道截图]');
  L.push('IOS');
  L.push('[IOS渠道截图]');
  L.push('```');
  L.push('');
  L.push('**「点位数据」列：**');
  L.push('- 分 AND / IOS 两端各放一张点位频次截图');
  L.push('- 格式同渠道数据列');
  L.push('');
  L.push('**「双聚合数据」列：**');
  L.push('- AND 端：MAX vs Admob 整体 gap 趋势 + 结论');
  L.push('- IOS 端：分 group（groupA&B / groupC）各自 gap 趋势 + 结论');
  L.push('- 格式：');
  L.push('```');
  L.push('AND');
  L.push('* 描述gap趋势和变化原因');
  L.push('[AND双聚合截图]');
  L.push('IOS');
  L.push('* groupA&B，gap在XX%左右');
  L.push('[IOS groupA&B截图]');
  L.push('* groupC，gap在XX%左右');
  L.push('[IOS groupC截图]');
  L.push('```');
  L.push('');
  L.push('**「其他」列：**');
  L.push('- 实验结论（如有）');
  L.push('- 渠道动态（如有）');
  L.push('- 如无特殊内容则留空');
  L.push('');
  L.push('---');
  L.push('');
  L.push('### 周报分析风格规则');
  L.push('');
  L.push('**归因描述规则：**');
  L.push('- ✅ 写完整因果链：主因 + 对冲/加剧因素 + 综合方向');
  L.push('- ✅ 渠道描述必须点名具体渠道（AL、moloco、unity、admob、meta 等）');
  L.push('- ✅ 点位归因到业务事件（活动上下线、版更、外观更新、赛季切换等）');
  L.push('- ❌ 不要只写"eCPM下降"，要写"主要受到以AL为主大部分渠道下滑的影响"');
  L.push('- ❌ 不用 emoji、不用具体 $ 数值（日均收入除外）');
  L.push('');
  L.push('**数值规则：**');
  L.push('- IAA 周环比：保留百分比（如 -4.42%）');
  L.push('- 日均收入：保留美元数值（如 日均41435）');
  L.push('- DAU/ARPU 环比：保留百分比');
  L.push('- gap 描述：用"XX%左右"的表述');
  L.push('');
  L.push('**双聚合分析规则：**');
  L.push('- 必须说明 gap 的变化方向（维持/缩减/拉大）');
  L.push('- 如果有变化，需归因到 eCPM 变化（如"主要是admob eCPM有所提升使得gap缩减"）');
  L.push('- AND 端：描述整体 gap');
  L.push('- IOS 端：必须分 groupA&B 和 groupC 两组描述');
  L.push('');
  L.push('### 分析规则（SKILL）');
  L.push('- 数据真实准确、口径固定、结构固定、业务语言输出');
  L.push('- 不得估算、不得补数、不得改口径');
  L.push('- eCPM(log) 是 Log 口径的 eCPM');
  L.push('- 产品排序固定：**UNO → UNO2 → P10 → SKB**');
  if (d.reqs.includes('attribution')) L.push('- ✅ 需要归因分析（识别收入变化的主要驱动因素）');
  if (d.reqs.includes('channel_top')) L.push('- ✅ 需要渠道 Top5 影响分析（点名渠道 + 变化方向）');
  if (d.reqs.includes('placement_change')) L.push('- ✅ 需要点位异动识别（频次变化 ±5% 以上的点位）');
  if (d.reqs.includes('experiment')) L.push('- ✅ 需要汇总本周实验结论（如有在跑实验）');
  if (d.context) {
    L.push('');
    L.push('### 业务背景');
    L.push(d.context);
  }
  return L.join('\n');
}
