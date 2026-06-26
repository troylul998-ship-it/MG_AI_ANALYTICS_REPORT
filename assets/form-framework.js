/* ============================================================
   分析模块表单 — 共享框架脚本
   提供：模式切换 / 动态行 / chips / 校验 / 复制 / 产物生成
   各模块只需提供「字段采集 + 产物模板」即可复用本框架。
   ============================================================ */

const FF = (() => {

  /* ---------- 模式切换（引导 / 快速） ---------- */
  function initModeSwitch() {
    const sw = document.querySelector('.mode-switch');
    if (!sw) return;
    const guideHint = document.getElementById('hint-guide');
    const fastHint = document.getElementById('hint-fast');
    sw.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      sw.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      document.body.classList.toggle('mode-guide', mode === 'guide');
      document.body.classList.toggle('mode-fast', mode === 'fast');
      if (guideHint) guideHint.style.display = mode === 'guide' ? 'block' : 'none';
      if (fastHint) fastHint.style.display = mode === 'fast' ? 'block' : 'none';
    });
  }

  /* ---------- chips 多选 ---------- */
  function initChips() {
    document.querySelectorAll('.chip').forEach(wireChip);
  }

  function getCheckedChips(groupName) {
    return Array.from(
      document.querySelectorAll(`input[name="${groupName}"]:checked`)
    ).map(i => i.value);
  }

  // 让一个 chip 可点选：依赖 <label> 原生切换 checkbox/radio，仅监听 change 同步样式
  function wireChip(chip) {
    if (chip.__wired) return;
    const input = chip.querySelector('input');
    if (!input) return;
    const isRadio = input.type === 'radio';
    const sync = () => {
      if (isRadio) {
        const group = chip.closest('.chips');
        if (group) group.querySelectorAll('.chip').forEach(c => c.classList.remove('checked'));
      }
      chip.classList.toggle('checked', input.checked);
    };
    input.addEventListener('change', sync);
    chip.__wired = true;
    sync();
  }

  /* ---------- 自定义 chip：给 .chips[data-custom] 末尾挂一个输入框 ---------- */
  function initCustomChips() {
    document.querySelectorAll('.chips[data-custom]').forEach(group => {
      const name = group.dataset.custom;
      const wrap = document.createElement('span');
      wrap.className = 'chip-add-wrap';
      wrap.innerHTML = `<input type="text" class="chip-add-input" placeholder="自定义 ↑">`;
      const input = wrap.querySelector('input');
      const submit = () => {
        const v = input.value.trim();
        if (v) { addCustomChip(group, name, v); input.value = ''; }
      };
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.keyCode === 13) {
          e.preventDefault();
          e.stopPropagation();
          submit();
        }
      });
      // 失焦也提交，避免用户填完没按回车
      input.addEventListener('blur', submit);
      group.appendChild(wrap);
    });
  }

  function addCustomChip(group, name, value, checked = true) {
    // 去重（仅比对已有 checkbox，排除输入框自身）
    if (Array.from(group.querySelectorAll('input[type=checkbox]')).some(i => i.value === value)) return;
    const label = document.createElement('label');
    label.className = 'chip chip-custom';
    label.innerHTML =
      `<input type="checkbox" name="${name}" value="${esc(value)}" ${checked ? 'checked' : ''}>${esc(value)}`;
    const wrap = group.querySelector('.chip-add-wrap');
    group.insertBefore(label, wrap || null);
    wireChip(label);
  }

  /* ---------- 预设/自定义 模式切换（用于一组 chips） ---------- */
  // toggleId 上点击 .seg 按钮，切换显示同一容器内 [data-seg="xxx"] 区域
  function initSegToggle(rootId) {
    const root = document.getElementById(rootId);
    if (!root) return;
    const seg = root.querySelector('.seg-switch');
    if (!seg) return;
    seg.addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      seg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.seg;
      root.querySelectorAll('[data-seg]').forEach(p => {
        p.style.display = p.dataset.seg === target ? '' : 'none';
      });
    });
  }

  /* ---------- 动态行 ---------- */
  // container: 容器元素 / rowHtml: 返回一行 HTML 的函数
  function initDynamic(containerId, addBtnId, rowHtmlFn, opts = {}) {
    const container = document.getElementById(containerId);
    const addBtn = document.getElementById(addBtnId);
    if (!container || !addBtn) return;
    const addRow = (data) => {
      const div = document.createElement('div');
      div.className = opts.rowClass || 'dyn-row';
      div.innerHTML = rowHtmlFn(data) +
        '<button type="button" class="del" title="删除">×</button>';
      div.querySelector('.del').addEventListener('click', () => div.remove());
      container.appendChild(div);
      return div;
    };
    addBtn.addEventListener('click', () => addRow());
    // 初始行
    (opts.initial || []).forEach(d => addRow(d));
    if (!opts.initial && opts.minRows) {
      for (let i = 0; i < opts.minRows; i++) addRow();
    }
    return { addRow, container };
  }

  function collectRows(containerId, fieldNames) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    return Array.from(container.querySelectorAll('.dyn-row, .question-block')).map(row => {
      const obj = {};
      fieldNames.forEach(fn => {
        const el = row.querySelector(`[data-f="${fn}"]`);
        obj[fn] = el ? el.value.trim() : '';
      });
      return obj;
    }).filter(o => Object.values(o).some(v => v));
  }

  function clearContainer(containerId) {
    const c = document.getElementById(containerId);
    if (c) c.innerHTML = '';
  }

  /* ---------- CSV 解析（仅取表头 + 少量样本推断类型） ---------- */
  // 返回 [{col, type}]，type 猜测：date / metric / id / dimension
  function parseCsvHeader(text) {
    const firstLine = text.split(/\r?\n/).find(l => l.trim().length);
    if (!firstLine) return [];
    const delim = (firstLine.match(/\t/) && !firstLine.includes(',')) ? '\t' : ',';
    const cols = splitCsvLine(firstLine, delim).map(c => c.replace(/^["']|["']$/g, '').trim());
    // 取第二行样本辅助猜测类型
    const lines = text.split(/\r?\n/).filter(l => l.trim().length);
    const sample = lines[1] ? splitCsvLine(lines[1], delim) : [];
    return cols.map((col, i) => ({ col, type: guessType(col, sample[i]) }));
  }

  function splitCsvLine(line, delim) {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') q = !q;
      else if (ch === delim && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function guessType(col, sampleVal) {
    const c = col.toLowerCase();
    if (/(date|day|dt|time|月|日|周)/.test(c)) return 'date';
    if (/(id|uid|account|role|user|device)/.test(c)) return 'id';
    if (sampleVal !== undefined && sampleVal !== '' && !isNaN(Number(String(sampleVal).replace(/,/g, '')))) {
      // 纯数字但像分类码（platform/version）的，仍归维度
      if (/(platform|version|channel|group|type|country|os|gender|seg)/.test(c)) return 'dimension';
      return 'metric';
    }
    return 'dimension';
  }

  /* ---------- 校验 ---------- */
  function validate(form) {
    let ok = true;
    const missing = [];

    form.querySelectorAll('[data-required]').forEach(el => {
      const field = el.closest('.field') || el.closest('.fcard');
      const empty = !el.value || !el.value.trim();
      if (field) field.classList.toggle('error', empty);
      if (empty) {
        ok = false;
        const label = field ? (field.querySelector('label') || {}).textContent : '';
        const cleanLabel = label.replace(/\s*\*\s*/, '').replace(/选填|必填/g, '').trim();
        missing.push({ label: cleanLabel || '未知字段', el });
      }
    });

    // 必选 chip 组
    form.querySelectorAll('[data-required-group]').forEach(group => {
      const name = group.dataset.requiredGroup;
      const checked = getCheckedChips(name).length > 0;
      group.classList.toggle('error', !checked);
      if (!checked) {
        ok = false;
        const label = group.querySelector('label');
        const cleanLabel = label ? label.textContent.replace(/\s*\*\s*/, '').trim() : '未知字段';
        missing.push({ label: cleanLabel, el: group });
      }
    });

    const summary = document.querySelector('.form-error-summary');
    if (summary) {
      if (!ok) {
        summary.innerHTML = '⚠️ 以下必填项未填写：<br>' +
          missing.map((m, i) =>
            `<a href="#" class="err-locate" data-idx="${i}" style="color:var(--red);text-decoration:underline;margin-right:12px;font-weight:600;">${m.label}</a>`
          ).join('') +
          '<br><span style="font-size:11px;color:#999;">点击上方字段名可直接定位</span>';
        summary.classList.add('show');
        showToast('请检查必填项', 'error', 4000);

        // 定位按钮点击
        summary.querySelectorAll('.err-locate').forEach((a, idx) => {
          a.addEventListener('click', e => {
            e.preventDefault();
            const target = missing[idx];
            if (!target) return;
            // 引导模式：跳到对应步骤
            const cards = form.querySelectorAll('.fcard');
            if (document.body.classList.contains('mode-guide')) {
              const cardIdx = Array.from(cards).findIndex(c => c.contains(target.el));
              if (cardIdx >= 0) {
                const nextBtn = document.querySelector('.wiz-nav .btn-next');
                const prevBtn = document.querySelector('.wiz-nav .btn-prev');
                // 简单实现：模拟点击导航到目标步骤
                const dots = document.querySelectorAll('.wiz-step-dot');
                cards.forEach((c, i) => c.classList.toggle('wiz-active', i === cardIdx));
                dots.forEach((d, i) => {
                  d.classList.toggle('active', i === cardIdx);
                  d.classList.toggle('done', i < cardIdx);
                });
                const counter = document.querySelector('.wiz-counter');
                if (counter) counter.textContent = `${cardIdx + 1} / ${cards.length}`;
                if (prevBtn) prevBtn.disabled = cardIdx === 0;
                if (nextBtn) nextBtn.textContent = cardIdx === cards.length - 1 ? '✅ 完成并生成' : '下一步 →';
              }
            }
            // 滚动到字段
            target.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.el.classList.add('error');
            // 闪烁高亮
            target.el.style.outline = '3px solid var(--red)';
            setTimeout(() => { target.el.style.outline = ''; }, 2000);
          });
        });
      } else {
        summary.classList.remove('show');
      }
    }
    return ok;
  }

  /* ---------- 复制 ---------- */
  function initCopy() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('.copy-btn');
      if (!btn) return;
      const pre = document.getElementById(btn.dataset.target);
      if (!pre) return;
      navigator.clipboard.writeText(pre.textContent).then(() => {
        const old = btn.textContent;
        btn.textContent = '✓ 已复制';
        showToast('已复制到剪贴板', 'success', 2000);
        setTimeout(() => (btn.textContent = old), 1500);
      });
    });
  }

  /* ---------- 输出 tab 切换 ---------- */
  function initOutputTabs() {
    document.addEventListener('click', e => {
      const tab = e.target.closest('.out-tab');
      if (!tab) return;
      const wrap = tab.closest('.output');
      wrap.querySelectorAll('.out-tab').forEach(t => t.classList.remove('active'));
      wrap.querySelectorAll('.out-panel').forEach(p => p.classList.add('hidden'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.panel).classList.remove('hidden');
    });
  }

  /* ---------- Toast 通知 ---------- */
  function showToast(message, type = 'success', duration = 3000) {
    // 确保容器存在
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const icons = { success: '✓', error: '✗', info: 'ℹ' };
    toast.className = `toast toast-${type}`;
    toast.textContent = `${icons[type] || ''} ${message}`;
    container.appendChild(toast);
    // 自动消失
    setTimeout(() => {
      toast.classList.add('toast-out');
      toast.addEventListener('animationend', () => toast.remove());
    }, duration);
  }

  /* ---------- 工具 ---------- */
  function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
  function esc(s) { return (s || '').replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])); }
  function nonEmpty(arr) { return arr.filter(x => x && String(x).trim()); }

  /* ---------- 渲染产物到输出区 ---------- */
  // artifacts: [{key,label,content}]
  function renderArtifacts(artifacts, opts = {}) {
    const out = document.getElementById('output');
    const tabs = out.querySelector('.out-tabs');
    const body = out.querySelector('.out-body');
    tabs.innerHTML = '';
    body.innerHTML = '';

    // 保存按钮 + 人工按钮
    const saveBar = document.createElement('div');
    saveBar.style.cssText = 'margin-bottom:16px;display:flex;gap:12px;align-items:center;padding:12px 16px;background:#f0fff4;border:1px solid #c6f6d5;border-radius:8px;flex-wrap:wrap;';
    saveBar.innerHTML =
      `<button class="btn btn-primary" id="btn-save-archive" type="button" style="padding:8px 20px;font-size:13px;">💾 保存到历史归档</button>` +
      `<button class="btn" id="btn-need-human" type="button" style="padding:8px 20px;font-size:13px;background:#fff4ec;border:1px solid #ffd8a8;color:var(--brand-1);font-weight:600;">🙋 需要人工</button>` +
      `<span style="font-size:12px;color:var(--text-3);">保存后可在工作台「历史报告归档」中回看</span>` +
      `<span id="save-msg" style="font-size:12px;color:var(--green);display:none;margin-left:8px;">✓ 已保存</span>` +
      `<span id="human-msg" style="font-size:12px;color:var(--brand-1);display:none;margin-left:8px;">✓ 已发送飞书通知</span>`;
    body.appendChild(saveBar);

    artifacts.forEach((a, i) => {
      const tab = document.createElement('div');
      tab.className = 'out-tab' + (i === 0 ? ' active' : '');
      tab.dataset.panel = 'panel-' + a.key;
      tab.textContent = a.label;
      tabs.appendChild(tab);

      const panel = document.createElement('div');
      panel.className = 'out-panel' + (i === 0 ? '' : ' hidden');
      panel.id = 'panel-' + a.key;
      const preId = 'pre-' + a.key;
      panel.innerHTML =
        `<button class="copy-btn" data-target="${preId}">📋 复制</button>` +
        `<pre id="${preId}">${esc(a.content)}</pre>`;
      body.appendChild(panel);
    });

    // 绑定保存事件
    const saveBtn = document.getElementById('btn-save-archive');
    if (saveBtn && opts.collectFn) {
      saveBtn.addEventListener('click', () => {
        const data = opts.collectFn();
        const record = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          timestamp: new Date().toISOString(),
          module: data.module || 'unknown',
          project: data.project || '',
          product: data.product || '',
          goal: data.goal || '',
          data,
          artifacts: artifacts.map(a => ({ key: a.key, label: a.label, content: a.content })),
        };
        saveArchive(record);
        const msg = document.getElementById('save-msg');
        if (msg) { msg.style.display = 'inline'; setTimeout(() => msg.style.display = 'none', 3000); }
        saveBtn.disabled = true;
        saveBtn.textContent = '✓ 已保存';
        showToast('已保存到历史归档', 'success');
      });
    }

    // 绑定「需要人工」按钮事件
    const humanBtn = document.getElementById('btn-need-human');
    if (humanBtn && opts.collectFn) {
      humanBtn.addEventListener('click', async () => {
        const data = opts.collectFn();
        const summary = [
          `📊 模块：${data.module || '日常取数'}`,
          `👤 需求人：${data.owner || '未填写'}`,
          `🎮 产品：${data.product || '未指定'}`,
          `📝 需求：${data.goal || data.query_desc || '未填写'}`,
          `📅 时间：${(data.date_range || []).join(' ~ ') || '未指定'}`,
          data.dims && data.dims.length ? `📐 维度：${data.dims.join('、')}` : '',
          data.filter ? `🔍 过滤：${data.filter}` : '',
        ].filter(Boolean).join('\n');

        const msgContent = `🙋 需要人工协助\n\n${summary}\n\n⏰ ${new Date().toLocaleString('zh-CN')}`;

        // 发送飞书 Webhook 通知
        try {
          humanBtn.disabled = true;
          humanBtn.textContent = '发送中...';
          await fetch('https://open.feishu.cn/open-apis/bot/v2/hook/c29ef9ff-e3f5-432d-b559-9cf338fdd044', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              msg_type: 'text',
              content: { text: msgContent }
            })
          });
          const msg = document.getElementById('human-msg');
          if (msg) { msg.style.display = 'inline'; msg.textContent = '✓ 已发送飞书通知'; setTimeout(() => msg.style.display = 'none', 5000); }
          humanBtn.textContent = '✓ 已通知';
          showToast('已发送飞书通知', 'success');
        } catch (err) {
          humanBtn.disabled = false;
          humanBtn.textContent = '🙋 需要人工';
          const msg = document.getElementById('human-msg');
          if (msg) { msg.style.display = 'inline'; msg.textContent = '⚠️ 发送失败，请手动通知'; msg.style.color = 'var(--red)'; setTimeout(() => msg.style.display = 'none', 5000); }
          showToast('发送失败，请手动通知', 'error', 5000);
        }
      });
    }

    out.classList.remove('hidden');
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- 历史归档 localStorage ---------- */
  const ARCHIVE_KEY = 'ai_analytics_archive';

  function getArchives() {
    try { return JSON.parse(localStorage.getItem(ARCHIVE_KEY) || '[]'); }
    catch { return []; }
  }

  function saveArchive(record) {
    const list = getArchives();
    list.unshift(record);
    if (list.length > 50) list.length = 50;
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list));
  }

  function deleteArchive(id) {
    const list = getArchives().filter(r => r.id !== id);
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(list));
  }

  /* ---------- 表单回填（从归档恢复） ---------- */
  function getRestoreData() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('restore');
    if (!id) return null;
    const list = getArchives();
    return list.find(r => r.id === id) || null;
  }

  function restoreForm(data) {
    if (!data) return;
    // 通用文本/日期/select 字段回填
    Object.entries(data).forEach(([key, value]) => {
      if (typeof value === 'string' || typeof value === 'number') {
        // 尝试按 id 查找
        const el = document.getElementById(key);
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) {
          el.value = value;
        }
      }
    });
    // date_range
    if (data.date_range) {
      const s = document.getElementById('date_start') || document.getElementById('cohort_start') || document.getElementById('focus_start');
      const e = document.getElementById('date_end') || document.getElementById('cohort_end') || document.getElementById('focus_end');
      if (s && data.date_range[0]) s.value = data.date_range[0];
      if (e && data.date_range[1]) e.value = data.date_range[1];
    }
    if (data.cohort_range) {
      const s = document.getElementById('cohort_start');
      const e = document.getElementById('cohort_end');
      if (s && data.cohort_range[0]) s.value = data.cohort_range[0];
      if (e && data.cohort_range[1]) e.value = data.cohort_range[1];
    }
    // product（radio chips + hidden select）
    if (data.product) {
      const sel = document.getElementById('product');
      if (sel) sel.value = data.product;
      // 点亮对应 radio chip
      document.querySelectorAll('input[type=radio]').forEach(inp => {
        if (inp.value === data.product && inp.name.includes('product')) {
          inp.checked = true;
          const chip = inp.closest('.chip');
          if (chip) {
            chip.closest('.chips').querySelectorAll('.chip').forEach(c => c.classList.remove('checked'));
            chip.classList.add('checked');
          }
        }
      });
    }
    // checkbox chips（metrics, dims, etc）
    const chipFields = ['metrics', 'user_metrics', 'dims', 'ret_days', 'ltv_type', 'ltv_windows',
      'ret_dims', 'ab_metrics', 'ab_guardrails', 'ab_dims', 'fn_metrics', 'fn_dims',
      'seg_dims', 'seg_metrics', 'diag_metric', 'diag_dims', 'product_type', 'product_cat',
      'dq_dims', 'dq_filter_pre', 'cc_confounders'];
    // 映射：collect() 存的 key → 实际 DOM input name（处理命名不一致）
    const chipNameMap = { 'dims': 'dq_dims', 'filter_pre': 'dq_filter_pre' };
    chipFields.forEach(name => {
      const values = data[name];
      if (Array.isArray(values)) {
        values.forEach(v => {
          let inp = document.querySelector(`input[name="${name}"][value="${CSS.escape(v)}"]`);
          // 若找不到，尝试映射名（如 data.dims → input[name="dq_dims"]）
          if (!inp && chipNameMap[name]) {
            inp = document.querySelector(`input[name="${chipNameMap[name]}"][value="${CSS.escape(v)}"]`);
          }
          if (inp) {
            inp.checked = true;
            const chip = inp.closest('.chip');
            if (chip) chip.classList.add('checked');
          }
        });
      }
    });
    // 额外处理：data.dims 实际对应 DOM name="dq_dims"（collect 存 dims，DOM 用 dq_dims）
    if (Array.isArray(data.dims) && !document.querySelector('input[name="dims"]')) {
      data.dims.forEach(v => {
        const inp = document.querySelector(`input[name="dq_dims"][value="${CSS.escape(v)}"]`);
        if (inp) {
          inp.checked = true;
          const chip = inp.closest('.chip');
          if (chip) chip.classList.add('checked');
        }
      });
    }
    // 额外处理：过滤条件预设 chips — 根据 dq_filter 文本内容反向勾选对应 chip
    if (data.filter && typeof data.filter === 'string') {
      const filterPresets = ['只看APP', '只看成年人', '只看新用户', '剔除机器人(UNO)'];
      filterPresets.forEach(preset => {
        if (data.filter.includes(preset)) {
          const inp = document.querySelector(`input[name="dq_filter_pre"][value="${CSS.escape(preset)}"]`);
          if (inp) {
            inp.checked = true;
            const chip = inp.closest('.chip');
            if (chip) chip.classList.add('checked');
          }
        }
      });
    }
    // goal / desc textarea
    if (data.goal) {
      const goal = document.getElementById('goal') || document.getElementById('fn_goal') ||
        document.getElementById('ret_goal') || document.getElementById('seg_goal') ||
        document.getElementById('ab_goal') || document.getElementById('cc_goal') ||
        document.getElementById('query_desc') || document.getElementById('diag_desc');
      if (goal) goal.value = data.goal;
    }
    // owner
    if (data.owner) { const o = document.getElementById('owner'); if (o) o.value = data.owner; }
    // pk
    if (data.pk) { const p = document.getElementById('pk'); if (p) p.value = data.pk; }
    // notes
    if (data.notes) {
      const n = document.getElementById('notes') || document.getElementById('fn_notes') ||
        document.getElementById('ret_notes') || document.getElementById('seg_notes') ||
        document.getElementById('cc_notes') || document.getElementById('diag_notes');
      if (n) n.value = data.notes;
    }
    // north_star_formula
    if (data.north_star_formula) {
      const f = document.getElementById('transfer_formula'); if (f) f.value = data.north_star_formula;
    }
    // sql_ref (单个 textarea)
    if (data.sql_ref) {
      const refs = ['fn_sql_ref', 'ret_sql_ref', 'seg_sql_ref', 'ab_sql_ref', 'cc_sql_ref', 'diag_sql_ref', 'dq_sql_ref'];
      refs.forEach(id => { const el = document.getElementById(id); if (el) el.value = data.sql_ref; });
    }
    // 动态行恢复（延迟执行，等动态行初始化完成）
    setTimeout(() => {
      // 列映射
      if (data.column_map && data.column_map.length && window.__addMapRow) {
        clearContainer('map-rows');
        data.column_map.forEach(row => window.__addMapRow(row));
      }
      // 埋点参考 (log_refs)
      if (data.log_refs && data.log_refs.length) {
        const containers = ['log-ref-rows', 'fn-log-ref-rows', 'ret-log-ref-rows', 'seg-log-ref-rows', 'ab-log-ref-rows'];
        containers.forEach(id => {
          const c = document.getElementById(id);
          if (c) {
            clearContainer(id);
            const addBtn = document.getElementById(id.replace('-rows', '').replace('log-ref', 'add-log-ref').replace('ab-log-ref','add-ab-log-ref').replace('fn-log-ref','add-fn-log-ref').replace('ret-log-ref','add-ret-log-ref').replace('seg-log-ref','add-seg-log-ref'));
            // 用通用方式添加行：模拟点击 add 按钮
            data.log_refs.forEach(row => {
              // 直接创建行
              const div = document.createElement('div');
              div.className = 'dyn-row';
              div.innerHTML = `<input type="text" data-f="log_name" value="${esc(row.log_name || '')}" style="flex:0 0 160px;">` +
                `<input type="text" data-f="doc_url" value="${esc(row.doc_url || '')}">` +
                `<input type="text" data-f="fields" value="${esc(row.fields || '')}">` +
                `<button type="button" class="del" title="删除">×</button>`;
              div.querySelector('.del').addEventListener('click', () => div.remove());
              c.appendChild(div);
            });
          }
        });
      }
      // 历史 SQL 参考 (sql_refs)
      if (data.sql_refs && data.sql_refs.length) {
        const c = document.getElementById('sql-ref-rows');
        if (c) {
          clearContainer('sql-ref-rows');
          data.sql_refs.forEach(row => {
            const div = document.createElement('div');
            div.className = 'dyn-row';
            div.innerHTML = `<input type="text" data-f="sql_label" value="${esc(row.sql_label || '')}" style="flex:0 0 200px;margin-bottom:6px;">` +
              `<textarea data-f="sql_code" rows="3" style="flex:1;min-height:60px;font-family:monospace;font-size:12px;">${esc(row.sql_code || '')}</textarea>` +
              `<button type="button" class="del" title="删除">×</button>`;
            div.querySelector('.del').addEventListener('click', () => div.remove());
            c.appendChild(div);
          });
        }
      }
      // 分析问题 (questions)
      if (data.questions && data.questions.length) {
        const containers = ['q-rows', 'fn-q-rows', 'ab-q-rows'];
        containers.forEach(id => {
          const c = document.getElementById(id);
          if (c && c.children.length <= 1) {
            clearContainer(id);
            data.questions.forEach((row, i) => {
              const div = document.createElement('div');
              div.className = 'question-block';
              div.innerHTML = `<div class="qhead"><span class="qtag">Q${i+1}</span></div>` +
                `<input type="text" data-f="question" value="${esc(row.question || '')}" style="margin-bottom:6px">` +
                (row.hint ? `<input type="text" data-f="hint" value="${esc(row.hint || '')}">` : '') +
                `<button type="button" class="del" title="删除">×</button>`;
              div.querySelector('.del').addEventListener('click', () => div.remove());
              c.appendChild(div);
            });
          }
        });
      }
    }, 500);
    // 显示恢复提示
    const banner = document.createElement('div');
    banner.style.cssText = 'background:#e8f5e9;color:#2e7d32;padding:10px 16px;border-radius:8px;margin-bottom:16px;font-size:13px;font-weight:600;';
    banner.textContent = '✓ 已从历史归档恢复表单内容';
    const form = document.querySelector('form') || document.querySelector('.form-wrap');
    if (form) form.insertBefore(banner, form.firstChild);
  }

  /* ---------- 初始化全部通用交互 ---------- */
  function init() {
    initModeSwitch();
    initChips();
    initCustomChips();
    initCopy();
    initOutputTabs();
    initRealTimeValidation();
    initDraftAutoSave();
    // 检查是否从归档恢复
    setTimeout(() => {
      const record = getRestoreData();
      if (record && record.data) restoreForm(record.data);
    }, 300);
  }

  /* ---------- 草稿自动保存 ---------- */
  function initDraftAutoSave() {
    const form = document.querySelector('form');
    if (!form) return;
    const pageKey = 'draft_' + location.pathname.replace(/[^a-z0-9]/gi, '_');

    // 检查是否有草稿（排除归档恢复的情况）
    const params = new URLSearchParams(window.location.search);
    if (!params.get('restore')) {
      const saved = localStorage.getItem(pageKey);
      if (saved) {
        try {
          const draft = JSON.parse(saved);
          const age = Date.now() - (draft._ts || 0);
          if (age < 7 * 24 * 3600 * 1000) { // 7天内有效
            const ago = age < 60000 ? '刚刚' : age < 3600000 ? Math.floor(age/60000) + '分钟前' : Math.floor(age/3600000) + '小时前';
            const banner = document.createElement('div');
            banner.style.cssText = 'background:#fff8e1;color:#b8860b;padding:10px 16px;border-radius:8px;margin-bottom:16px;font-size:13px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;';
            banner.innerHTML = `⚠️ 检测到未完成的草稿（${ago}保存）<button id="draft-restore" style="padding:5px 14px;border-radius:6px;border:1px solid #b8860b;background:#fff;color:#b8860b;font-size:12px;font-weight:600;cursor:pointer;">恢复填写</button><button id="draft-discard" style="padding:5px 14px;border-radius:6px;border:1px solid var(--border);background:#fff;color:var(--text-3);font-size:12px;cursor:pointer;">放弃草稿</button>`;
            const wrap = document.querySelector('.form-wrap') || form.parentNode;
            wrap.insertBefore(banner, wrap.children[2] || wrap.firstChild);
            document.getElementById('draft-restore').addEventListener('click', () => {
              restoreForm(draft);
              banner.remove();
            });
            document.getElementById('draft-discard').addEventListener('click', () => {
              localStorage.removeItem(pageKey);
              banner.remove();
            });
          } else {
            localStorage.removeItem(pageKey); // 过期清理
          }
        } catch(e) { localStorage.removeItem(pageKey); }
      }
    }

    // 自动保存：监听表单变化，防抖 2 秒后存 localStorage
    let saveTimer;
    const autoSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        const data = {};
        form.querySelectorAll('input, textarea, select').forEach(el => {
          if (!el.id && !el.name) return;
          const key = el.id || el.name;
          if (el.type === 'checkbox' || el.type === 'radio') {
            if (el.checked) data[key] = el.value;
          } else if (el.value && el.value.trim()) {
            data[key] = el.value;
          }
        });
        // 保存选中的 chips
        form.querySelectorAll('.chip input:checked').forEach(inp => {
          const name = inp.name;
          if (!data['_chips_' + name]) data['_chips_' + name] = [];
          data['_chips_' + name].push(inp.value);
        });
        data._ts = Date.now();
        localStorage.setItem(pageKey, JSON.stringify(data));
      }, 2000);
    };
    form.addEventListener('input', autoSave);
    form.addEventListener('change', autoSave);

    // 提交成功后清除草稿
    form.addEventListener('submit', () => {
      setTimeout(() => localStorage.removeItem(pageKey), 500);
    });
  }

  /* ---------- 实时校验 ---------- */
  function initRealTimeValidation() {
    // 必填文本/日期/select 字段：blur 时校验
    document.querySelectorAll('[data-required]').forEach(el => {
      el.addEventListener('blur', () => validateField(el));
      el.addEventListener('input', () => {
        // 输入时如果之前是错误状态，实时清除
        const field = el.closest('.field') || el.closest('.fcard');
        if (field && field.classList.contains('error')) {
          if (el.value && el.value.trim()) {
            field.classList.remove('error');
            field.classList.add('valid');
          }
        }
      });
    });

    // 日期范围校验：开始日期 < 结束日期
    initDateRangeValidation();
  }

  function validateField(el) {
    const field = el.closest('.field') || el.closest('.fcard');
    if (!field) return;
    const empty = !el.value || !el.value.trim();
    field.classList.toggle('error', empty);
    field.classList.toggle('valid', !empty);
    // 更新错误提示文字
    const errMsg = field.querySelector('.err-msg');
    if (errMsg) errMsg.textContent = empty ? '此项为必填' : '';
  }

  function initDateRangeValidation() {
    const startIds = ['date_start', 'cohort_start', 'focus_start'];
    const endIds = ['date_end', 'cohort_end', 'focus_end'];
    startIds.forEach((sid, i) => {
      const startEl = document.getElementById(sid);
      const endEl = document.getElementById(endIds[i]);
      if (!startEl || !endEl) return;
      // 联动：开始日期改变时限制结束日期的 min
      startEl.addEventListener('change', () => {
        if (startEl.value) endEl.min = startEl.value;
        if (endEl.value && startEl.value && endEl.value < startEl.value) {
          endEl.value = startEl.value;
        }
      });
      // 联动：结束日期改变时限制开始日期的 max
      endEl.addEventListener('change', () => {
        if (endEl.value) startEl.max = endEl.value;
        if (startEl.value && endEl.value && startEl.value > endEl.value) {
          startEl.value = endEl.value;
        }
      });
    });
  }

  /* ---------- Wizard 引导模式 ---------- */
  // steps: [{title, question, explain, example}]
  // 自动在 form 的 .fcard 上绑定 wizard 行为
  function initWizard(steps) {
    const cards = document.querySelectorAll('.fcard');
    if (!cards.length) return;

    // 构建进度条
    const progressWrap = document.createElement('div');
    progressWrap.className = 'wizard-progress';
    steps.forEach((s, i) => {
      const dot = document.createElement('div');
      dot.className = 'wiz-step-dot' + (i === 0 ? ' active' : '');
      dot.style.cursor = 'pointer';
      dot.innerHTML =
        `<div class="dot">${i + 1}</div>` +
        `<span class="dot-label">${s.title}</span>` +
        (i < steps.length - 1 ? '<div class="line"></div>' : '');
      dot.addEventListener('click', () => go(i));
      progressWrap.appendChild(dot);
    });
    const form = document.querySelector('form') || document.querySelector('.form-wrap');
    const firstCard = cards[0];
    form.insertBefore(progressWrap, firstCard);

    // 已填写内容回顾面板（插在进度条和卡片之间）
    const recap = document.createElement('div');
    recap.className = 'wiz-recap';
    recap.style.display = 'none';
    form.insertBefore(recap, firstCard);

    // 给每个 fcard 注入问答提示（仅在 guide 模式可见）
    cards.forEach((card, i) => {
      if (!steps[i]) return;
      const s = steps[i];
      const frag = document.createElement('div');
      frag.innerHTML =
        (s.question ? `<div class="wiz-question">${s.question}</div>` : '') +
        (s.explain ? `<div class="wiz-explain">${s.explain}</div>` : '') +
        (s.example ? `<div class="wiz-example">${s.example}</div>` : '');
      card.insertBefore(frag, card.querySelector('h3').nextSibling);
    });

    // 导航
    const navEl = document.createElement('div');
    navEl.className = 'wiz-nav';
    navEl.innerHTML =
      `<button type="button" class="btn-wiz btn-prev" disabled>← 上一步</button>` +
      `<span class="wiz-counter">1 / ${steps.length}</span>` +
      `<button type="button" class="btn-wiz btn-next">下一步 →</button>`;
    form.appendChild(navEl);

    const btnPrev = navEl.querySelector('.btn-prev');
    const btnNext = navEl.querySelector('.btn-next');
    const counter = navEl.querySelector('.wiz-counter');
    const dots = progressWrap.querySelectorAll('.wiz-step-dot');

    let current = 0;
    const total = Math.min(cards.length, steps.length);

    // 从一个卡片中提取「已填写」的内容摘要
    function summarizeCard(card) {
      const raw = [];
      // 已勾选的 chips（含自定义）
      card.querySelectorAll('.chip input:checked').forEach(inp => {
        const v = (inp.value || '').trim();
        if (v) raw.push(v);
      });
      // 文本 / 数字 / 日期 / 下拉 / textarea（跳过隐藏的镜像 select 和自定义输入框）
      card.querySelectorAll('input[type=text], input[type=date], input[type=number], textarea, select').forEach(el => {
        if (el.classList.contains('chip-add-input')) return;
        if (el.closest('.wiz-recap')) return;
        if (el.tagName === 'SELECT' && el.offsetParent === null) return; // 隐藏镜像 select
        const v = (el.value || '').trim();
        if (v) raw.push(v);
      });
      // 去重：完全相同 + 互为子串的只保留较长者
      const items = [];
      raw.forEach(v => {
        if (items.some(x => x === v)) return;            // 完全相同
        if (items.some(x => x.includes(v))) return;      // v 是已有项子串
        const subIdx = items.findIndex(x => v.includes(x)); // 已有项是 v 的子串
        if (subIdx >= 0) { items[subIdx] = v; return; }
        items.push(v);
      });
      return items.map(t => t.length > 40 ? t.slice(0, 40) + '…' : t);
    }

    function renderRecap() {
      // 第一步不显示
      if (current === 0) { recap.style.display = 'none'; return; }
      const blocks = [];
      for (let i = 0; i < current; i++) {
        const card = cards[i];
        if (!card) continue;
        const title = (steps[i] && steps[i].title) || `第 ${i + 1} 步`;
        const items = summarizeCard(card);
        const inner = items.length
          ? items.map(t => `<span class="wiz-recap-tag">${esc(t)}</span>`).join('')
          : `<span class="wiz-recap-empty">（未填）</span>`;
        blocks.push(
          `<div class="wiz-recap-row" data-step="${i}">` +
            `<span class="wiz-recap-step">${i + 1}. ${esc(title)}</span>` +
            `<span class="wiz-recap-items">${inner}</span>` +
            `<button type="button" class="wiz-recap-edit" data-step="${i}">修改</button>` +
          `</div>`
        );
      }
      recap.innerHTML =
        `<div class="wiz-recap-head">📝 已填写内容</div>` + blocks.join('');
      recap.style.display = 'block';
      // 「修改」跳回对应步骤
      recap.querySelectorAll('.wiz-recap-edit').forEach(btn => {
        btn.addEventListener('click', () => go(parseInt(btn.dataset.step, 10)));
      });
    }

    function go(idx) {
      if (idx < 0 || idx >= total) return;
      current = idx;
      cards.forEach((c, i) => c.classList.toggle('wiz-active', i === current));
      dots.forEach((d, i) => {
        d.classList.toggle('active', i === current);
        d.classList.toggle('done', i < current);
      });
      counter.textContent = `${current + 1} / ${total}`;
      btnPrev.disabled = current === 0;
      btnNext.textContent = current === total - 1 ? '✅ 完成并生成' : '下一步 →';
      renderRecap();
      progressWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // 通知回调
      if (steps[current] && steps[current].onEnter) steps[current].onEnter(current);
    }

    btnNext.addEventListener('click', () => {
      if (current === total - 1) {
        const submitBtn = form.querySelector('[type=submit]');
        if (submitBtn) submitBtn.click();
      } else {
        // 校验当前步骤的必填项
        const currentCard = cards[current];
        let stepOk = true;
        if (currentCard) {
          currentCard.querySelectorAll('[data-required]').forEach(el => {
            const empty = !el.value || !el.value.trim();
            const field = el.closest('.field') || el.closest('.fcard');
            if (field) {
              field.classList.toggle('error', empty);
              field.classList.toggle('valid', !empty);
            }
            if (empty) stepOk = false;
          });
        }
        if (!stepOk) {
          // 滚动到第一个错误字段
          const firstErr = currentCard.querySelector('.field.error');
          if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return; // 阻止跳转
        }
        go(current + 1);
      }
    });
    btnPrev.addEventListener('click', () => go(current - 1));

    go(0);

    const modeSwitch = document.querySelector('.mode-switch');
    if (modeSwitch) {
      modeSwitch.addEventListener('click', () => {
        setTimeout(() => {
          if (document.body.classList.contains('mode-guide')) go(current);
        }, 50);
      });
    }
  }

  return {
    init, initDynamic, collectRows, clearContainer, getCheckedChips, validate,
    renderArtifacts, val, esc, nonEmpty, showToast,
    initSegToggle, addCustomChip, parseCsvHeader, wireChip, initWizard,
    getArchives, saveArchive, deleteArchive, getRestoreData, restoreForm,
  };
})();
