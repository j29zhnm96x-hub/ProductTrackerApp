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
  };

  // --------------- STORAGE KEY ---------------
  const STORAGE_KEY = 'stand-tracker-data';

  // --------------- STATE ---------------
  let data = null;
  let currentView = 'home';
  let currentType = 'ulaz';    // 'ulaz' | 'otpis'
  let currentCategoryId = null;
  let viewStack = [];          // for back navigation

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

  /** Add or subtract quantity (min 0). Remove item if quantity reaches 0. */
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

    saveData(data);
    return item.quantity;
  }

  /** Sum all variant quantities for a category+type combo. */
  function getCategoryTotal(categoryId, type) {
    return data.currentSession.items
      .filter((i) => i.categoryId === categoryId && i.type === type)
      .reduce((sum, i) => sum + i.quantity, 0);
  }

  /** Add a new category with variants array. */
  function addCategory(name, variants) {
    const cat = {
      id: uid('cat'),
      name: name.trim(),
      variants: (variants || []).map((v) => ({
        id: uid('var'),
        price: typeof v === 'number' ? v : (v.price || 0),
      })),
    };
    data.categories.push(cat);
    saveData(data);
    return cat;
  }

  /** Add a variant to an existing category. */
  function addVariant(categoryId, price) {
    const cat = findCategory(categoryId);
    if (!cat) return null;
    const v = { id: uid('var'), price: Number(price) || 0 };
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

  /** Update variant price. */
  function updateVariantPrice(categoryId, variantId, newPrice) {
    const v = findVariant(categoryId, variantId);
    if (!v) return;
    v.price = Number(newPrice) || 0;
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
  function renderVariants(categoryId) {
    const cat = findCategory(categoryId);
    if (!cat) return;

    dom.varTitle.textContent = cat.name;
    dom.varSubtitle.textContent = currentType === 'ulaz' ? 'ULAZ' : 'OTPIS';
    dom.varGrid.innerHTML = '';

    if (cat.variants.length === 0) {
      dom.varGrid.innerHTML =
        '<p class="empty-state">Nema cijena za ovu kategoriju.</p>';
    }

    cat.variants.forEach((v) => {
      const qty = getItemQuantity(categoryId, v.id, currentType);
      const card = document.createElement('div');
      card.className = 'card card--variant' + (qty > 0 ? ' card--has-items' : '');
      card.dataset.categoryId = categoryId;
      card.dataset.variantId = v.id;

      card.innerHTML =
        `<span class="variant-card-price">${formatPrice(v.price)}</span>` +
        `<div class="counter">` +
          `<button class="counter__btn btn--counter-minus" data-category-id="${categoryId}" data-variant-id="${v.id}" data-type="${currentType}" aria-label="Smanji">−</button>` +
          `<span class="counter__val" data-category-id="${categoryId}" data-variant-id="${v.id}">${qty}</span>` +
          `<button class="counter__btn btn--counter-plus" data-category-id="${categoryId}" data-variant-id="${v.id}" data-type="${currentType}" aria-label="Povećaj">+</button>` +
        `</div>`;

      dom.varGrid.appendChild(card);
    });

    dom.varAddBtn.style.display = 'block';
  }

  /** Format a price number for display: "5€" or "7.50€" */
  function formatPrice(price) {
    const num = Number(price);
    if (Number.isInteger(num)) return `${num}€`;
    return `${num.toFixed(2).replace('.', ',')}€`;
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
        const priceLabel = v ? formatPrice(v.price) : '?€';
        lines.push(`${catName} ${priceLabel}: ${item.quantity} kom`);
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

      const variantsHtml = cat.variants
        .map((v) => {
          return (
            `<div class="admin-variant-item" data-category-id="${cat.id}" data-variant-id="${v.id}">` +
              `<span class="admin-variant-price">${formatPrice(v.price)}</span>` +
              `<button class="btn btn--danger btn--icon admin-variant-delete" data-category-id="${cat.id}" data-variant-id="${v.id}" aria-label="Obriši cijenu">&#10005;</button>` +
            `</div>`
          );
        })
        .join('');

      card.innerHTML =
        `<div class="admin-cat-header">` +
          `<span class="admin-cat-name" data-category-id="${cat.id}">${escHtml(cat.name)}</span>` +
          `<div class="admin-cat-actions">` +
            `<button class="btn btn--ghost admin-cat-rename" data-category-id="${cat.id}" aria-label="Preimenuj">&#9998;</button>` +
            `<button class="btn btn--ghost admin-cat-add-variant" data-category-id="${cat.id}" aria-label="Dodaj cijenu">+ Cijena</button>` +
            `<button class="btn btn--danger admin-cat-delete" data-category-id="${cat.id}" aria-label="Obriši kategoriju">Obriši</button>` +
          `</div>` +
        `</div>` +
        `<div class="admin-variants">${variantsHtml || '<span class="admin-no-variants">Nema cijena</span>'}</div>`;

      dom.adminCatList.appendChild(card);
    });

    // Delegate events for admin actions
    bindAdminEvents();
  }

  function bindAdminEvents() {
    // Remove old listeners to avoid duplicates — use event delegation on adminCatList
    // We attach once on the container; check if already bound
    if (dom.adminCatList.dataset.bound === 'true') return;
    dom.adminCatList.dataset.bound = 'true';

    dom.adminCatList.addEventListener('click', (e) => {
      const target = e.target;

      // Delete variant
      if (target.classList.contains('admin-variant-delete')) {
        const catId = target.dataset.categoryId;
        const varId = target.dataset.variantId;
        if (confirm('Obrisati ovu cijenu?')) {
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
        const priceStr = prompt('Cijena (€):', '');
        if (priceStr !== null && priceStr.trim() !== '') {
          const price = parseFloat(priceStr.replace(',', '.'));
          if (!isNaN(price) && price >= 0) {
            addVariant(catId, price);
            renderAdmin();
          } else {
            alert('Neispravna cijena.');
          }
        }
        return;
      }

      // Delete category
      if (target.classList.contains('admin-cat-delete')) {
        const catId = target.dataset.categoryId;
        const cat = findCategory(catId);
        if (confirm(`Obrisati kategoriju "${cat ? cat.name : ''}" i sve njene cijene?`)) {
          deleteCategory(catId);
          renderAdmin();
        }
        return;
      }

      // Edit variant price (click on the price text)
      if (target.classList.contains('admin-variant-price')) {
        const row = target.closest('.admin-variant-item');
        if (!row) return;
        const catId = row.dataset.categoryId;
        const varId = row.dataset.variantId;
        const v = findVariant(catId, varId);
        const newPriceStr = prompt('Nova cijena (€):', v ? v.price : '');
        if (newPriceStr !== null && newPriceStr.trim() !== '') {
          const price = parseFloat(newPriceStr.replace(',', '.'));
          if (!isNaN(price) && price >= 0) {
            updateVariantPrice(catId, varId, price);
            renderAdmin();
          } else {
            alert('Neispravna cijena.');
          }
        }
        return;
      }
    });
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

    const newQty = updateQuantity(catId, varId, type, delta);

    // Update the counter value display in the same card
    const card = btn.closest('.card--variant');
    if (card) {
      const valEl = card.querySelector('.counter__val');
      if (valEl) {
        valEl.textContent = newQty;
        // Pulse animation
        valEl.classList.add('counter--pulse');
        setTimeout(() => valEl.classList.remove('counter--pulse'), 300);
      }

      // Toggle has-items class
      if (newQty > 0) {
        card.classList.add('card--has-items');
      } else {
        card.classList.remove('card--has-items');
      }
    }

    // Update category badge if we came from category view
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

  // Delegate counter clicks on the variant grid
  dom.varGrid.addEventListener('click', handleCounterClick);

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

    const priceStr = prompt('Početna cijena (€):', '');
    if (priceStr === null || priceStr.trim() === '') return;

    const price = parseFloat(priceStr.replace(',', '.'));
    if (isNaN(price) || price < 0) {
      alert('Neispravna cijena.');
      return;
    }

    const cat = addCategory(name, [{ price }]);

    // Refresh current view
    if (currentView === 'categories') {
      renderCategories(currentType);
    }
    if (currentView === 'admin') {
      renderAdmin();
    }

    return cat;
  }

  function promptNewVariant() {
    if (!currentCategoryId) return;

    const priceStr = prompt('Nova cijena (€):', '');
    if (priceStr === null || priceStr.trim() === '') return;

    const price = parseFloat(priceStr.replace(',', '.'));
    if (isNaN(price) || price < 0) {
      alert('Neispravna cijena.');
      return;
    }

    addVariant(currentCategoryId, price);
    renderVariants(currentCategoryId);
  }

  /* ===================================================================
   *  SERVICE WORKER REGISTRATION
   * =================================================================== */

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/service-worker.js')
      .then((reg) => {
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
      const priceStr = prompt('Početna cijena (€):', '');
      if (priceStr === null || priceStr.trim() === '') return;
      const price = parseFloat(priceStr.replace(',', '.'));
      if (isNaN(price) || price < 0) {
        alert('Neispravna cijena.');
        return;
      }
      addCategory(name, [{ price }]);
      renderAdmin();
    });
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
