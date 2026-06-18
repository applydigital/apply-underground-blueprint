(async function(){
  const data = await (await fetch('data.json', { cache: 'no-store' })).json();
  const allItems = data.deliverables;
  const byId = new Map(allItems.map(d => [d.id, d]));

  // ───── Layout constants ─────
  const TOTAL_COLS = 16;
  const COL_W = 160;
  const COL_GAP = 14;
  const ROW_H = 104;
  const BOX_H = 84;
  const PAD_X = 40;
  const PHASE_GAP = Math.round(COL_W / 4);

  function colToX(col) {
    let x = PAD_X + (col - 1) * COL_W;
    if (col >= 6)  x += PHASE_GAP;
    if (col >= 12) x += PHASE_GAP;
    return x;
  }

  const COL_IND_Y        = 8;
  const COL_IND_H        = 20;
  const PM_TRACK_PAD_TOP = 34;
  const PM_TRACK_TOP     = COL_IND_Y + COL_IND_H + 14;
  const PM_GRID_GAP      = 52 + COL_GAP + PHASE_GAP - 32;
  const GRID_TRACK_TOP_PAD = 36;
  const PM_MIN_ROW       = 7;
  const PM_MAX_ROW       = 15;
  const TRACK_PAD        = { x: 16, bottom: 18, right: 16 };

  // D&P sublane: shared rows 1–4 above divider, strategy-only rows 5–7 below
  const DISC_SUBLANE_SPLIT_ROW = 5; // first row of the strategy-only sublane

  const TRACKS = [
    { key: 'pm',    name: 'Project Management',    colStart: 1,  colEnd: 16, rowStart: 7,  rowEnd: 15 },
    { key: 'disc',  name: 'Discovery & Planning',  colStart: 1,  colEnd: 5,  rowStart: 1,  rowEnd: 6  },
    { key: 'des',   name: 'Design & Requirements', colStart: 6,  colEnd: 11, rowStart: 1,  rowEnd: 6  },
    { key: 'build', name: 'Build & Run',           colStart: 12, colEnd: 16, rowStart: 1,  rowEnd: 6  },
  ];

  // ───── Mutable render state (rebuilt on each filterEngagement call) ─────
  let boxEls    = new Map();
  let edges     = [];
  let inboundOf = new Map();
  let outboundOf = new Map();
  let items     = allItems;

  // ───── Selection state (persists across re-renders) ─────
  const selected = new Set();
  let chainMode = false; // true when selection was built via ⌘-click chain
  let showConnections = false;
  const ROLE_RANK = { 'in': 4, 'out': 3, 'in-t': 2 };

  const stageWrap = document.getElementById('stageWrap');
  const svg       = document.getElementById('lines');

  // ───── Layout computation ─────
  function buildLayout(activeItems) {
    const rowsUsed = new Set();
    activeItems.forEach(d => { if (d.row) rowsUsed.add(d.row); });
    const sortedRows = [...rowsUsed].sort((a, b) => a - b);
    const gridRows   = sortedRows.filter(r => r < PM_MIN_ROW);

    const rowY = {};
    let y = PM_TRACK_TOP + PM_TRACK_PAD_TOP;
    gridRows.forEach(r => { rowY[r] = y; y += ROW_H; });

    const GRID_LAST_BOX_BOTTOM = gridRows.length
      ? rowY[gridRows[gridRows.length - 1]] + BOX_H
      : y;
    const PM_Y = GRID_LAST_BOX_BOTTOM + PM_GRID_GAP;

    for (let r = PM_MIN_ROW; r <= PM_MAX_ROW; r++) {
      rowY[r] = PM_Y + (r - PM_MIN_ROW) * ROW_H;
    }

    activeItems.forEach(d => {
      const cols = d.cols || [0, 0];
      d._x = colToX(cols[0]);
      d._w = colToX(cols[1]) - colToX(cols[0]) + (COL_W - COL_GAP);
      const row = d.row || 1;
      d._y = rowY[row] || rowY[1] || PM_Y;
    });

    return {
      rowY,
      gridRows,
      PM_Y,
      PM_LAST_BOX_BOTTOM: rowY[PM_MAX_ROW] + BOX_H,
    };
  }

  // ───── Full map render (called on load and on filter change) ─────
  function renderMap(activeItems) {
    items = activeItems;
    const activeIds = new Set(activeItems.map(d => d.id));

    // Clear previous render (keep SVG <defs>)
    stageWrap.querySelectorAll(
      '.box, .track, .track-label, .col-indicator, .row-indicator, .sublane-divider'
    ).forEach(el => el.remove());
    [...svg.children]
      .filter(el => el.tagName.toLowerCase() !== 'defs')
      .forEach(el => el.remove());

    // Prune selected ids that are no longer visible
    selected.forEach(id => { if (!activeIds.has(id)) selected.delete(id); });

    // Reset state
    boxEls     = new Map();
    edges      = [];
    inboundOf  = new Map();
    outboundOf = new Map();

    const { rowY, gridRows, PM_Y, PM_LAST_BOX_BOTTOM } = buildLayout(activeItems);

    const allRows = gridRows.concat(
      [...Array(PM_MAX_ROW - PM_MIN_ROW + 1).keys()].map(i => i + PM_MIN_ROW)
    );

    // Canvas size
    const maxX = Math.max(...activeItems.map(d => d._x + d._w)) + PAD_X;
    const maxY = Math.max(...activeItems.map(d => d._y + BOX_H)) + 80;
    stageWrap.style.width  = maxX + 'px';
    stageWrap.style.height = maxY + 'px';
    svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
    svg.style.width  = maxX + 'px';
    svg.style.height = maxY + 'px';

    // ── Column indicators ──
    for (let col = 1; col <= TOTAL_COLS; col++) {
      const x = colToX(col) + (COL_W - COL_GAP) / 2;
      const el = document.createElement('div');
      el.className = 'col-indicator';
      el.style.left = `${x}px`;
      el.style.top  = `${COL_IND_Y}px`;
      el.textContent = col;
      stageWrap.appendChild(el);
    }

    // ── Row indicators ──
    allRows.forEach(rowNum => {
      if (!rowY[rowNum]) return;
      const el = document.createElement('div');
      el.className = 'row-indicator';
      el.style.top = `${rowY[rowNum] + BOX_H / 2}px`;
      el.textContent = rowNum;
      stageWrap.appendChild(el);
    });

    // ── Track containers ──
    TRACKS.forEach(t => {
      const minX  = colToX(t.colStart) - TRACK_PAD.x;
      const maxXt = colToX(t.colEnd) + (COL_W - COL_GAP) + TRACK_PAD.right;
      // Grid tracks: size to rows that actually have items in THIS track's column range,
      // so filtering out strategy items collapses the D&P track to only its remaining rows.
      const trackRows = (t.key === 'pm')
        ? allRows.filter(r => r >= t.rowStart && r <= t.rowEnd)
        : [...new Set(
            activeItems
              .filter(d => d.row >= t.rowStart && d.row <= t.rowEnd && d.row < PM_MIN_ROW &&
                           d.cols[0] >= t.colStart && d.cols[1] <= t.colEnd)
              .map(d => d.row)
          )].sort((a, b) => a - b);
      if (!trackRows.length && t.key !== 'pm') return;

      const minY = t.key === 'pm'
        ? PM_Y - PM_TRACK_PAD_TOP
        : (trackRows[0] ? rowY[trackRows[0]] - GRID_TRACK_TOP_PAD : PM_TRACK_TOP);
      const maxYt = t.key === 'pm'
        ? PM_LAST_BOX_BOTTOM + TRACK_PAD.bottom
        : (trackRows.length
            ? rowY[trackRows[trackRows.length - 1]] + BOX_H + TRACK_PAD.bottom
            : PM_TRACK_TOP);

      const tr = document.createElement('div');
      tr.className = 'track t-' + t.key;
      tr.style.left   = minX + 'px';
      tr.style.top    = minY + 'px';
      tr.style.width  = (maxXt - minX) + 'px';
      tr.style.height = (maxYt - minY) + 'px';
      stageWrap.insertBefore(tr, stageWrap.firstChild);

      const lbl = document.createElement('div');
      lbl.className = 'track-label';
      lbl.style.left = (minX + 14) + 'px';
      lbl.style.top  = (minY + 12) + 'px';
      lbl.textContent = t.name;
      stageWrap.appendChild(lbl);
    });

    // ── D&P sublane divider ──
    // Renders only when the active set has items in both the strategy sublane
    // (rows 1–6) and the delivery sublane (rows 7–8) of Discovery & Planning.
    const discItems = activeItems.filter(d => d.stage === 'Discovery & Planning');
    const hasStrategyRows = discItems.some(d => d.row < DISC_SUBLANE_SPLIT_ROW);
    const hasDeliveryRows = discItems.some(d => d.row >= DISC_SUBLANE_SPLIT_ROW);

    if (hasStrategyRows && hasDeliveryRows && rowY[DISC_SUBLANE_SPLIT_ROW]) {
      const divY = rowY[DISC_SUBLANE_SPLIT_ROW] - Math.round((ROW_H - BOX_H) / 2) - 2;
      const discTrack = TRACKS.find(t => t.key === 'disc');
      const divLeft   = colToX(discTrack.colStart) - TRACK_PAD.x + 10;
      const divWidth  = colToX(discTrack.colEnd) + (COL_W - COL_GAP) + TRACK_PAD.right - divLeft - 10;

      const divider = document.createElement('div');
      divider.className = 'sublane-divider';
      divider.style.left  = divLeft + 'px';
      divider.style.top   = divY + 'px';
      divider.style.width = divWidth + 'px';
      divider.innerHTML = `
        <div class="sublane-line"></div>
        <span class="sublane-label-div">Strategy Discovery</span>
        <div class="sublane-line"></div>
      `;
      stageWrap.appendChild(divider);
    }

    // ── Boxes ──
    activeItems.forEach(d => {
      const eng = d.engagementType || [];
      const isStratOnly = eng.length === 1 && eng[0] === 'strategy';
      const isDelivOnly = eng.length === 1 && eng[0] === 'delivery';
      const badge = isStratOnly
        ? '<span class="eng-badge eng-s">S</span>'
        : isDelivOnly
          ? '<span class="eng-badge eng-d">D</span>'
          : '';

      const el = document.createElement('div');
      el.className = 'box t-' + d.type;
      el.style.left  = d._x + 'px';
      el.style.top   = d._y + 'px';
      el.style.width = d._w + 'px';
      el.dataset.id    = d.id;
      el.dataset.stage = d.stage;
      el.innerHTML = `
        <div class="row1">
          <span class="id">${d.id}</span>
          ${badge}
          <span class="type-dot" title="${d.type}"></span>
        </div>
        <div class="title">${escapeHtml(d.title)}</div>
        <button class="details" data-action="details">Details →</button>
      `;
      stageWrap.appendChild(el);
      boxEls.set(d.id, el);
    });

    // ── Edges ──
    activeItems.forEach(d => {
      (d.dependencies.hard || []).forEach(srcId => {
        if (activeIds.has(srcId)) edges.push({ src: srcId, tgt: d.id, kind: 'hard' });
      });
      (d.dependencies.soft || []).forEach(srcId => {
        if (activeIds.has(srcId)) edges.push({ src: srcId, tgt: d.id, kind: 'soft' });
      });
    });

    edges.forEach(e => {
      if (!inboundOf.has(e.tgt))  inboundOf.set(e.tgt, []);
      if (!outboundOf.has(e.src)) outboundOf.set(e.src, []);
      inboundOf.get(e.tgt).push(e);
      outboundOf.get(e.src).push(e);
    });

    edges.forEach((e, i) => {
      const s = byId.get(e.src);
      const t = byId.get(e.tgt);
      const { sx, sy, tx, ty } = anchors(s, t);
      const pathD = bezier(sx, sy, tx, ty);
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathD);
      path.setAttribute('marker-end', 'url(#arrow-default)');
      if (e.kind === 'soft') path.classList.add('soft');
      path.dataset.src = e.src;
      path.dataset.tgt = e.tgt;
      svg.appendChild(path);
      e._el = path;
      e._i  = i;
    });

    render();
  }

  // ───── Geometry helpers ─────
  function anchors(s, t) {
    const sCx = s._x + s._w / 2;
    const tCx = t._x + t._w / 2;
    const sCy = s._y + BOX_H / 2;
    const tCy = t._y + BOX_H / 2;
    const dx = Math.abs(tCx - sCx);
    const dy = Math.abs(tCy - sCy);
    let sx, sy, tx, ty;
    if (dx >= dy) {
      if (tCx >= sCx) {
        sx = s._x + s._w; sy = sCy;
        tx = t._x;        ty = tCy;
      } else {
        sx = s._x;        sy = sCy;
        tx = t._x + t._w; ty = tCy;
      }
    } else {
      if (tCy >= sCy) {
        sx = sCx; sy = s._y + BOX_H;
        tx = tCx; ty = t._y;
      } else {
        sx = sCx; sy = s._y;
        tx = tCx; ty = t._y + BOX_H;
      }
    }
    return { sx, sy, tx, ty };
  }
  function bezier(sx, sy, tx, ty) {
    const dx = tx - sx;
    const dy = ty - sy;
    const horizontal = Math.abs(dx) >= Math.abs(dy);
    let c1x, c1y, c2x, c2y;
    if (horizontal) {
      const off = Math.max(40, Math.abs(dx) * 0.45);
      c1x = sx + Math.sign(dx || 1) * off; c1y = sy;
      c2x = tx - Math.sign(dx || 1) * off; c2y = ty;
    } else {
      const off = Math.max(40, Math.abs(dy) * 0.45);
      c1x = sx; c1y = sy + Math.sign(dy || 1) * off;
      c2x = tx; c2y = ty - Math.sign(dy || 1) * off;
    }
    return `M ${sx} ${sy} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${tx} ${ty}`;
  }

  // ───── Selection state ─────
  function toggle(id) {
    chainMode = false;
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    render();
  }
  function clearSel() {
    chainMode = false;
    selected.clear();
    render();
  }

  function selectChain(id) {
    chainMode = true;
    const toAdd = new Set([id]);
    let frontier = [id];
    while (frontier.length) {
      const next = [];
      frontier.forEach(nodeId => {
        (inboundOf.get(nodeId) || []).forEach(e => {
          if (e.kind === 'hard' && !toAdd.has(e.src)) {
            toAdd.add(e.src);
            next.push(e.src);
          }
        });
      });
      frontier = next;
    }
    toAdd.forEach(nodeId => selected.add(nodeId));
    render();
  }

  function bumpRole(map, key, role) {
    const cur = map.get(key);
    if (!cur || ROLE_RANK[role] > ROLE_RANK[cur]) map.set(key, role);
  }

  function computeRoles() {
    const nodeRole = new Map();
    const edgeRole = new Map();

    selected.forEach(seed => {
      const visited = new Set([seed]);
      let frontier = [seed];
      let depth = 0;
      while (frontier.length) {
        depth++;
        const next = [];
        const role = depth === 1 ? 'in' : 'in-t';
        frontier.forEach(id => {
          (inboundOf.get(id) || []).forEach(e => {
            if ((chainMode || depth > 1) && e.kind !== 'hard') return;
            bumpRole(edgeRole, e._i, role);
            if (!visited.has(e.src)) {
              visited.add(e.src);
              if (!selected.has(e.src)) bumpRole(nodeRole, e.src, role);
              next.push(e.src);
            }
          });
        });
        frontier = showConnections ? next : [];
      }
    });

    if (!chainMode) {
      selected.forEach(seed => {
        (outboundOf.get(seed) || []).forEach(e => {
          bumpRole(edgeRole, e._i, 'out');
          if (!selected.has(e.tgt)) bumpRole(nodeRole, e.tgt, 'out');
        });
      });
    }

    return { nodeRole, edgeRole };
  }

  function render() {
    document.body.classList.toggle('has-sel', selected.size > 0);
    svg.classList.toggle('no-bg-edges', !showConnections);
    document.getElementById('clear').disabled = selected.size === 0;
    document.getElementById('selcount').textContent =
      selected.size > 0 ? `${selected.size} selected` : '';

    const { nodeRole, edgeRole } = computeRoles();
    const roleClasses = ['in', 'in-t', 'out'];

    boxEls.forEach((el, id) => {
      el.classList.toggle('sel', selected.has(id));
      const role = nodeRole.get(id);
      roleClasses.forEach(c => el.classList.toggle(c, role === c));
    });

    edges.forEach((e, i) => {
      const role = edgeRole.get(i);
      e._el.classList.remove('hl-in', 'hl-in-t', 'hl-out');
      if (role) {
        e._el.classList.add('hl-' + role);
        e._el.setAttribute('marker-end', 'url(#arrow-' + role + ')');
      } else {
        e._el.setAttribute('marker-end', 'url(#arrow-default)');
      }
    });
  }

  // ───── Engagement filter ─────
  function filterEngagement(type) {
    document.querySelectorAll('.eng-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === type);
    });
    const activeItems = type === 'all'
      ? allItems
      : allItems.filter(d => d.engagementType && d.engagementType.includes(type));
    renderMap(activeItems);
  }

  // ───── Events ─────
  stageWrap.addEventListener('click', (ev) => {
    const box = ev.target.closest('.box');
    if (!box) return;
    if (ev.target.closest('[data-action="details"]')) {
      openTray(box.dataset.id);
      return;
    }
    if (ev.metaKey || ev.ctrlKey) {
      selectChain(box.dataset.id);
    } else {
      toggle(box.dataset.id);
    }
  });
  document.getElementById('clear').addEventListener('click', clearSel);
  document.getElementById('connBtn').addEventListener('click', () => {
    showConnections = !showConnections;
    document.getElementById('connBtn').classList.toggle('active', showConnections);
    render();
  });
  document.getElementById('engFilter').addEventListener('click', (e) => {
    const btn = e.target.closest('.eng-filter-btn');
    if (!btn) return;
    filterEngagement(btn.dataset.filter);
  });

  // ───── Tray ─────
  const tray  = document.getElementById('tray');
  const scrim = document.getElementById('trayScrim');

  function openTray(id) {
    const d = byId.get(id);
    if (!d) return;
    document.getElementById('trayEyebrow').innerHTML =
      `<span>${d.id}</span><span>·</span><span>${escapeHtml(d.stage)}</span><span>·</span><span>${escapeHtml(d.type)}</span>`;
    document.getElementById('trayTitle').textContent = d.title;
    document.getElementById('trayBody').innerHTML = renderTray(d);
    tray.classList.add('open');
    scrim.classList.add('open');
    tray.setAttribute('aria-hidden', 'false');
  }
  function closeTray() {
    tray.classList.remove('open');
    scrim.classList.remove('open');
    tray.setAttribute('aria-hidden', 'true');
  }
  document.getElementById('trayClose').addEventListener('click', closeTray);
  scrim.addEventListener('click', closeTray);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeTray(); });

  document.getElementById('trayBody').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip[data-jump]');
    if (!chip) return;
    const id = chip.dataset.jump;
    closeTray();
    if (!selected.has(id)) toggle(id);
    scrollToBox(id);
  });

  function scrollToBox(id) {
    const el = boxEls.get(id);
    if (!el) return;
    const canvas = document.getElementById('canvas');
    const r  = el.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    canvas.scrollBy({
      left: r.left - cr.left - cr.width  / 2 + r.width  / 2,
      top:  r.top  - cr.top  - cr.height / 2 + r.height / 2,
      behavior: 'smooth',
    });
  }

  function renderTray(d) {
    const chip = (id, kind) => {
      const it = byId.get(id);
      const label = it ? escapeHtml(it.title) : 'Unknown';
      return `<button class="chip ${kind}" data-jump="${id}"><span class="cid">${id}</span>${label}</button>`;
    };
    const list = (arr) =>
      arr && arr.length ? arr.map(escapeHtml).join(', ') : '<span class="empty">—</span>';
    const code = (arr) =>
      arr && arr.length
        ? arr.map(s => `<code>${escapeHtml(s)}</code>`).join(' ')
        : '<span class="empty">—</span>';

    const hard    = d.dependencies.hard   || [];
    const soft    = d.dependencies.soft   || [];

    // Calculate outputs: items that have d.id as a dependency
    const outputs = allItems
      .filter(item => item.id !== d.id && (
        (item.dependencies?.hard || []).includes(d.id) ||
        (item.dependencies?.soft || []).includes(d.id)
      ))
      .map(item => ({ id: item.id, kind: (item.dependencies?.hard || []).includes(d.id) ? 'hard' : 'soft' }));

    return `
      <section>
        <h3>Description</h3>
        <p>${escapeHtml(d.description || '')}</p>
      </section>

      <section>
        <h3>Inputs</h3>
        <div class="dep-group">
          <div class="dep-label">Required</div>
          <div class="chips">${hard.length ? hard.map(id => chip(id, 'hard')).join('') : '<span class="empty">None</span>'}</div>
        </div>
        <div class="dep-group">
          <div class="dep-label">Optional</div>
          <div class="chips">${soft.length ? soft.map(id => chip(id, 'soft')).join('') : '<span class="empty">None</span>'}</div>
        </div>
      </section>

      <section>
        <h3>Outputs</h3>
        <div class="chips">${outputs.length ? outputs.map(o => chip(o.id, o.kind)).join('') : '<span class="empty">None</span>'}</div>
      </section>

      <section>
        <h3>Owner (RACI)</h3>
        <dl class="kv">
          <dt>R</dt><dd>${list(d.owner?.R)}</dd>
          <dt>A</dt><dd>${list(d.owner?.A)}</dd>
          <dt>C</dt><dd>${list(d.owner?.C)}</dd>
          <dt>I</dt><dd>${list(d.owner?.I)}</dd>
        </dl>
      </section>

      <section>
        <h3>Audience</h3>
        <dl class="kv">
          <dt>Client</dt><dd>${list(d.clientAudience)}</dd>
          <dt>Internal</dt><dd>${list(d.internalReceiver)}</dd>
        </dl>
      </section>

      <section>
        <h3>Formats</h3>
        <dl class="kv">
          <dt>Working</dt><dd>${list(d.formats?.working)}</dd>
          <dt>Internal</dt><dd>${list(d.formats?.internal)}</dd>
          <dt>External</dt><dd>${list(d.formats?.external)}</dd>
        </dl>
      </section>

      <section>
        <h3>Git artifacts</h3>
        <dl class="kv">
          <dt>Consumes</dt><dd>${code(d.gitArtifacts?.consumes)}</dd>
          <dt>Produces</dt><dd>${code(d.gitArtifacts?.produces)}</dd>
        </dl>
      </section>

      ${(()=>{
        const lm = d.layerMap;
        if (!lm || (!lm.layer1?.length && !lm.layer2?.length && !lm.layer3?.length)) return '';
        const layerRow = (items, isCode) => items && items.length
          ? items.map(s => isCode
              ? `<code>${escapeHtml(s)}</code>`
              : `<span class="chip-layer">${escapeHtml(s)}</span>`
            ).join(' ')
          : '<span class="empty">—</span>';
        return `
        <section>
          <h3>Delivery Layers</h3>
          <dl class="kv">
            <dt>Layer 1</dt><dd>${layerRow(lm.layer1, true)}</dd>
            <dt>Layer 2</dt><dd>${layerRow(lm.layer2, false)}</dd>
            <dt>Layer 3</dt><dd>${layerRow(lm.layer3, false)}</dd>
          </dl>
        </section>`;
      })()}

      ${d.humanGate?.who ? `
      <section>
        <h3>Human Gate</h3>
        <dl class="kv">
          <dt>Who</dt><dd>${escapeHtml(d.humanGate.who)}</dd>
          <dt>Action</dt><dd>${escapeHtml(d.humanGate.action || '')}</dd>
          <dt>Trigger</dt><dd>${escapeHtml(d.humanGate.trigger || '')}</dd>
        </dl>
      </section>` : ''}

      ${d.skills?.length ? `
      <section>
        <h3>Skills</h3>
        <div class="chips">${d.skills.map(s =>
          `<span class="chip chip--static">${escapeHtml(s.name)}${s.command ? ` <code>${escapeHtml(s.command)}</code>` : ''}</span>`
        ).join('')}</div>
      </section>` : ''}

      ${d.aiGeneration ? `
      <section>
        <h3>AI generation</h3>
        <div class="markdown">${renderMd(d.aiGeneration)}</div>
      </section>` : ''}

      ${d.keyActivities ? `
      <section>
        <h3>Key activities</h3>
        <div class="markdown">${renderMd(d.keyActivities)}</div>
      </section>` : ''}

      ${d.structuralFramework ? `
      <section>
        <h3>Structural framework</h3>
        <div class="markdown">${renderMd(d.structuralFramework)}</div>
      </section>` : ''}
    `;
  }

  function escapeHtml(s) {
    if (s === undefined || s === null) return '';
    return String(s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
  }
  function renderMd(s) {
    let out = escapeHtml(s);
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\n/g, '<br>');
    return out;
  }

  // ───── Zoom toggle ─────
  const zoomBtn   = document.getElementById('zoomBtn');
  const zoomLabel = document.getElementById('zoomLabel');
  const zoomPlusV = document.getElementById('zoomPlusV');
  let zoomed = localStorage.getItem('delivmap-zoom') === '1';

  function applyZoom() {
    stageWrap.style.zoom = zoomed ? '0.5' : '1';
    zoomLabel.textContent = zoomed ? '50%' : '100%';
    zoomBtn.classList.toggle('zoomed', zoomed);
    zoomPlusV.style.display = zoomed ? '' : 'none';
    localStorage.setItem('delivmap-zoom', zoomed ? '1' : '0');
  }
  zoomBtn.addEventListener('click', () => { zoomed = !zoomed; applyZoom(); });
  applyZoom();

  // ───── Initial render ─────
  renderMap(allItems);
})();
