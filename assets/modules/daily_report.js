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
      const isAdvanced = document.querySelector('input[name="report_type"]:checked')?.value === 'advanced';
      const hint = document.getElementById('report-type-hint-advanced');
      if (hint) hint.style.display = isAdvanced ? 'block' : 'none';
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
    const isWeekly = data.report_type === 'weekly';
    const isAdvanced = data.report_type === 'advanced';
    const fullPrompt = buildFullPrompt(data);
    // 进阶日报：只输出一个自包含的全能 Prompt（可直接复制给其他 agent 执行）
    if (isAdvanced) {
      FF.renderArtifacts([
        { key: 'full', label: '🚀 全能日报 Prompt（进阶 v3）', content: fullPrompt },
        { key: 'json', label: '⚙️ 结构化配置 JSON', content: JSON.stringify(data, null, 2) },
      ], { collectFn: collect });
      return;
    }
    const dataPrompt = buildDataPrompt(data);
    const analysisPrompt = buildAnalysisPrompt(data);
    FF.renderArtifacts([
      { key: 'full', label: isWeekly ? '🚀 全能周报 Prompt' : '🚀 全能日报 Prompt', content: fullPrompt },
      { key: 'data', label: '📊 数据提取 Prompt', content: dataPrompt },
      { key: 'analysis', label: isWeekly ? '📝 周报分析模板 Prompt' : '📝 分析模板 Prompt', content: analysisPrompt },
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

/* ---------- 全能 Prompt（日报/周报/进阶日报 自动分流） ---------- */
function buildFullPrompt(d) {
  if (d.report_type === 'weekly') return buildWeeklyFullPrompt(d);
  if (d.report_type === 'advanced') return buildAdvancedFullPrompt(d);
  return buildDailyFullPrompt(d);
}

/* ---------- 全能日报 Prompt（进阶 v3 · 自包含，可直接复制给其他 agent 执行） ----------
   对应线上 methodology「日报推送流水线」v3 模块。
   前提：飞书日报文档已由上游生成，本流程不创建文档，只读文档摘录 + 后台补数 + 组卡推送。
------------------------------------------------------------------ */
function buildAdvancedFullPrompt(d) {
  const productList = (d.products && d.products.length ? d.products : ['UNO','UNO2','P10','SKB']).join('、');
  const L = [];
  L.push('# 🚀 MG 变现日报卡片推送任务（进阶 v3 · 全能 Prompt）');
  L.push('');
  L.push('> 你是一名严谨的数据分析师。请基于「已生成的飞书日报文档」，为 ' + productList + ' 产出并推送飞书日报卡片。');
  L.push('> 本 Prompt 自包含全部执行细节，可直接执行。完整方法论参见线上：');
  L.push('> https://troylul998-ship-it.github.io/MG_AI_ANALYTICS_REPORT/methodology.html →「🔁 日报推送流水线」');
  L.push('');
  L.push('## 🧭 三条铁律（贯穿全程）');
  L.push('1. **第一性原理**：每个数字都要能回答"来自哪个接口的哪个字段、口径是什么"，回答不了就不能进卡片。不要因"旧脚本这么写"就照抄，先确认字段/接口今天仍真实返回。');
  L.push('2. **对抗性审查**：每完成一步反问"这个数若错会错在哪"（口径变？列名变？某产品当天无数据被填0？分母为0？）。能双源核对的必须核对。|环比|≥30% 或 |30天|≥40% 先当疑似口径问题，核实后才呈现。');
  L.push('3. **绝不造数（红线）**：拉不到 = 报警停下问用户。绝不用 Math.random / 估算 / 插值 / 经验值填充。');
  L.push('');
  L.push('## 📥 输入');
  L.push('- **飞书日报文档 URL**：{{请粘贴今天已生成的飞书日报文档链接}}（若未提供，先反问用户索取，不要猜文档ID）');
  L.push('- **数据日期**：' + (d.report_date || '{{CUR，通常=昨天}}'));
  L.push('');
  L.push('## 📅 日期口径（写死）');
  L.push('```');
  L.push('今天记为 T 日。后台只有截至昨天的完整数据，故：');
  L.push('CUR  = T-1  数据日期（昨日）    PREV = T-2  环比基准（前日）');
  L.push('YOY  = CUR-7 周同比           DS30 = CUR-30 近30天起始   DE = CUR 近30天结束');
  L.push('CW   = [CUR所在周一, 周日]     PW = [上周一, 上周日]');
  L.push('· 卡片标题日期用 T（发布日）；正文「日期」字段用 CUR（数据日），须与文档一致');
  L.push('· 动手前先核对「文档日期 == 你算的 CUR」，不一致立即停下问用户');
  L.push('```');
  L.push('');
  L.push('## 🔀 数据分工（唯一权威源原则）');
  L.push('| 卡片模块 | 数据来源 |');
  L.push('|---|---|');
  L.push('| 0 日报信息 / 1 日报重点 / 2 收入概况 | **飞书文档摘录**（逐字，不重算） |');
  L.push('| 3 广告效率 / 4 渠道收入 / 5 聚合GAP | **后台 OmniEye API 拉取** |');
  L.push('| 2 收入概况的「近30天趋势」列 | 后台 trend30（文档没有此列） |');
  L.push('| 6 后续建议 | 文档关注点 + 后台趋势综合 |');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## Step 1 · 读飞书文档 & 摘录前3块');
  L.push('用 lark MCP 读文档正文（唯一正确方式）：');
  L.push('```');
  L.push('mcp_lark_mcp_docx_v1_document_rawContent  { path: { document_id: "从URL /docx/{id} 提取" } }');
  L.push('❌ 不要用 axios/cheerio 打 open.feishu.cn（无有效 token，必失败）');
  L.push('```');
  L.push('摘录映射：');
  L.push('- **日报信息**（模块0）：数据总结的日期/环比 + 总收入行；总DAU=4产品DAU加总；文档链接');
  L.push('- **日报重点**（模块1）：⭐日报重点4条，原文照搬，产品顺序调为 UNO>UNO2>P10>SKB');
  L.push('- **收入概况8列→10列**（模块2）：');
  L.push('  - 口径提示：文档 IAA收入=API口径，其余列=log口径。IAA收入直接抄文档，不可用后台log收入替换');
  L.push('  - 归因列 → 移出表格，浓缩为模块标题下 grey summary');
  L.push('  - eCPM列「$6.29（+2.28%）」→ 卡片只取环比「+2.28%」；AdARPU列同理只取环比');
  L.push('  - 在线时长环比 → 文档表无，取自各产品「点位」段"在线时长 X（±X%）"（缺则报警不编）');
  L.push('  - 近30天趋势 → 文档表无，取自后台 trend30（见 Step 2）');
  L.push('  - ⚠️ 文档列名会变（如"频次"↔"DAU频次"），按列义匹配而非列序；摘录后校验 4产品×8字段齐全');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## Step 2 · 后台数据（全 log 口径）');
  L.push('运行环境（本机专属，先确认路径存在）：');
  L.push('```javascript');
  L.push("import { PlatformClient } from 'file:///C:/Users/lujiaxin04/AppData/Roaming/npm/node_modules/@aidea/bi-analyse-client/dist/platformClient.js';");
  L.push('const client = new PlatformClient();');
  L.push('function rows(resp){const d=resp?.data?.data?.data,t=resp?.data?.data?.title;');
  L.push('  if(Array.isArray(d)&&Array.isArray(t))return d.map(r=>Array.isArray(r)?Object.fromEntries(t.map((x,i)=>[x,r[i]])):r);return [];}');
  L.push("async function call(ep,params,pid){return rows(await client.callApi('/md/configReport/getCustomData/'+ep,'post',params,pid));}");
  L.push('const base={adchannel:["all"],adtype:["all"],country:["All"],dataType:"log"};  // 后台三块全程 log，禁止改 api');
  L.push("const PROJECTS={UNO:'mn01',UNO2:'1000014',P10:'mn02',SKB:'1000008'};");
  L.push('const pct=(a,b)=>(b&&b!==0)?((a-b)/b*100):null;  // 分母为0返回null，不是0');
  L.push('```');
  L.push('');
  L.push('**⭐ 主数据接口：`adverAnakeytrendTable`（关键）** — 广告效率与收入概况所有日维度指标都从这一个接口取，`dateType:"date"`，platform 分别 `["All"]/["IOS"]/["ANDROID"]`，`dateStart:DS30, dateEnd:DE`。');
  L.push('- 现成字段（禁止推算）：`AdARPU, eCPM, RV_AdARPU, RV_eCPM, INT_AdARPU, INT_eCPM, DAU, Revenue, FrequencyDAU`');
  L.push('- IOS/AND 端 ARPU·eCPM：从 platform:["IOS"]/["ANDROID"] 返回里取该端 AdARPU、eCPM');
  L.push('- ❌ 废弃：不要用 adverAnakeytrendeCPM + "RV_eCPM×RV_FrequencyDAU/1000" 推算 ARPU（该接口无 RV_AdARPU 字段）');
  L.push('');
  L.push('**近30天趋势 trend30（口径钉死）**：一律用 `adverAnakeytrendTable`(All)，不要用 adverAnakeytrendRevenue（两接口Revenue口径不同）。升序日期，头7天均值 vs 尾7天均值：`trend30[k]={revChg(Revenue), dauChg(DAU), ecpmChg(eCPM)}`。');
  L.push('');
  L.push('**渠道收入 `adverAnakeytrendTableAdchannel`**（platform ANDROID/IOS，DS30~DE）：');
  L.push('- 每格：`总占比%(整数) | $加权eCPM(日环比%)`；总占比=IOS占比×IOS收入权重+AND占比×AND收入权重（权重=各端当日Revenue/双端合计）；加权eCPM=(IOS_Rev×IOS_ECPM+AND_Rev×AND_ECPM)/(IOS_Rev+AND_Rev)');
  L.push('- 渠道映射：applovin→AL, admob, unity, moloco, facebook, inmobi, vungle, ironsource→ironsrc, bidmachine→bidmach, mintegral；剔除 None/fyber；占比<1%显示 -');
  L.push('- 渠道趋势列：有稳定30天占比pct-point口径则用（首2周vs末2周），否则用文档「渠道」段真实定性描述（禁编pct数字）');
  L.push('');
  L.push('**聚合GAP `MultiAggregationTesting221`**（cycle "week"，CW/PW 各拉一次）：');
  L.push('| 产品 | AND | IOS | 过滤 |');
  L.push('|---|---|---|---|');
  L.push('| UNO | max vs admob | max vs admob | 全量 |');
  L.push('| UNO2 | — | — | 默认"量级极小，无有效对比"，**每天必须确认量级** |');
  L.push('| P10 | max vs admob | max vs levelplay | AND: country=T1T2 + reg_group=REG(剔新增)；IOS: reg_group=REG |');
  L.push('| SKB | max vs admob | max vs levelplay | 全量 |');
  L.push('```');
  L.push('GAP口径：取返回里 admob/max-1（或 levelplay/max-1）字段 ×100 = 百分比');
  L.push('  正=admob/levelplay 领先 MAX；负=MAX 领先。卡片格式 "ADM +4.2% / +1.5%"（本周/上周）');
  L.push('  AND用ADM(admob)；IOS的P10/SKB用ULP(levelplay)、UNO用ADM');
  L.push('UNO2 量级每日确认：拉一次两个mediation的 AdvalueARPU，仍极小(某侧≈0)→"量级极小，无有效对比"；已起量→正常输出GAP并提醒用户');
  L.push('REG=["2","3","4","5","6","7","8~15","16~30","31~60","61~90","91~180","181~365",">365"]（剔新增排除"1"）');
  L.push('T1T2=AU,CA,CN,DE,FR,GB,HK,JP,KR,NZ,SG,TW,UK,US,AE,AT,BE,BS,CH,CY,CZ,DK,EE,ES,FI,HU,IE,IL,IS,IT,KW,LU,NL,NO,PL,PR,PT,QA,RU,SA,SE,SM,SV,TR（44国）');
  L.push('```');
  L.push('**失败处理**：任一 call 抛错/返回空/CUR无数据 → 报警 `❌ 后台失败 | 模块 | 产品 | 日期 | 错误`，停止，不产半成品卡片。');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## Step 3 · 交叉校验 & 异常值（数据准确核心防线）');
  L.push('**口径基准**：飞书文档 IAA收入=API口径、其余=log；后台全 log。推论：');
  L.push('- ① IAA收入不做文档↔后台对账（口径不同），只抄文档API值');
  L.push('- ② DAU/eCPM/AdARPU/频次 文档与后台同为log，必须交叉校验');
  L.push('- ③ 后台三块全程log，不得混入api');
  L.push('');
  L.push('**交叉校验（仅log指标）**：');
  L.push('| 校验项 | 文档(log) | 后台(log) | 容差 |');
  L.push('|---|---|---|---|');
  L.push('| 各产品 AdARPU 环比 | 文档AdARPU列 | 后台AdARPU CUR/PREV环比 | ±0.5pct |');
  L.push('| 各产品 eCPM 环比 | 文档eCPM(log)列 | 后台eCPM CUR/PREV环比 | ±0.5pct |');
  L.push('| 各产品 DAU | 文档DAU | 后台DAU | ±1% |');
  L.push('| IAA收入 | API vs log，**不校验，跳过** |||');
  L.push('');
  L.push('**总量 & 异常值**：卡片总收入==文档总收入==4产品IAA之和（<1%）；总DAU==4产品DAU之和。|环比|≥30% 或 |30天|≥40% 标"疑似口径异常"先核实并注明。分母为0/null → 显示 "-" 不显示 "0%"。');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## Step 4 · 组装7模块卡片 & 格式规则');
  L.push('模块顺序：0 日报信息 / 1 ⭐日报重点 / 2 收入概况(10列) / 3 广告效率(10列) / 4 渠道收入(12列) / 5 聚合GAP(4列) / 6 💡后续建议。');
  L.push('');
  L.push('**颜色 & ⚠️ 规则（唯一权威版）**：');
  L.push("- 值≥+5% → 绿色 `<font color='green'>+6.95%</font>`，**不加⚠️**");
  L.push("- 值≤-5% → 红色 `<font color='red'>-12.05%</font>`");
  L.push('- -5%<值<+5% → 不标色');
  L.push("- **仅收入概况模块**：指标≤-5%（下滑）→ 红色 + 前缀⚠️ `<font color='red'>⚠️-5.84%</font>`。正增长(≥+5%)只标绿不加⚠️。广告效率/渠道/GAP 三块只按±5%标色，一律不加⚠️。");
  L.push('');
  L.push('**近30天趋势描述词汇表**：>+10%持续提升/显著回升；+5~10%明显改善/稳步增长；-5~+5%基本持平/波动不大；-10~-5%小幅下滑/略有承压；<-10%大幅下滑/明显走弱。');
  L.push('');
  L.push('**各表列定义**（照抄黄金样例 card_0708_final.json）：');
  L.push('```');
  L.push('收入概况(10列)：产品(80px) IAA收入(text) IAA环比 IAA同比 DAU 频次 eCPM环比 ARPU环比 在线时长环比 近30天趋势(300px)');
  L.push('  DAU "115.44万(-0.69%)"；在线时长 "34.16min(+0.03%)"；趋势 "IAA -4.8%，DAU -3.5%，eCPM -2.3%"（内部各指标按±5%标色）');
  L.push('广告效率(10列)：产品 RV_ARPU INT_ARPU RV_eCPM INT_eCPM IOS_ARPU AND_ARPU IOS_eCPM AND_eCPM 近30天趋势(320px)');
  L.push('  单元格 "$0.0244(-0.30%)"；趋势 "RV+0% INT-4% I.ARPU+0% A.ARPU-3% | eCPM:Total-2% RV-6%"');
  L.push('渠道(12列)：产品 AL admob unity moloco facebook inmobi vungle ironsrc bidmach mintegral 近30天趋势(400px)');
  L.push('  单元格 "48% | $12.3(+1.1%)"');
  L.push('聚合GAP(4列)：产品 AND端(260px) IOS端(260px) 近30天趋势(300px)');
  L.push('  单元格 "ADM +4.2% / +1.5%"；UNO2 固定 "量级极小，无有效对比"');
  L.push('```');
  L.push('**格式禁令**：❌ 禁用 ⬇️↑↗️↘️，方向只用 +/-；金额千分位 "$43,302"；`row_height="low"`；卡片底部不放按钮；每模块标题下配 grey summary（日环比：… / 近30天趋势：…，GAP用周环比+💡行动建议），summary内多产品按 UNO>UNO2>P10>SKB；卡片用飞书 JSON 2.0（`schema:"2.0"`, `body.elements`）。');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## Step 5 · 推送（先测试群 → 确认 → 正式群+@所有人）');
  L.push('```javascript');
  L.push("const runJs='C:\\\\Users\\\\lujiaxin04\\\\AppData\\\\Roaming\\\\npm\\\\node_modules\\\\@larksuite\\\\cli\\\\scripts\\\\run.js';");
  L.push("execFileSync(process.execPath,[runJs,'im','+messages-send','--as','bot','--chat-id',CHAT_ID,'--msg-type','interactive','--content',JSON.stringify(card)]);");
  L.push("// @所有人（仅正式群，卡片推送成功后单独发文本）");
  L.push('// atMsg = { text: \'<at user_id="all">所有人</at> 日报已更新 ✅\' }');
  L.push('```');
  L.push('| 群 | chat_id | 用途 |');
  L.push('|---|---|---|');
  L.push('| 赛博牛马🐂 | oc_44ce402d9ee9d0f901b61e6885cc33b1 | 先推测试 |');
  L.push('| MG 变现小群 | oc_9b0689b9a37e1eebf014fb39d8c78638 | 用户确认后推正式 + @所有人 |');
  L.push('**顺序铁律**：先推测试群 → 用户确认无误 → 才推正式群+@所有人。严禁跳过确认直推正式群。本流程不创建飞书文档。');
  L.push('');
  L.push('---');
  L.push('');
  L.push('## ✅ 推送前自检 & 收尾对抗审查');
  L.push('**推送前必过**：后台数值全部可追溯真实返回（无random/估算/推算）；广告效率用 adverAnakeytrendTable 现成 RV/INT AdARPU；trend30 用同接口；交叉校验log指标在容差内；总收入/总DAU对账通过；7模块齐全顺序对；⚠️仅出现在收入概况≤-5%；无方向emoji；多产品按 UNO>UNO2>P10>SKB。');
  L.push('**推送后收尾**：① 随机抽3个数回溯来源接口/字段/口径 ② 审最反直觉的数（最大涨跌）是真实波动还是口径bug ③ 检查有无 0%/-/null 残留 ④ 汇报"已校验N项全过；离群X个已核实(原因)；存疑Y处"，有存疑则告知用户由其决定是否推正式群，**不确定就不推正式群**。');
  if (d.context) {
    L.push('');
    L.push('## 📌 本次业务背景补充');
    L.push(d.context);
  }
  return L.join('\n');
}

/* ---------- 全能日报 Prompt ---------- */
function buildDailyFullPrompt(d) {
  const productList = d.products.join('、');

  const L = [];
  L.push('# Mobile Growth 变现日报生成任务');
  L.push('');
  L.push(`> 请为 ${productList} 生成 ${d.report_date} 的变现日报，完整执行以下 5 个步骤。`);
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

/* ---------- 全能周报 Prompt ---------- */
function buildWeeklyFullPrompt(d) {
  const productList = d.products.join('、');
  // 周报日期：结束日期为 report_date，开始日期为前6天
  const endDate = d.report_date;

  const L = [];
  L.push('# Mobile Growth 变现周报生成任务');
  L.push('');
  L.push(`> 请为 ${productList} 生成截止 ${endDate} 的变现周报（周一至周日），完整执行以下 5 个步骤。`);
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
  L.push('**2.1 基础数据**（来自收入&ARPU模块，周维度）');
  L.push('- 本周 vs 上周：IAA 日均收入、DAU、ARPU、eCPM、频次');
  L.push('- 计算周环比：IAA%、DAU%、ARPU%');
  L.push('- 分广告类型：RV/INT/Banner 的 eCPM、频次、收入占比');
  L.push('');
  L.push('**2.2 平台数据**（来自收入&ARPU模块，周维度）');
  L.push('- 分 AND/IOS：ARPU、eCPM、频次变化方向');
  L.push('- 双端变化驱动因素（eCPM？频次？DAU？）');
  L.push('');
  L.push('**2.3 渠道数据**（来自渠道数据趋势&渠道eCPM模块，周维度）');
  L.push('- 分 AND/IOS 的 Top 渠道 eCPM 变化');
  L.push('- 识别主要影响渠道（如 AL、moloco、unity、admob 等）');
  L.push('- 渠道收入占比变化');
  L.push('');
  L.push('**2.4 点位数据**（来自广告点位数据情况表，周维度）');
  L.push('- 分 AND/IOS 的核心点位频次/参与率变化');
  L.push('- 在线时长周环比');
  L.push('- 活动点位上下线影响');
  L.push('');
  L.push('**2.5 双聚合数据**（来自双聚合看板，日维度）');
  L.push('- MAX vs Admob 的 advalue ARPU gap 变化');
  L.push('- 分 AND/IOS 分别描述');
  L.push('- AND 端：整体 gap 趋势');
  L.push('- IOS 端：分 group（groupA&B / groupC）的 gap 趋势');
  L.push('');
  L.push('---');
  L.push('');

  // Step 3
  L.push('## Step 3：按周报模板生成分析');
  L.push('');
  L.push(buildWeeklyAnalysisPrompt(d));
  L.push('');
  L.push('---');
  L.push('');

  // Step 4
  if (d.outputs.includes('feishu_doc')) {
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
    L.push('**同时创建独立飞书文档**（用于卡片推送链接）：');
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

  // Step 5
  if (d.outputs.includes('feishu_card')) {
    L.push('## Step 5：推送飞书卡片通知（需确认）');
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

/* ---------- 数据提取 Prompt（日报） ---------- */
function buildDataPrompt(d) {
  if (d.report_type === 'weekly') return buildWeeklyDataPrompt(d);
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
  L.push('IOS 端需关注：');
  L.push('- groupA&B 地区的 gap');
  L.push('- groupC 地区的 gap');
  L.push('');
  L.push('AND 端需关注：');
  L.push('- 整体 gap 趋势');
  L.push('');
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

/* ---------- 分析模板 Prompt（日报/周报分流） ---------- */
function buildAnalysisPrompt(d) {
  if (d.report_type === 'weekly') return buildWeeklyAnalysisPrompt(d);
  return buildDailyAnalysisPrompt(d);
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
  L.push('1. **第一句**：IAA 周环比 + 主因拆解（DAU vs ARPU 哪个是主因）');
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
  L.push('**归因描述规则（与日报一致）：**');
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
  L.push('- 产品排序固定：**UNO → UNO2 → P10 → SKB**（周报可按产品分别输出或合并为一行）');
  if (d.template_refs && d.template_refs.length > 0) {
    const refs = d.template_refs.filter(r => r.doc_name || r.doc_url);
    if (refs.length > 0) {
      L.push('- ✅ **严格参考以下标准化文档的格式**：');
      refs.forEach(r => {
        if (r.doc_url) {
          L.push(`  - [${r.doc_name || '参考文档'}](${r.doc_url})`);
        } else {
          L.push(`  - ${r.doc_name}`);
        }
      });
    }
  }
  if (d.context) {
    L.push('');
    L.push('### 业务背景');
    L.push(d.context);
  }
  return L.join('\n');
}

/* ---------- 日报分析模板 Prompt ---------- */
function buildDailyAnalysisPrompt(d) {
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
  L.push('- ⚠️ 在线时长是点位维度中【唯一必须保留数值波动】的指标（与平台/渠道全程禁数值相反），必须写出环比百分比（如"在线时长 -2.72%"或"在线时长小幅回落 -1.87%"）');
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
