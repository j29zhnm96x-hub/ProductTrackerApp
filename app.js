(function () {
  'use strict';

  /* ===================================================================
   *  STAND TRACKER PWA — app.js
   *  Murano glass jewelry stand: ULAZ (production) / OTPIS (write-off)
   *  localStorage key: stand-tracker-data
   * =================================================================== */

  // --------------- DOM REFERENCES ---------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    appHome:      $('#app-home'),
    appCategories:$('#app-categories'),
    appVariants:  $('#app-variants'),
    appHistory:   $('#app-history'),
    appAdmin:     $('#app-admin'),
    homeBtnUlaz:  $('#home-btn-ulaz'),
    homeBtnOtpis: $('#home-btn-otpis'),
    navHistory:   $('#nav-history'),
    navAdmin:     $('#nav-admin'),
    navShare:     $('#nav-share'),
    catBack:      $('#cat-back'),
    varBack:      $('#var-back'),
    histBack:     $('#hist-back'),
    adminBack:    $('#admin-back'),
    catTitle:     $('#cat-title'),
    varTitle:     $('#var-title'),
    varSubtitle:  $('#var-subtitle'),
    catGrid:      $('#cat-grid'),
    varGrid:      $('#var-grid'),
    histList:     $('#hist-list'),
    catEmpty:     $('#cat-empty'),
    histEmpty:    $('#hist-empty'),
    adminCatList: $('#admin-cat-list'),
    adminAddCat:  $('#admin-add-cat-btn'),
    catAddBtn:    $('#cat-add-btn'),
    varAddBtn:    $('#var-add-btn'),
    currentDate:  $('#current-date'),
    allViews:     $$('.view'),
    // Settings view
    setBack:       $('#set-back'),
    setCheckUpdate: $('#set-check-update'),
    setExport:     $('#set-export'),
    setImport:     $('#set-import'),
    setUpdateStatus: $('#set-update-status'),
    setDataStatus: $('#set-data-status'),
    homeBtnSettings: $('#home-btn-settings'),
  };

  // --------------- STORAGE KEY ---------------
  const STORAGE_KEY = 'stand-tracker-data';
  const VERSION = '1.0.17';

  // --------------- STATE ---------------
  let data = null;
  let currentView = 'home';
  let currentType = 'ulaz';    // 'ulaz' | 'otpis'
  let currentCategoryId = null;
  let viewStack = [];          // for back navigation
  let expandedCats = new Set(); // track which admin cards are expanded
  let swRegistration = null;  // service worker registration ref

  // --------------- DEFAULT DATA ---------------
  function defaultData() {
    return {
      categories: [],
      currentSession: {
        date: getToday(),
        items: [],
      },
      history: [],
    };
  }

  /* ===================================================================
   *  DATA MANAGEMENT
   * =================================================================== */

  /** Load data from localStorage. Returns default structure if empty or corrupted. */
  function loadData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      const parsed = JSON.parse(raw);
      // Ensure minimum structure
      parsed.categories = parsed.categories || [];
      parsed.currentSession = parsed.currentSession || { date: getToday(), items: [] };
      parsed.history = parsed.history || [];
      return parsed;
    } catch (e) {
      console.error('Greška pri učitavanju podataka:', e);
      return defaultData();
    }
  }

  /** Persist data object to localStorage. */
  function saveData(d) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
    } catch (e) {
      console.error('Greška pri spremanju podataka:', e);
    }
  }

  /** Return today's date as YYYY-MM-DD. */
  function getToday() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** Generate a simple unique ID with a prefix. */
  function uid(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  // --------------- FIND HELPERS ---------------

  function findCategory(catId) {
    return data.categories.find((c) => c.id === catId);
  }

  function findVariant(catId, varId) {
    const cat = findCategory(catId);
    return cat ? cat.variants.find((v) => v.id === varId) : null;
  }

  function findItem(catId, varId, type) {
    return data.currentSession.items.find(
      (i) => i.categoryId === catId && i.variantId === varId && i.type === type
    );
  }

  // --------------- CRUD OPERATIONS ---------------

  /** Return current session items filtered by type. */
  function getCurrentItems(type) {
    if (!type) return data.currentSession.items;
    return data.currentSession.items.filter((i) => i.type === type);
  }

  /** Return quantity for a specific item, 0 if not found. */
  function getItemQuantity(categoryId, variantId, type) {
    const item = findItem(categoryId, variantId, type);
    return item ? item.quantity : 0;
  }

  /** Add or subtract quantity (min 0). Remove item if quantity reaches 0.
   *  Automatically nets ULAZ and OTPIS for the same product. */
  function updateQuantity(categoryId, variantId, type, delta) {
    let item = findItem(categoryId, variantId, type);

    if (!item) {
      if (delta <= 0) return 0; // nothing to decrement
      item = { categoryId, variantId, type, quantity: 0 };
      data.currentSession.items.push(item);
    }

    item.quantity += delta;
    if (item.quantity < 0) item.quantity = 0;

    if (item.quantity === 0) {
      data.currentSession.items = data.currentSession.items.filter(
        (i) => !(i.categoryId === categoryId && i.variantId === variantId && i.type === type)
      );
    }

    // Net ULAZ vs OTPIS — keep only the larger side
    const otherType = type === 'ulaz' ? 'otpis' : 'ulaz';
    const other = findItem(categoryId, variantId, otherType);
    if (other && item.quantity > 0) {
      const net = item.quantity - other.quantity;
      if (net > 0) {
        item.quantity = net;
        data.currentSession.items = data.currentSession.items.filter(
          (i) => !(i.categoryId === categoryId && i.variantId === variantId && i.type === otherType)
        );
      } else if (net < 0) {
        other.quantity = -net;
        data.currentSession.items = data.currentSession.items.filter(
          (i) => !(i.categoryId === categoryId && i.variantId === variantId && i.type === type)
        );
      } else {
        // net === 0 — remove both
        data.currentSession.items = data.currentSession.items.filter(
          (i) => !(i.categoryId === categoryId && i.variantId === variantId)
        );
      }
    }

    saveData(data);
    return item.quantity > 0 ? item.quantity : (other ? other.quantity : 0);
  }

  /** Sum all variant quantities for a category+type combo. */
  function getCategoryTotal(categoryId, type) {
    return data.currentSession.items
      .filter((i) => i.categoryId === categoryId && i.type === type)
      .reduce((sum, i) => sum + i.quantity, 0);
  }

  /** Add a new category with empty variants array. */
  function addCategory(name) {
    const cat = {
      id: uid('cat'),
      name: name.trim(),
      variants: [],
    };
    data.categories.push(cat);
    saveData(data);
    return cat;
  }

  /** Add a variant to an existing category. */
  function addVariant(categoryId, code) {
    const cat = findCategory(categoryId);
    if (!cat) return null;
    const v = { id: uid('var'), code: String(code).trim() };
    cat.variants.push(v);
    saveData(data);
    return v;
  }

  /** Remove a category by ID. */
  function deleteCategory(categoryId) {
    data.categories = data.categories.filter((c) => c.id !== categoryId);
    // Also clean up any currentSession items for this category
    data.currentSession.items = data.currentSession.items.filter(
      (i) => i.categoryId !== categoryId
    );
    saveData(data);
  }

  /** Remove a variant by categoryId and variantId. */
  function deleteVariant(categoryId, variantId) {
    const cat = findCategory(categoryId);
    if (!cat) return;
    cat.variants = cat.variants.filter((v) => v.id !== variantId);
    // Clean up currentSession items for this variant
    data.currentSession.items = data.currentSession.items.filter(
      (i) => !(i.categoryId === categoryId && i.variantId === variantId)
    );
    saveData(data);
  }

  /** Rename a category. */
  function updateCategoryName(categoryId, newName) {
    const cat = findCategory(categoryId);
    if (!cat) return;
    cat.name = newName.trim();
    saveData(data);
  }

  /** Update variant code. */
  function updateVariantCode(categoryId, variantId, newCode) {
    const v = findVariant(categoryId, variantId);
    if (!v) return;
    v.code = String(newCode).trim();
    saveData(data);
  }

  /** Move a variant up or down within its category. */
  function moveVariant(categoryId, variantId, direction) {
    const cat = findCategory(categoryId);
    if (!cat) return;
    const idx = cat.variants.findIndex(v => v.id === variantId);
    if (idx === -1) return;
    if (direction === 'up' && idx > 0) {
      [cat.variants[idx - 1], cat.variants[idx]] = [cat.variants[idx], cat.variants[idx - 1]];
    } else if (direction === 'down' && idx < cat.variants.length - 1) {
      [cat.variants[idx], cat.variants[idx + 1]] = [cat.variants[idx + 1], cat.variants[idx]];
    }
    saveData(data);
  }

  /* ===================================================================
   *  NAVIGATION / ROUTING
   * =================================================================== */

  /** Show a view by its section ID, hiding all others. */
  function showView(viewId) {
    dom.allViews.forEach((v) => v.classList.remove('view--active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('view--active');
    currentView = viewId.replace('app-', '');
  }

  function pushView(viewId) {
    viewStack.push(currentView);
    showView(viewId);
  }

  function popView() {
    const prev = viewStack.pop() || 'home';
    showView('app-' + prev);
  }

  function goHome() {
    viewStack = [];
    updateDate();
    renderHome();
    showView('app-home');
  }

  function goCategories(type) {
    currentType = type;
    currentCategoryId = null;
    pushView('app-categories');
    renderCategories(type);
  }

  function goVariants(categoryId) {
    currentCategoryId = categoryId;
    const cat = findCategory(categoryId);
    if (cat) {
      dom.varTitle.textContent = cat.name;
    }
    dom.varSubtitle.textContent = currentType === 'ulaz' ? 'ULAZ' : 'OTPIS';
    pushView('app-variants');
    renderVariants(categoryId);
  }

  function goHistory() {
    pushView('app-history');
    renderHistory();
  }

  function goAdmin() {
    pushView('app-admin');
    renderAdmin();
  }

  function goSettings() {
    pushView('app-settings');
    dom.setUpdateStatus.textContent = '';
    dom.setDataStatus.textContent = '';
  }

  /* ===================================================================
   *  UI RENDERING
   * =================================================================== */

  // --------------- HOME ---------------
  function renderHome() {
    updateDate();
    const hasItems = data.currentSession.items.length > 0;
    dom.navShare.disabled = !hasItems;
  }

  function updateDate() {
    const today = getToday();
    const [y, m, d] = today.split('-');
    dom.currentDate.textContent = `${d}.${m}.${y}.`;
  }

  // --------------- CATEGORIES ---------------
  function renderCategories(type) {
    dom.catTitle.textContent = type === 'ulaz' ? 'ULAZ — Proizvodi' : 'OTPIS — Proizvodi';
    dom.catGrid.innerHTML = '';

    if (data.categories.length === 0) {
      dom.catEmpty.style.display = 'block';
      dom.catGrid.style.display = 'none';
    } else {
      dom.catEmpty.style.display = 'none';
      dom.catGrid.style.display = '';
    }

    data.categories.forEach((cat) => {
      const total = getCategoryTotal(cat.id, type);
      const card = document.createElement('button');
      card.className = 'card card--category' + (total > 0 ? ' card--has-items' : '');
      card.dataset.categoryId = cat.id;

      card.innerHTML =
        `<span class="category-card-name">${escHtml(cat.name)}</span>` +
        (total > 0 ? `<span class="badge">${total}</span>` : '');

      card.addEventListener('click', () => goVariants(cat.id));
      dom.catGrid.appendChild(card);
    });

    // Show/hide quick-add button
    dom.catAddBtn.style.display = 'block';
  }

  // --------------- VARIANTS ---------------
  function renderVariants(categoryId, pulseVariantId) {
    const cat = findCategory(categoryId);
    if (!cat) return;

    dom.varTitle.textContent = cat.name;
    dom.varSubtitle.textContent = currentType === 'ulaz' ? 'ULAZ' : 'OTPIS';
    dom.varGrid.innerHTML = '';

    if (cat.variants.length === 0) {
      dom.varGrid.innerHTML =
        '<p class="empty-state">Nema proizvoda za ovu kategoriju.</p>';
    }

    cat.variants.forEach((v) => {
      const qty = getItemQuantity(categoryId, v.id, currentType);
      const code = getVariantLabel(v);
      const pulseClass = (v.id === pulseVariantId) ? ' counter--pulse' : '';
      const card = document.createElement('div');
      card.className = 'card card--variant' + (qty > 0 ? ' card--has-items' : '');
      card.dataset.categoryId = categoryId;
      card.dataset.variantId = v.id;

      card.innerHTML =
        `<div class="variant-row">` +
          `<div class="variant-row__text">` +
            `<div class="variant-row__title">` +
              `<span class="variant-row__name">${escHtml(cat.name)}</span>` +
              `<span class="variant-row__code">${escHtml(code)}</span>` +
              (qty > 0
                ? `<span class="variant-row__qty${pulseClass}">×${qty}</span>`
                : '') +
            `</div>` +
          `</div>` +
          `<div class="variant-row__actions">` +
            (qty > 0
              ? `<button type="button" class="var-btn var-btn--minus btn--counter-minus" data-category-id="${categoryId}" data-variant-id="${v.id}" data-type="${currentType}" aria-label="Smanji">−</button>`
              : '') +
            `<button type="button" class="var-btn var-btn--plus btn--counter-plus" data-category-id="${categoryId}" data-variant-id="${v.id}" data-type="${currentType}" aria-label="Dodaj">+</button>` +
          `</div>` +
        `</div>`;

      dom.varGrid.appendChild(card);
    });

    dom.varAddBtn.style.display = 'block';
  }

  /** Get display label for a variant (code or legacy price). */
  function getVariantLabel(v) {
    if (v.code !== undefined) return v.code;
    // Legacy data with price field
    if (v.price !== undefined) return String(v.price);
    return '?';
  }

  // --------------- HISTORY ---------------
  function renderHistory() {
    dom.histList.innerHTML = '';

    if (data.history.length === 0) {
      dom.histEmpty.style.display = 'block';
      return;
    }
    dom.histEmpty.style.display = 'none';

    // Sort newest first
    const sorted = [...data.history].sort((a, b) => b.sentAt - a.sentAt);

    sorted.forEach((session) => {
      const ulazTotal = session.items
        .filter((i) => i.type === 'ulaz')
        .reduce((s, i) => s + i.quantity, 0);
      const otpisTotal = session.items
        .filter((i) => i.type === 'otpis')
        .reduce((s, i) => s + i.quantity, 0);

      const card = document.createElement('div');
      card.className = 'card card--history';
      card.dataset.expanded = 'false';

      const dateFormatted = formatDate(session.date);
      const timeFormatted = session.sentAt
        ? new Date(session.sentAt).toLocaleTimeString('hr-HR', { hour: '2-digit', minute: '2-digit' })
        : '';

      card.innerHTML =
        `<div class="history-summary">` +
          `<span class="history-date">${dateFormatted} ${timeFormatted}</span>` +
          `<span class="history-totals">ULAZ: ${ulazTotal} | OTPIS: ${otpisTotal}</span>` +
        `</div>` +
        `<div class="history-detail" style="display:none;"></div>`;

      card.querySelector('.history-summary').addEventListener('click', () => {
        const expanded = card.dataset.expanded === 'true';
        if (expanded) {
          card.dataset.expanded = 'false';
          card.querySelector('.history-detail').style.display = 'none';
        } else {
          card.dataset.expanded = 'true';
          const detail = card.querySelector('.history-detail');
          detail.innerHTML = buildHistoryDetail(session);
          detail.style.display = 'block';
        }
      });

      dom.histList.appendChild(card);
    });
  }

  function buildHistoryDetail(session) {
    return '<pre>' + escHtml(buildReportText(session.items)) + '</pre>';
  }

  /** Format a YYYY-MM-DD date as DD.MM.YYYY. */
  function formatDate(dateStr) {
    const [y, m, d] = dateStr.split('-');
    return `${d}.${m}.${y}.`;
  }

  // --------------- REPORT TEXT BUILDER ---------------
  function buildReportText(items) {
    const ulazItems = items.filter((i) => i.type === 'ulaz');
    const otpisItems = items.filter((i) => i.type === 'otpis');

    let lines = [];

    if (ulazItems.length > 0) {
      lines.push('ULAZ (proizvedeno):');
      lines.push(...buildTypeLines(ulazItems));
    }

    if (otpisItems.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('OTPIS (razbijeno/poklonjeno):');
      lines.push(...buildTypeLines(otpisItems));
    }

    return lines.join('\n');
  }

  /** Build per-category lines for a group of items. */
  function buildTypeLines(items) {
    // Group by categoryId
    const grouped = {};
    items.forEach((i) => {
      if (!grouped[i.categoryId]) grouped[i.categoryId] = [];
      grouped[i.categoryId].push(i);
    });

    const lines = [];
    Object.keys(grouped).forEach((catId) => {
      const cat = findCategory(catId);
      const catName = cat ? cat.name : 'Nepoznato';
      grouped[catId].forEach((item) => {
        const v = findVariant(catId, item.variantId);
        const codeLabel = v ? getVariantLabel(v) : '?';
        lines.push(`${catName} ${codeLabel}: ${item.quantity} kom`);
      });
    });
    return lines;
  }

  /** Build the full report with header. */
  function buildFullReport() {
    const today = getToday();
    const [y, m, d] = today.split('-');
    const dateStr = `${d}.${m}.${y}.`;
    const body = buildReportText(data.currentSession.items);
    if (!body) return `Stand Tracker — ${dateStr}\n\nNema stavki.`;
    return `Stand Tracker — ${dateStr}\n\n${body}`;
  }

  // --------------- ADMIN ---------------
  function renderAdmin() {
    dom.adminCatList.innerHTML = '';

    if (data.categories.length === 0) {
      dom.adminCatList.innerHTML =
        '<p class="empty-state">Nema kategorija. Dodajte prvu kategoriju.</p>';
      return;
    }

    data.categories.forEach((cat) => {
      const card = document.createElement('div');
      card.className = 'card card--admin';
      card.dataset.catId = cat.id;

      const variantCount = cat.variants.length;
      
      // Variant rows (drag handle + code + edit + delete)
      const variantRows = cat.variants
        .map((v, idx) => {
          const code = getVariantLabel(v);
          return (
            `<div class="admin-var-row" data-idx="${idx}" data-category-id="${cat.id}" data-variant-id="${v.id}">` +
              `<span class="drag-handle" data-category-id="${cat.id}" data-variant-id="${v.id}" data-idx="${idx}">⋮⋮</span>` +
              `<span class="admin-var-code">${escHtml(code)}</span>` +
              `<button class="btn-icon-arrow admin-var-edit" data-category-id="${cat.id}" data-variant-id="${v.id}" aria-label="Uredi">✎</button>` +
              `<button class="btn-icon-arrow admin-var-delete" data-category-id="${cat.id}" data-variant-id="${v.id}" aria-label="Obriši">×</button>` +
            `</div>`
          );
        })
        .join('');

      const isExpanded = expandedCats.has(cat.id);
      const bodyStyle = isExpanded ? '' : 'display:none;';

      const headerHtml =
        `<div class="admin-cat-summary">` +
          `<span class="admin-cat-name">${escHtml(cat.name)}</span>` +
          `<span class="admin-cat-count">${variantCount} proizvoda</span>` +
          `<span class="admin-cat-spacer"></span>` +
          `<button class="btn-icon-arrow admin-cat-rename admin-cat-icon" data-category-id="${cat.id}" aria-label="Preimenuj">✎</button>` +
          `<button class="btn-icon-arrow admin-cat-delete admin-cat-icon" data-category-id="${cat.id}" aria-label="Obriši">×</button>` +
        `</div>`;

      const bodyHtml =
        `<div class="admin-cat-body" style="${bodyStyle}">` +
          (variantRows
            ? `<div class="admin-var-list">${variantRows}</div>`
            : '<span class="admin-no-variants">Nema proizvoda</span>') +
          `<div class="admin-cat-actions">` +
            `<button class="btn btn--ghost admin-cat-add-variant" data-category-id="${cat.id}" aria-label="Dodaj šifru">+ Proizvod</button>` +
          `</div>` +
        `</div>`;

      card.innerHTML = headerHtml + bodyHtml;

      card.querySelector('.admin-cat-summary').addEventListener('click', (e) => {
        // Don't toggle if clicking on action buttons
        if (e.target.closest('.admin-cat-rename, .admin-cat-delete')) return;
        
        const body = card.querySelector('.admin-cat-body');
        const expanded = body.style.display !== 'none';
        if (expanded) {
          body.style.display = 'none';
          expandedCats.delete(cat.id);
        } else {
          body.style.display = 'block';
          expandedCats.add(cat.id);
        }
      });

      dom.adminCatList.appendChild(card);
    });

    // Init drag-and-drop on variant rows
    initDragDrop();
  }

  function bindAdminEvents() {
    dom.adminCatList.addEventListener('click', (e) => {
      const target = e.target;

      // Delete variant (X button)
      if (target.classList.contains('admin-var-delete')) {
        const catId = target.dataset.categoryId;
        const varId = target.dataset.variantId;
        if (confirm('Obrisati ovu šifru?')) {
          deleteVariant(catId, varId);
          renderAdmin();
        }
        return;
      }

      // Rename category
      if (target.classList.contains('admin-cat-rename')) {
        const catId = target.dataset.categoryId;
        const cat = findCategory(catId);
        const newName = prompt('Novi naziv kategorije:', cat ? cat.name : '');
        if (newName && newName.trim()) {
          updateCategoryName(catId, newName);
          renderAdmin();
        }
        return;
      }

      // Add variant to category
      if (target.classList.contains('admin-cat-add-variant')) {
        const catId = target.dataset.categoryId;
        const code = prompt('Šifra (npr. 06):', '');
        if (code && code.trim()) {
          addVariant(catId, code.trim());
          renderAdmin();
        }
        return;
      }

      // Delete category
      if (target.classList.contains('admin-cat-delete')) {
        const catId = target.dataset.categoryId;
        const cat = findCategory(catId);
        if (confirm(`Obrisati kategoriju "${cat ? cat.name : ''}" i sve njene šifre?`)) {
          deleteCategory(catId);
          renderAdmin();
        }
        return;
      }

      // Edit variant code (edit button)
      if (target.classList.contains('admin-var-edit')) {
        const catId = target.dataset.categoryId;
        const varId = target.dataset.variantId;
        const v = findVariant(catId, varId);
        const newCode = prompt('Nova šifra:', v ? getVariantLabel(v) : '');
        if (newCode && newCode.trim()) {
          updateVariantCode(catId, varId, newCode.trim());
          renderAdmin();
        }
        return;
      }

      // Edit variant code (click on the code text — REMOVED, use edit button instead)
      // No-op: clicking the code does nothing now
    });
  }

  // -------- DRAG-AND-DROP REORDER --------
  let dragCatId = null;
  let dragFromIdx = -1;
  let dragToIdx = -1;
  let dragStartY = 0;
  let dragRows = [];
  let dragRowHeights = [];

  function initDragDrop() {
    const handles = dom.adminCatList.querySelectorAll('.drag-handle');
    handles.forEach((handle) => {
      handle.removeEventListener('touchstart', onDragStart);
      handle.addEventListener('touchstart', onDragStart, { passive: false });
      handle.removeEventListener('mousedown', onDragStart);
      handle.addEventListener('mousedown', onDragStart);
    });
  }

  function onDragStart(e) {
    const handle = e.target.closest('.drag-handle');
    if (!handle) return;
    e.preventDefault();

    const row = handle.closest('.admin-var-row');
    if (!row) return;

    const list = row.closest('.admin-var-list');
    if (!list) return;

    dragCatId = handle.dataset.categoryId;
    dragFromIdx = parseInt(row.dataset.idx);
    dragToIdx = dragFromIdx;
    dragStartY = e.touches ? e.touches[0].clientY : e.clientY;
    dragRows = Array.from(list.querySelectorAll('.admin-var-row'));
    dragRowHeights = dragRows.map(r => r.getBoundingClientRect().height);

    row.classList.add('dragging');

    if (e.touches) {
      document.addEventListener('touchmove', onDragMove, { passive: false });
      document.addEventListener('touchend', onDragEnd, { once: true });
    } else {
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragEnd, { once: true });
    }
  }

  function onDragMove(e) {
    e.preventDefault();
    const y = e.touches ? e.touches[0].clientY : e.clientY;
    const deltaY = y - dragStartY;

    // Find target index based on cumulative heights
    let cum = 0;
    let targetIdx = 0;
    for (let i = 0; i < dragRowHeights.length; i++) {
      cum += dragRowHeights[i];
      if (deltaY < cum) {
        targetIdx = i;
        break;
      }
      targetIdx = i + 1;
    }
    targetIdx = Math.max(0, Math.min(dragRows.length - 1, targetIdx));

    if (targetIdx !== dragToIdx) {
      // Remove old indicators
      dragRows.forEach(r => r.classList.remove('drag-above', 'drag-below'));
      dragToIdx = targetIdx;

      if (targetIdx < dragFromIdx) {
        dragRows[targetIdx].classList.add('drag-above');
      } else if (targetIdx > dragFromIdx) {
        dragRows[targetIdx].classList.add('drag-below');
      }
    }
  }

  function onDragEnd() {
    document.removeEventListener('touchmove', onDragMove);
    document.removeEventListener('mousemove', onDragMove);

    dragRows.forEach(r => r.classList.remove('dragging', 'drag-above', 'drag-below'));

    if (dragToIdx !== dragFromIdx && dragCatId) {
      // Perform the move: shift the variant in the array
      const cat = findCategory(dragCatId);
      if (cat) {
        const item = cat.variants.splice(dragFromIdx, 1)[0];
        cat.variants.splice(dragToIdx, 0, item);
        saveData(data);
      }
      renderAdmin();
      return;
    }

    dragCatId = null;
    dragFromIdx = -1;
    dragToIdx = -1;
  }

  /* ===================================================================
   *  COUNTER LOGIC
   * =================================================================== */

  function handleCounterClick(e) {
    const btn = e.target;
    if (!btn.classList.contains('btn--counter-plus') && !btn.classList.contains('btn--counter-minus')) return;

    const catId = btn.dataset.categoryId;
    const varId = btn.dataset.variantId;
    const type = btn.dataset.type;
    const delta = btn.classList.contains('btn--counter-plus') ? 1 : -1;

    updateQuantity(catId, varId, type, delta);

    // Re-render to handle counter show/hide and pulse animation
    renderVariants(catId, varId);
    updateCategoryBadge(catId, type);
  }

  function updateCategoryBadge(categoryId, type) {
    // Update badge on the category view grid if visible
    const catCard = dom.catGrid.querySelector(`[data-category-id="${categoryId}"]`);
    if (!catCard) return;

    const total = getCategoryTotal(categoryId, type);
    const existingBadge = catCard.querySelector('.badge');

    if (total > 0) {
      catCard.classList.add('card--has-items');
      if (existingBadge) {
        existingBadge.textContent = total;
      } else {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.textContent = total;
        catCard.appendChild(badge);
      }
    } else {
      catCard.classList.remove('card--has-items');
      if (existingBadge) existingBadge.remove();
    }
  }

  // Delegate clicks on the variant grid: counter buttons only
  dom.varGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn--counter-plus, .btn--counter-minus');
    if (btn) {
      handleCounterClick(e);
    }
  });

  /* ===================================================================
   *  SHARE & RESET ("Pošalji i zaključi")
   * =================================================================== */

  async function shareAndReset() {
    if (data.currentSession.items.length === 0) {
      alert('Nema stavki za slanje.');
      return;
    }

    const reportText = buildFullReport();

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Stand Tracker',
          text: reportText,
        });
      } else {
        // Fallback: copy to clipboard
        await navigator.clipboard.writeText(reportText);
        alert('Tekst kopiran u međuspremnik. Web Share API nije dostupan.');
      }

      // Move current session to history
      const historyEntry = {
        date: data.currentSession.date,
        sentAt: Date.now(),
        items: [...data.currentSession.items],
      };
      data.history.push(historyEntry);

      // Reset session
      data.currentSession = {
        date: getToday(),
        items: [],
      };
      saveData(data);

      // Navigate home and confirm
      goHome();
      renderHome();

      // Brief confirmation — let the home view speak for itself
      showBriefConfirmation();
    } catch (err) {
      // User cancelled share — don't reset
      if (err.name !== 'AbortError') {
        console.error('Greška pri dijeljenju:', err);
        alert('Greška pri slanju. Pokušajte ponovo.');
      }
    }
  }

  function showBriefConfirmation() {
    // Add a temporary success flash on the share button text
    const originalText = dom.navShare.textContent;
    dom.navShare.textContent = 'Poslano!';
    dom.navShare.disabled = true;
    setTimeout(() => {
      dom.navShare.textContent = originalText;
    }, 2000);
  }

  /* ===================================================================
   *  REAL-TIME PRODUCT CREATION
   * =================================================================== */

  function promptNewCategory() {
    const name = prompt('Naziv nove kategorije:', '');
    if (!name || !name.trim()) return;

    addCategory(name);

    // Refresh current view
    if (currentView === 'categories') {
      renderCategories(currentType);
    }
    if (currentView === 'admin') {
      renderAdmin();
    }
  }

  function promptNewVariant() {
    if (!currentCategoryId) return;

    const code = prompt('Nova šifra (npr. 06):', '');
    if (!code || !code.trim()) return;

    addVariant(currentCategoryId, code.trim());
    renderVariants(currentCategoryId);
  }

  /* ===================================================================
   *  DATA EXPORT / IMPORT
   * =================================================================== */

  function exportData() {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const today = getToday();
    const filename = `stand-tracker-backup-${today}.json`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    dom.setDataStatus.textContent = 'Podaci izvezeni.';
  }

  function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.style.display = 'none';
    document.body.appendChild(input);

    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) {
        document.body.removeChild(input);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target.result);

          // Validate structure
          if (!Array.isArray(json.categories)) {
            throw new Error('Neispravna struktura: nedostaje "categories" niz.');
          }
          if (!json.currentSession || typeof json.currentSession !== 'object') {
            throw new Error('Neispravna struktura: nedostaje "currentSession" objekt.');
          }
          if (typeof json.currentSession.date !== 'string' || !Array.isArray(json.currentSession.items)) {
            throw new Error('Neispravna struktura: "currentSession" mora imati "date" i "items".');
          }
          if (!Array.isArray(json.history)) {
            throw new Error('Neispravna struktura: nedostaje "history" niz.');
          }

          if (!confirm('Uvoz će zamijeniti sve postojeće podatke. Nastaviti?')) {
            document.body.removeChild(input);
            return;
          }

          localStorage.setItem(STORAGE_KEY, JSON.stringify(json));
          dom.setDataStatus.textContent = 'Podaci uvezeni. Aplikacija će se osvježiti.';
          setTimeout(() => location.reload(), 1000);

        } catch (err) {
          alert('Greška pri uvozu: ' + err.message);
        }
        document.body.removeChild(input);
      };

      reader.onerror = () => {
        alert('Greška pri čitanju datoteke.');
        document.body.removeChild(input);
      };

      reader.readAsText(file);
    });

    input.click();
  }

  /* ===================================================================
   *  SERVICE WORKER AUTO-UPDATE
   * =================================================================== */

  async function checkForUpdate() {
    dom.setUpdateStatus.textContent = 'Provjeravam ažuriranja...';

    try {
      // Fetch version.json from server, bypass all caches
      const resp = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);

      const remote = await resp.json();
      const remoteVersion = remote.version || '0';
      const localVersion = localStorage.getItem('stand-tracker-version') || '0';

      if (remoteVersion !== localVersion) {
        dom.setUpdateStatus.textContent = 'Nova verzija ' + remoteVersion + '. Osvježavam...';

        // Nuke caches
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));

        // Unregister SW so next load gets fresh one
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.unregister();

        // Store new version before reload
        localStorage.setItem('stand-tracker-version', remoteVersion);

        window.location.reload();
      } else {
        dom.setUpdateStatus.textContent = 'Nemate ažuriranja. Verzija ' + localVersion + ' je najnovija.';
      }
    } catch (err) {
      console.error('Update check failed:', err);
      dom.setUpdateStatus.textContent = 'Greška pri provjeri. Pokušajte ponovo.';
    }
  }

  /* ===================================================================
   *  SERVICE WORKER REGISTRATION
   * =================================================================== */

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/service-worker.js')
      .then((reg) => {
        swRegistration = reg;
        console.log('Service Worker registriran:', reg.scope);
      })
      .catch((err) => {
        console.error('Service Worker greška:', err);
      });
  }

  /* ===================================================================
   *  EVENT HANDLING — BUTTON WIRING
   * =================================================================== */

  function wireEvents() {
    // Home buttons
    dom.homeBtnUlaz.addEventListener('click', () => goCategories('ulaz'));
    dom.homeBtnOtpis.addEventListener('click', () => goCategories('otpis'));

    // Navigation
    dom.navHistory.addEventListener('click', goHistory);
    dom.navAdmin.addEventListener('click', goAdmin);
    dom.navShare.addEventListener('click', shareAndReset);

    // Back buttons
    dom.catBack.addEventListener('click', goHome);
    dom.varBack.addEventListener('click', () => {
      // If we came from categories or home
      popView();
      renderCategories(currentType);
    });
    dom.histBack.addEventListener('click', goHome);
    dom.adminBack.addEventListener('click', goHome);

    // Category add button
    dom.catAddBtn.addEventListener('click', () => {
      promptNewCategory();
    });

    // Variant add button
    dom.varAddBtn.addEventListener('click', () => {
      promptNewVariant();
    });

    // Admin add category
    dom.adminAddCat.addEventListener('click', () => {
      const name = prompt('Naziv nove kategorije:', '');
      if (!name || !name.trim()) return;
      addCategory(name);
      renderAdmin();
    });

    // Settings
    dom.homeBtnSettings.addEventListener('click', goSettings);
    dom.setBack.addEventListener('click', goHome);
    dom.setCheckUpdate.addEventListener('click', checkForUpdate);
    dom.setExport.addEventListener('click', exportData);
    dom.setImport.addEventListener('click', importData);

    // Admin event delegation (once)
    bindAdminEvents();
  }

  /* ===================================================================
   *  UTILITY
   * =================================================================== */

  /** Escape HTML to prevent XSS in dynamic content. */
  function escHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ===================================================================
   *  INITIALIZATION
   * =================================================================== */

  function init() {
    // Load persistent data
    data = loadData();

    // Store current version (so update check doesn't trigger on first run)
    if (!localStorage.getItem('stand-tracker-version')) {
      localStorage.setItem('stand-tracker-version', VERSION);
    }

    // Check if currentSession date matches today
    const today = getToday();
    if (data.currentSession.date !== today) {
      // New day — fresh session, preserve categories
      data.currentSession = {
        date: today,
        items: [],
      };
      saveData(data);
    }

    // Wire up all event listeners
    wireEvents();

    // Persist session on app close / background
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) saveData(data);
    });
    window.addEventListener('pagehide', () => saveData(data));

    // Register service worker
    registerServiceWorker();

    // Render initial view
    goHome();
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
