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
    { title: '需求', question: '你想取什么数据？', explain: '用白话写，或点选常用场景。', example: '<b>例：</b>"帮我拉分平台 DAU 和付费人数"' },
    { title: '补充', question: '还有补充吗？', explain: '选拆分维度、过滤条件。没有就直接生成。', example: '<b>例：</b>按天 + 按平台拆分' },
  ]);

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

  // 重置
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (confirm('确认重置？')) location.reload();
  });

  // 提交
  document.getElementById('dq-form').addEventListener('submit', e => {
    e.preventDefault();
    if (!FF.validate(e.target)) return;
    const data = collect();
    FF.renderArtifacts([
      { key: 'sql', label: 'SQL Prompt', content: buildPrompt(data) },
      { key: 'json', label: '结构化需求 JSON', content: JSON.stringify(data, null, 2) },
    ], { collectFn: collect });
  });
});

function collect() {
  return {
    module: 'daily_query',
    product: FF.val('product'),
    project: FF.val('product') + ' 日常取数',
    goal: FF.val('query_desc'),
    date_range: [FF.val('date_start'), FF.val('date_end')],
    query_desc: FF.val('query_desc'),
    dims: FF.getCheckedChips('dq_dims'),
    filter: FF.val('dq_filter'),
    sql_ref: FF.val('dq_sql_ref'),
  };
}

function buildPrompt(d) {
  const meta = PRODUCT_META[d.product] || {};
  const L = [];
  L.push('# 角色');
  L.push('你是资深数据分析师，精通 Presto/Trino。请基于以下需求编写一段可直接执行的取数 SQL。');
  L.push('');
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
  }
  if (d.filter) { L.push('# 额外过滤'); L.push(d.filter); L.push(''); }
  if (d.sql_ref) { L.push('# 历史 SQL 参考'); L.push('```sql'); L.push(d.sql_ref); L.push('```'); L.push(''); }
  L.push('# 要求');
  L.push('1. 输出可直接执行的完整 SQL');
  L.push('2. 列名用英文蛇形命名');
  L.push('3. 加简短注释说明每个 CTE 的作用');
  return L.join('\n');
}
