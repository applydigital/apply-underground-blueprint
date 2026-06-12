(async function(){
  const data = await (await fetch('data.json')).json();
  const items = data.deliverables;
  const byId = new Map(items.map(d => [d.id, d]));

  // ───── Layout ─────
  const TOTAL_COLS = 17;
  const COL_W = 160;     // column pitch
  const COL_GAP = 14;    // gap between adjacent columns (box width = 146px)
  const ROW_H = 104;     // row pitch
  const BOX_H = 84;
  const PAD_X = 40;

  // Phase separator gaps — ½ column pitch inserted at track boundaries
  const PHASE_GAP = Math.round(COL_W / 4); // 40px between col 4→5 and col 11→12
  function colToX(col) {
    let x = PAD_X + col * COL_W;
    if (col >= 5)  x += PHASE_GAP;
    if (col >= 12) x += PHASE_GAP;
    return x;
  }

  // Vertical rhythm — from top of stageWrap:
  const COL_IND_Y   = 8;   // col numbers sit here (above everything)
  const COL_IND_H   = 20;
  const PM_TRACK_PAD_TOP = 34; // inside PM bg, above first PM box (space for label)
  // PM track background starts at COL_IND_Y + COL_IND_H + 14 = 50
  const PM_TRACK_TOP = COL_IND_Y + COL_IND_H + 14;  // = 50

  const PM_GRID_GAP  = 52 + COL_GAP + PHASE_GAP - 32;  // row gap between track bgs = column gap between section bgs (~22px)
  const GRID_TRACK_TOP_PAD = 36; // space inside grid track bg above first grid box (for label)

  // Split rows: grid = rows 1-8 (collapsed), PM = rows 9-17 (fixed, never collapsed)
  const PM_MIN_ROW = 9;
  const PM_MAX_ROW = 17;
  const rowsUsed = new Set();
  items.forEach(d => { if (d.row) rowsUsed.add(d.row); });
  const sortedRows = [...rowsUsed].sort((a,b) => a - b);
  const gridRows = sortedRows.filter(r => r < PM_MIN_ROW);

  // Build rowY: grid rows first (collapsed), then PM rows (all slots, even if empty)
  const rowY = {};
  let y = PM_TRACK_TOP + PM_TRACK_PAD_TOP;
  gridRows.forEach(r => { rowY[r] = y; y += ROW_H; });
  
  const GRID_LAST_BOX_BOTTOM = gridRows.length ? (rowY[gridRows[gridRows.length - 1]] + BOX_H) : y;
  const PM_Y = GRID_LAST_BOX_BOTTOM + PM_GRID_GAP;
  
  for (let r = PM_MIN_ROW; r <= PM_MAX_ROW; r++) {
    rowY[r] = PM_Y + (r - PM_MIN_ROW) * ROW_H;
  }
  const PM_LAST_ROW_Y  = rowY[PM_MAX_ROW];
  const PM_LAST_BOX_BOTTOM = PM_LAST_ROW_Y + BOX_H;

  // All populated rows (for row indicators)
  const allRows = gridRows
    .concat([...Array(PM_MAX_ROW - PM_MIN_ROW + 1).keys()].map(i => i + PM_MIN_ROW));

  items.forEach(d => {
    const cols = d.cols || [0, 0];
    const colSpan = cols[1] - cols[0] + 1;
    d._x = colToX(cols[0]);
    d._w = colToX(cols[1]) - colToX(cols[0]) + (COL_W - COL_GAP);
    
    const row = d.row || 1;
    d._y = rowY[row] || rowY[1] || PM_Y;
  });

  // Total canvas
  const maxX = Math.max(...items.map(d => d._x + d._w)) + PAD_X;
  const maxY = Math.max(...items.map(d => d._y + BOX_H)) + 80;
  const stageWrap = document.getElementById('stageWrap');
  stageWrap.style.width = maxX + 'px';
  stageWrap.style.height = maxY + 'px';

  // ───── Column indicators — above all tracks ─────
  for (let col = 0; col < TOTAL_COLS; col++) {
    const x = colToX(col) + (COL_W - COL_GAP) / 2;
    const indicator = document.createElement('div');
    indicator.className = 'col-indicator';
    indicator.style.left = `${x}px`;
    indicator.style.top  = `${COL_IND_Y}px`;
    indicator.textContent = col;
    stageWrap.appendChild(indicator);
  }

  // ───── Row indicators — left side, outside any track ─────
  allRows.forEach(rowNum => {
    if (!rowY[rowNum]) return;
    const indicator = document.createElement('div');
    indicator.className = 'row-indicator';
    indicator.style.top = `${rowY[rowNum] + BOX_H/2}px`;
    indicator.textContent = rowNum;
    stageWrap.appendChild(indicator);
  });

  // ───── Track containers ─────
  // Fixed column-based phase bands
  const TRACKS = [
    { key: 'pm',    name: 'PM Track',              colStart: 0,  colEnd: 16, rowStart: 9,  rowEnd: 17 },
    { key: 'disc',  name: 'Discovery & Planning',  colStart: 0,  colEnd: 4,  rowStart: 1,  rowEnd: 8  },
    { key: 'des',   name: 'Design & Requirements', colStart: 5,  colEnd: 11, rowStart: 1,  rowEnd: 8  },
    { key: 'build', name: 'Build & Run',           colStart: 12, colEnd: 16, rowStart: 1,  rowEnd: 8  },
  ];
  const TRACK_PAD = { x: 16, bottom: 18, right: 16 };
  TRACKS.forEach(t => {
    const minX = colToX(t.colStart) - TRACK_PAD.x;
    const maxXt = colToX(t.colEnd) + (COL_W - COL_GAP) + TRACK_PAD.right;
    const trackRows = (t.key === 'pm')
      ? allRows.filter(r => r >= t.rowStart && r <= t.rowEnd)
      : gridRows.filter(r => r >= t.rowStart && r <= t.rowEnd);
    if (!trackRows.length && t.key !== 'pm') return;
    
    // PM track bg: fixed height covering all PM rows; grid tracks: collapsed
    const minY = t.key === 'pm'
      ? PM_Y - PM_TRACK_PAD_TOP
      : (trackRows[0] ? rowY[trackRows[0]] - GRID_TRACK_TOP_PAD : PM_TRACK_TOP);
    const maxYt = t.key === 'pm'
      ? PM_LAST_BOX_BOTTOM + TRACK_PAD.bottom
      : (trackRows.length ? rowY[trackRows[trackRows.length - 1]] + BOX_H + TRACK_PAD.bottom : PM_TRACK_TOP);
    
    const tr = document.createElement('div');
    tr.className = 'track t-' + t.key;
    tr.style.left = minX + 'px';
    tr.style.top = minY + 'px';
    tr.style.width = (maxXt - minX) + 'px';
    tr.style.height = (maxYt - minY) + 'px';
    stageWrap.insertBefore(tr, stageWrap.firstChild);
    const lbl = document.createElement('div');
    lbl.className = 'track-label';
    lbl.style.left = (minX + 14) + 'px';
    lbl.style.top = (minY + 12) + 'px';
    lbl.textContent = t.name;
    stageWrap.appendChild(lbl);
  });

  // ───── Boxes ─────
  const boxEls = new Map();
  items.forEach(d => {
    const el = document.createElement('div');
    el.className = 'box t-' + d.type;
    el.style.left = d._x + 'px';
    el.style.top = d._y + 'px';
    el.style.width = d._w + 'px';
    el.dataset.id = d.id;
    el.dataset.stage = d.stage;
    el.innerHTML = `
      <div class="row1">
        <span class="id">${d.id}</span>
        <span class="type-dot" title="${d.type}"></span>
      </div>
      <div class="title">${escapeHtml(d.title)}</div>
      <button class="details" data-action="details">Details →</button>
    `;
    stageWrap.appendChild(el);
    boxEls.set(d.id, el);
  });

  // ───── Lines ─────
  // Each item d depends on d.dependencies.hard (required, solid) and d.dependencies.soft (optional, dotted).
  // We draw an edge from the dependency (source) to d (target).
  const svg = document.getElementById('lines');
  svg.setAttribute('viewBox', `0 0 ${maxX} ${maxY}`);
  svg.style.width = maxX + 'px';
  svg.style.height = maxY + 'px';

  // Build edges
  const edges = [];
  items.forEach(d => {
    (d.dependencies.hard || []).forEach(srcId => {
      if (byId.has(srcId)) edges.push({ src: srcId, tgt: d.id, kind: 'hard' });
    });
    (d.dependencies.soft || []).forEach(srcId => {
      if (byId.has(srcId)) edges.push({ src: srcId, tgt: d.id, kind: 'soft' });
    });
  });

  // Adjacency for highlighting
  const inboundOf = new Map();  // id -> [{src, kind}]
  const outboundOf = new Map(); // id -> [{tgt, kind}]
  edges.forEach(e => {
    if (!inboundOf.has(e.tgt)) inboundOf.set(e.tgt, []);
    if (!outboundOf.has(e.src)) outboundOf.set(e.src, []);
    inboundOf.get(e.tgt).push(e);
    outboundOf.get(e.src).push(e);
  });

  // Draw paths
  const pathEls = [];
  edges.forEach((e, i) => {
    const s = byId.get(e.src);
    const t = byId.get(e.tgt);
    const { sx, sy, tx, ty } = anchors(s, t);
    const d = bezier(sx, sy, tx, ty);
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('marker-end', 'url(#arrow-default)');
    if (e.kind === 'soft') path.classList.add('soft');
    path.dataset.src = e.src;
    path.dataset.tgt = e.tgt;
    svg.appendChild(path);
    pathEls.push(path);
    e._el = path;
    e._i  = i;
  });

  function anchors(s, t) {
    const sCx = s._x + s._w / 2;
    const tCx = t._x + t._w / 2;
    const sCy = s._y + BOX_H / 2;
    const tCy = t._y + BOX_H / 2;
    // Choose horizontal anchors if mostly horizontal flow, else vertical
    const dx = Math.abs(tCx - sCx);
    const dy = Math.abs(tCy - sCy);
    let sx, sy, tx, ty;
    if (dx >= dy) {
      // horizontal-ish
      if (tCx >= sCx) {
        sx = s._x + s._w; sy = sCy;
        tx = t._x;        ty = tCy;
      } else {
        sx = s._x;        sy = sCy;
        tx = t._x + t._w; ty = tCy;
      }
    } else {
      // vertical-ish
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
    // Cubic with control points pushed in the dominant direction
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
  const selected = new Set();
  function toggle(id) {
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    render();
  }
  function clearSel() {
    selected.clear();
    render();
  }
  // Priority: direct beats transitive; if a node/edge qualifies as both
  // input-side AND output-side, we keep the strongest tag.
  const ROLE_RANK = { 'in': 4, 'out': 3, 'in-t': 2 };
  function bumpRole(map, key, role) {
    const cur = map.get(key);
    if (!cur || ROLE_RANK[role] > ROLE_RANK[cur]) map.set(key, role);
  }

  function computeRoles() {
    const nodeRole = new Map();   // id -> role
    const edgeRole = new Map();   // edge index -> role

    // BFS backward from each selected node:
    //   - depth 1 (direct inputs):    include BOTH hard and soft  → 'in'
    //   - depth ≥ 2 (transitive):     HARD only                   → 'in-t'
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
            if (depth > 1 && e.kind !== 'hard') return; // transitive walks hard only
            bumpRole(edgeRole, e._i, role);
            if (!visited.has(e.src)) {
              visited.add(e.src);
              if (!selected.has(e.src)) bumpRole(nodeRole, e.src, role);
              next.push(e.src);
            }
          });
        });
        frontier = next;
      }
    });

    // Forward: DIRECT only, include BOTH hard and soft. No transitive downstream.
    selected.forEach(seed => {
      (outboundOf.get(seed) || []).forEach(e => {
        bumpRole(edgeRole, e._i, 'out');
        if (!selected.has(e.tgt)) bumpRole(nodeRole, e.tgt, 'out');
      });
    });

    return { nodeRole, edgeRole };
  }

  function render() {
    document.body.classList.toggle('has-sel', selected.size > 0);
    document.getElementById('clear').disabled = selected.size === 0;
    document.getElementById('selcount').textContent = selected.size > 0 ? `${selected.size} selected` : '';

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

  // ───── Events ─────
  stageWrap.addEventListener('click', (ev) => {
    const box = ev.target.closest('.box');
    if (!box) return;
    if (ev.target.closest('[data-action="details"]')) {
      openTray(box.dataset.id);
      return;
    }
    toggle(box.dataset.id);
  });
  document.getElementById('clear').addEventListener('click', clearSel);

  // ───── Tray ─────
  const tray = document.getElementById('tray');
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

  // Click a chip in the tray → close tray, select that id, scroll to it
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
    const r = el.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    canvas.scrollBy({
      left: r.left - cr.left - cr.width / 2 + r.width / 2,
      top: r.top - cr.top - cr.height / 2 + r.height / 2,
      behavior: 'smooth'
    });
  }

  function renderTray(d) {
    const chip = (id, kind) => {
      const it = byId.get(id);
      const label = it ? escapeHtml(it.title) : 'Unknown';
      return `<button class="chip ${kind}" data-jump="${id}"><span class="cid">${id}</span>${label}</button>`;
    };
    const list = (arr) => arr && arr.length ? arr.map(escapeHtml).join(', ') : '<span class="empty">—</span>';
    const code = (arr) => arr && arr.length ? arr.map(s => `<code>${escapeHtml(s)}</code>`).join(' ') : '<span class="empty">—</span>';

    const hard = (d.dependencies.hard || []);
    const soft = (d.dependencies.soft || []);
    const enables = (d.enables || []);

    return `
      <section>
        <h3>Description</h3>
        <p>${escapeHtml(d.description || '')}</p>
      </section>

      <section>
        <h3>Dependencies</h3>
        <div class="dep-group">
          <div class="dep-label">Required</div>
          <div class="chips">${hard.length ? hard.map(id=>chip(id,'hard')).join('') : '<span class="empty">None</span>'}</div>
        </div>
        <div class="dep-group">
          <div class="dep-label">Optional</div>
          <div class="chips">${soft.length ? soft.map(id=>chip(id,'soft')).join('') : '<span class="empty">None</span>'}</div>
        </div>
      </section>

      <section>
        <h3>Enables</h3>
        <div class="chips">${enables.length ? enables.map(id=>chip(id,'hard')).join('') : '<span class="empty">None</span>'}</div>
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
          ? items.map(s => isCode ? `<code>${escapeHtml(s)}</code>` : `<span class="chip-layer">${escapeHtml(s)}</span>`).join(' ')
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
        <div class="chips">${d.skills.map(s => `<span class="chip chip--static">${escapeHtml(s.name)}${s.command ? ` <code>${escapeHtml(s.command)}</code>` : ''}</span>`).join('')}</div>
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
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function renderMd(s) {
    // very small markdown: **bold**, `code`, preserve line breaks
    let out = escapeHtml(s);
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
    out = out.replace(/\n/g, '<br>');
    return out;
  }

  // ───── Zoom toggle ─────
  const zoomBtn = document.getElementById('zoomBtn');
  const zoomLabel = document.getElementById('zoomLabel');
  const zoomPlusV = document.getElementById('zoomPlusV');
  let zoomed = localStorage.getItem('delivmap-zoom') === '1';

  function applyZoom() {
    stageWrap.style.zoom = zoomed ? '0.5' : '1';
    zoomLabel.textContent = zoomed ? '50%' : '100%';
    zoomBtn.classList.toggle('zoomed', zoomed);
    // + when zoomed out (can zoom in), − when at full (can zoom out)
    zoomPlusV.style.display = zoomed ? '' : 'none';
    localStorage.setItem('delivmap-zoom', zoomed ? '1' : '0');
  }

  zoomBtn.addEventListener('click', () => {
    zoomed = !zoomed;
    applyZoom();
  });

  applyZoom();

  render();
})();
