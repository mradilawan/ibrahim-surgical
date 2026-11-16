// Ibrahim Surgical Store - Modern Desktop Client Application
const App = {
  currentView: 'dashboard',
  productsCache: [],
  customersCache: [],
  suppliersCache: [],
  currentCustomerRates: {},
  editingProductId: null,
  stockReportEditMode: false,
  editingStockRowId: null,
  storeSettingsCache: null,

  escapeHtml(str) {
    return (str ?? '').toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  formatNum(val) {
    const num = parseFloat(val) || 0;
    return Number(num.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
  },

  getMedicalLogoSvg(size = 54) {
    return `
      <div style="width:${size}px; height:${size}px; border-radius:13px; background:linear-gradient(135deg, #0f172a 0%, #0369a1 60%, #0284c7 100%); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(2, 132, 199, 0.25); border:2px solid #e0f2fe; flex-shrink:0; -webkit-print-color-adjust:exact; print-color-adjust:exact;">
        <svg width="${Math.round(size * 0.78)}" height="${Math.round(size * 0.78)}" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M32 5L11 13.5v16.2c0 13.5 8.9 25.4 21 29.3 12.1-3.9 21-15.8 21-29.3V13.5L32 5z" fill="rgba(255,255,255,0.12)" stroke="#7dd3fc" stroke-width="2.4" stroke-linejoin="round"/>
          <rect x="27.5" y="16" width="9" height="30" rx="2.5" fill="#ef4444"/>
          <rect x="17" y="26.5" width="30" height="9" rx="2.5" fill="#ef4444"/>
          <path d="M13 31h10l3.5-6.5 4.5 13 4-8.5 3 4.5 3-2.5h10" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
    `;
  },

  async ensureSettingsLoaded(force = false) {
    if (!force && this.storeSettingsCache) return this.storeSettingsCache;
    try {
      const res = await fetch('/api/backup/settings');
      const json = await res.json();
      if (json.success && json.data) {
        this.storeSettingsCache = json.data;
        return this.storeSettingsCache;
      }
    } catch (e) {
      console.warn('Could not load store settings:', e);
    }
    return this.storeSettingsCache || {};
  },

  buildDocumentHeaderHtml({ settings = {}, reportTitle = '', docNo = '', dateLabel = '', extraRightHtml = '' }) {
    const store = settings || {};
    const storeName = store.store_name || 'Ibrahim Surgical Store';
    const tagline = store.tagline || 'Specialized Surgical & Patient Operation Theater Supplies';
    const phone = store.phone || '03030583449';
    const address = store.address || 'Surgical Market, Hospital Road';

    return `
      <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; border-bottom:2px solid #0f172a; padding-bottom:14px; margin-bottom:18px;">
        <div style="display:flex; align-items:center; gap:14px;">
          ${this.getMedicalLogoSvg(56)}
          <div>
            <h2 style="margin:0; font-size:1.45rem; font-weight:800; color:#0f172a; letter-spacing:0.2px; text-transform:uppercase;">${this.escapeHtml(storeName)}</h2>
            <div style="font-size:0.84rem; color:#475569; margin-top:2px;">${this.escapeHtml(tagline)}</div>
            <div style="font-size:0.82rem; color:#334155; font-weight:600; margin-top:3px;">${phone ? `Phone: ${this.escapeHtml(phone)} | ` : ''}${this.escapeHtml(address)}</div>
          </div>
        </div>
        <div style="text-align:right; flex-shrink:0;">
          ${reportTitle ? `<div style="font-size:1.05rem; font-weight:800; color:#0284c7; letter-spacing:0.2px;">${this.escapeHtml(reportTitle)}</div>` : ''}
          ${docNo ? `<div style="font-family:monospace; font-size:1.1rem; font-weight:800; color:#0f172a; margin-top:2px;">${this.escapeHtml(docNo)}</div>` : ''}
          ${dateLabel ? `<div style="font-size:0.84rem; color:#475569; font-weight:600; margin-top:4px;">${this.escapeHtml(dateLabel)}</div>` : ''}
          ${extraRightHtml || ''}
        </div>
      </div>
    `;
  },

  triggerPrint(html) {
    const printArea = document.getElementById('print-area');
    if (!printArea) return;

    printArea.innerHTML = html;
    printArea.style.display = 'block';
    document.body.classList.add('printing-area');

    const cleanup = () => {
      document.body.classList.remove('printing-area');
      printArea.style.display = 'none';
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    try {
      window.print();
    } finally {
      cleanup();
    }
  },

  computeProductMetrics(p) {
    const cost = parseFloat(p.purchase_price) || 0;
    const unitPrice = parseFloat(p.selling_price) || 0;
    const discType = p.discount_type === 'pct' ? 'pct' : 'rs';
    const discValue = Math.max(0, parseFloat(p.discount_value) || 0);
    const qty = parseFloat(p.current_stock) || 0;

    const discountRs = discType === 'pct'
      ? (unitPrice * discValue) / 100
      : discValue;
    const discountPct = unitPrice > 0
      ? (discType === 'pct' ? discValue : (discountRs / unitPrice) * 100)
      : 0;

    const finalPrice = unitPrice - discountRs;
    const grossDiff = unitPrice - cost;
    const netDiffPerUnit = finalPrice - cost;

    const round2 = (n) => Math.round(n * 100) / 100;
    return {
      cost: round2(cost),
      unitPrice: round2(unitPrice),
      discType,
      discValue: round2(discValue),
      discountRs: round2(discountRs),
      discountPct: round2(discountPct),
      finalPrice: round2(finalPrice),
      grossDiff: round2(grossDiff),
      netDiffPerUnit: round2(netDiffPerUnit),
      qty: round2(qty),
      totalCost: round2(cost * qty),
      totalGross: round2(unitPrice * qty),
      totalDiscount: round2(discountRs * qty),
      totalFinal: round2(finalPrice * qty),
      totalNetProfit: round2(netDiffPerUnit * qty)
    };
  },

  // Chart & Analytics State
  currentChartRange: '1month',
  currentChartMetric: 'sales',
  currentChartData: null,

  // Calculator State
  calcState: { currentInput: '0', previousInput: null, operator: null, isResult: false, expression: '' },
  isCalcOpen: false,

  init() {
    this.bindNavigation();
    this.startClock();
    this.bindCalculatorKeyboard();
    this.loadView('dashboard');
    this.checkHealth();
  },

  // ----------------------------------------------------
  // FLOATING CALCULATOR ENGINE
  // ----------------------------------------------------
  toggleCalculator() {
    const el = document.getElementById('calculator-widget');
    if (!el) return;
    this.isCalcOpen = !this.isCalcOpen;
    el.style.display = this.isCalcOpen ? 'flex' : 'none';
    if (this.isCalcOpen) {
      this.initCalculatorDrag();
      this.updateCalcScreen();
    }
  },

  calcAction(key) {
    const s = this.calcState;
    if ('0123456789'.includes(key)) {
      if (s.isResult || s.currentInput === '0') {
        s.currentInput = key;
        s.isResult = false;
      } else {
        s.currentInput += key;
      }
    } else if (key === '.') {
      if (s.isResult) {
        s.currentInput = '0.';
        s.isResult = false;
      } else if (!s.currentInput.includes('.')) {
        s.currentInput += '.';
      }
    } else if (key === 'C') {
      s.currentInput = '0';
      s.previousInput = null;
      s.operator = null;
      s.expression = '';
      s.isResult = false;
    } else if (key === 'CE') {
      s.currentInput = '0';
      s.isResult = false;
    } else if (key === '±') {
      if (s.currentInput !== '0') {
        if (s.currentInput.startsWith('-')) s.currentInput = s.currentInput.slice(1);
        else s.currentInput = '-' + s.currentInput;
      }
    } else if (key === '%') {
      const val = parseFloat(s.currentInput);
      if (!isNaN(val)) {
        s.currentInput = String(val / 100);
        s.isResult = true;
      }
    } else if (['+', '-', '*', '/'].includes(key)) {
      if (s.operator && !s.isResult) {
        this.calcCompute();
      }
      s.previousInput = parseFloat(s.currentInput);
      s.operator = key;
      s.isResult = true;
      const opSymbol = key === '*' ? '×' : (key === '/' ? '÷' : (key === '-' ? '−' : '+'));
      s.expression = `${s.previousInput} ${opSymbol}`;
    } else if (key === '=') {
      if (s.operator && s.previousInput !== null) {
        const opSymbol = s.operator === '*' ? '×' : (s.operator === '/' ? '÷' : (s.operator === '-' ? '−' : '+'));
        s.expression = `${s.previousInput} ${opSymbol} ${s.currentInput} =`;
        this.calcCompute();
        s.operator = null;
        s.previousInput = null;
        s.isResult = true;
      }
    }
    this.updateCalcScreen();
  },

  calcCompute() {
    const s = this.calcState;
    const prev = s.previousInput;
    const curr = parseFloat(s.currentInput);
    if (isNaN(prev) || isNaN(curr)) return;
    let res = 0;
    switch (s.operator) {
      case '+': res = prev + curr; break;
      case '-': res = prev - curr; break;
      case '*': res = prev * curr; break;
      case '/': 
        if (curr === 0) {
          s.currentInput = 'Error';
          s.isResult = true;
          return;
        }
        res = prev / curr; 
        break;
    }
    res = Math.round(res * 10000) / 10000;
    s.currentInput = String(res);
  },

  updateCalcScreen() {
    const disp = document.getElementById('calc-display');
    const expr = document.getElementById('calc-expr');
    if (!disp) return;
    const num = parseFloat(this.calcState.currentInput);
    if (!isNaN(num) && !this.calcState.currentInput.endsWith('.')) {
      disp.textContent = num.toLocaleString('en-US', { maximumFractionDigits: 4 });
    } else {
      disp.textContent = this.calcState.currentInput;
    }
    if (expr) expr.textContent = this.calcState.expression;
  },

  initCalculatorDrag() {
    const handle = document.getElementById('calc-drag-handle');
    const widget = document.getElementById('calculator-widget');
    if (!handle || !widget || handle._dragInit) return;
    handle._dragInit = true;

    let isDragging = false;
    let startX = 0, startY = 0, initialLeft = 0, initialTop = 0;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = widget.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      widget.style.left = `${initialLeft + dx}px`;
      widget.style.top = `${initialTop + dy}px`;
      widget.style.right = 'auto';
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      document.body.style.userSelect = '';
    });
  },

  bindCalculatorKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (!this.isCalcOpen) return;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;

      if (e.key >= '0' && e.key <= '9') {
        this.calcAction(e.key);
      } else if (e.key === '.') {
        this.calcAction('.');
      } else if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') {
        this.calcAction(e.key);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.calcAction('=');
      } else if (e.key === 'Backspace') {
        if (this.calcState.currentInput.length > 1 && !this.calcState.isResult) {
          this.calcState.currentInput = this.calcState.currentInput.slice(0, -1);
        } else {
          this.calcState.currentInput = '0';
        }
        this.updateCalcScreen();
      } else if (e.key === 'Escape') {
        this.toggleCalculator();
      } else if (e.key.toLowerCase() === 'c') {
        this.calcAction('C');
      }
    });
  },

  startClock() {
    const clockEl = document.getElementById('clock-display');
    const update = () => {
      if (clockEl) {
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        clockEl.textContent = `${dateStr} • ${timeStr}`;
      }
    };
    update();
    setInterval(update, 1000);
  },

  async checkHealth() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      if (data && data.storage) {
        const drive = data.storage.slice(0, 2);
        const label = document.getElementById('storage-drive-label');
        if (label) label.textContent = `Safe Drive: ${drive}\\`;
      }
    } catch (e) {
      console.warn('Backend connection error:', e);
    }
  },

  bindNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        const view = item.getAttribute('data-view');
        this.loadView(view);
      });
    });
  },

  loadView(viewName) {
    this.currentView = viewName;
    const container = document.getElementById('content-container');
    const pageTitle = document.getElementById('page-title');

    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(i => {
      if (i.getAttribute('data-view') === viewName) i.classList.add('active');
      else i.classList.remove('active');
    });

    switch (viewName) {
      case 'dashboard':
        pageTitle.innerHTML = '<span>Dashboard Overview</span>';
        this.renderDashboard(container);
        break;
      case 'sales':
        pageTitle.innerHTML = '<span>Sales Invoices & Billing</span>';
        this.renderSales(container);
        break;
      case 'products':
        pageTitle.innerHTML = '<span>Product List & Rate Calculator</span>';
        this.renderProducts(container);
        break;
      case 'stock-report':
        pageTitle.innerHTML = '<span>Warehouse Stock Report</span>';
        this.renderStockReport(container);
        break;
      case 'customers':
        pageTitle.innerHTML = '<span>Dealers & Hospitals</span>';
        this.renderCustomers(container);
        break;
      case 'purchases':
        pageTitle.innerHTML = '<span>Purchases & Stock In</span>';
        this.renderPurchases(container);
        break;
      case 'expenses':
        pageTitle.innerHTML = '<span>Business Expenses</span>';
        this.renderExpenses(container);
        break;
      case 'reports':
        pageTitle.innerHTML = '<span>Monthly Profit & Loss Reports</span>';
        this.renderReports(container);
        break;
      case 'settings':
        pageTitle.innerHTML = '<span>Safe Backup & Settings</span>';
        this.renderSettings(container);
        break;
    }
  },

  // ----------------------------------------------------
  // 1. DASHBOARD VIEW
  // ----------------------------------------------------
  async renderDashboard(container) {
    container.innerHTML = '<div style="padding:40px; text-align:center; color:#64748b; font-weight:600;">Loading Dashboard Summary...</div>';
    try {
      const res = await fetch('/api/dashboard/summary');
      const json = await res.json();
      if (!json.success) throw new Error(json.message);
      const d = json.data;

      container.innerHTML = `
        <!-- Hero Welcome Medical Banner -->
        <div class="hero-banner">
          <div style="display:flex; align-items:center; gap:20px; z-index:1;">
            <div style="width:64px; height:64px; border-radius:16px; background:linear-gradient(135deg, #ef4444 0%, #2563eb 100%); display:flex; align-items:center; justify-content:center; box-shadow:0 8px 24px rgba(239, 68, 68, 0.35), 0 8px 24px rgba(37, 99, 235, 0.35); border:2px solid rgba(255,255,255,0.3); flex-shrink:0;">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <!-- Medical Cross & Surgical Blade Contour -->
                <path d="M12 2L4 5.5v6.2c0 5.2 3.4 10.1 8 11.3 4.6-1.2 8-6.1 8-11.3V5.5L12 2z" fill="rgba(255, 255, 255, 0.2)"/>
                <path d="M12 7v8M8 11h8" stroke="#ffffff" stroke-width="2.5"/>
              </svg>
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:4px;">
                <h2 style="font-size:1.45rem; font-weight:800; letter-spacing:0.3px; margin:0; color:#fff;">IBRAHIM SURGICAL & HEALTHCARE</h2>
                <span class="hc-badge-red">
                  OT & Hospital Supplies
                </span>
                <span class="hc-badge-blue">
                  ● Safe Storage (E:\\ Drive)
                </span>
              </div>
              <p style="color:#cbd5e1; font-size:0.88rem; margin:0; max-width:650px;">
                Specialized in Operation Theater Consumables, Sutures, Catheters & Surgical Instruments with Dynamic Hospital Pricing.
              </p>
            </div>
          </div>
          <div style="display:flex; gap:10px; z-index:1; flex-wrap:wrap;">
            <button class="btn btn-secondary" style="background:rgba(255,255,255,0.12); color:#fff; border:1px solid rgba(255,255,255,0.25); backdrop-filter:blur(4px);" onclick="App.loadView('stock-report')">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
              <span>Stock Report</span>
            </button>
            <button class="btn btn-primary" style="box-shadow:0 4px 14px rgba(2, 132, 199, 0.5);" onclick="App.openNewSaleModal()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
              <span>+ New Invoice</span>
            </button>
          </div>
        </div>

        <!-- Quick Action Dock -->
        <div class="quick-dock">
          <div class="dock-btn" onclick="App.loadView('products')">
            <div class="dock-icon-circle icon-blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
            </div>
            <span>Product List</span>
          </div>

          <div class="dock-btn" onclick="App.openNewSaleModal()">
            <div class="dock-icon-circle icon-blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" x2="12" y1="11" y2="17"/><line x1="9" x2="15" y1="14" y2="14"/></svg>
            </div>
            <span>+ New Invoice</span>
          </div>

          <div class="dock-btn" onclick="App.loadView('stock-report')">
            <div class="dock-icon-circle icon-amber">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
            </div>
            <span>Stock Report</span>
          </div>

          <div class="dock-btn" onclick="App.openAddPurchaseModal()">
            <div class="dock-icon-circle icon-green">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            </div>
            <span>+ Stock In (Purchase)</span>
          </div>

          <div class="dock-btn" onclick="App.loadView('customers')">
            <div class="dock-icon-circle icon-indigo">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <span>Dealers & Rates</span>
          </div>

          <div class="dock-btn" onclick="App.openAddExpenseModal()">
            <div class="dock-icon-circle icon-violet">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <span>+ Add Expense</span>
          </div>

          <div class="dock-btn" onclick="App.triggerManualBackup()">
            <div class="dock-icon-circle icon-blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span>Safe Backup (E:\\)</span>
          </div>
        </div>

        <!-- 6-Card KPI Grid with Top Accents -->
        <div class="stats-grid">
          <!-- 1. Monthly Sales -->
          <div class="stat-card card-blue">
            <div>
              <div class="stat-label">Monthly Sales</div>
              <div class="stat-value">Rs. ${d.monthlySales.toLocaleString()}</div>
              <div class="stat-subtext">${d.invoicesThisMonth} invoices this month</div>
            </div>
            <div class="stat-icon icon-blue">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
          </div>

          <!-- 2. Net Profit -->
          <div class="stat-card card-green">
            <div>
              <div class="stat-label">Net Profit</div>
              <div class="stat-value" style="color:#059669;">Rs. ${d.monthlyNetProfit.toLocaleString()}</div>
              <div class="stat-subtext">Gross: Rs. ${d.monthlyGrossProfit.toLocaleString()} | Exp: Rs. ${d.monthlyExpenses.toLocaleString()}</div>
            </div>
            <div class="stat-icon icon-green">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
          </div>

          <!-- 3. Receivables / Dues -->
          <div class="stat-card card-red">
            <div>
              <div class="stat-label">Outstanding Receivables</div>
              <div class="stat-value" style="color:#dc2626;">Rs. ${d.totalHospitalDues.toLocaleString()}</div>
              <div class="stat-subtext">From ${d.hospitalsWithDues} dealers / hospitals</div>
            </div>
            <div class="stat-icon icon-red">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>
            </div>
          </div>

          <!-- 4. Warehouse Stock -->
          <div class="stat-card card-amber" style="cursor:pointer;" onclick="App.loadView('stock-report');" title="Click to view full Warehouse Stock Report">
            <div>
              <div class="stat-label">Warehouse Stock</div>
              <div class="stat-value" style="color:#d97706;">${d.totalProducts} Items</div>
              <div class="stat-subtext" style="color:var(--primary); font-weight:700;">Click to view Stock Report →</div>
            </div>
            <div class="stat-icon icon-amber">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            </div>
          </div>

          <!-- 5. Monthly Purchases -->
          <div class="stat-card card-indigo">
            <div>
              <div class="stat-label">Purchases (This Month)</div>
              <div class="stat-value" style="color:#4f46e5;">Rs. ${(d.monthlyPurchases || 0).toLocaleString()}</div>
              <div class="stat-subtext">Stock intake from suppliers</div>
            </div>
            <div class="stat-icon icon-indigo">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><line x1="3" x2="21" y1="6" y2="6"/></svg>
            </div>
          </div>

          <!-- 6. Store Expenses -->
          <div class="stat-card card-violet">
            <div>
              <div class="stat-label">Store Expenses</div>
              <div class="stat-value" style="color:#7c3aed;">Rs. ${d.monthlyExpenses.toLocaleString()}</div>
              <div class="stat-subtext">Rent, utility, transport, staff</div>
            </div>
            <div class="stat-icon icon-violet">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
          </div>
        </div>

        <!-- Healthcare Trust & Brand Emblem Banner (Red & Blue Contrast) -->
        <div class="healthcare-brand-banner">
          <div class="healthcare-logo-wrap">
            <div class="healthcare-emblem-box">
              <svg width="52" height="52" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="32" cy="32" r="30" stroke="url(#hcBlueGrad)" stroke-width="2.5" stroke-dasharray="4 2"/>
                <circle cx="32" cy="32" r="26" fill="url(#hcRedDark)"/>
                <!-- Red Medical Cross -->
                <rect x="27" y="14" width="10" height="36" rx="3" fill="#ef4444"/>
                <rect x="14" y="27" width="36" height="10" rx="3" fill="#ef4444"/>
                <!-- Blue Accent Inner Cross -->
                <rect x="29" y="16" width="6" height="32" rx="2" fill="#ffffff" fill-opacity="0.25"/>
                <rect x="16" y="29" width="32" height="6" rx="2" fill="#ffffff" fill-opacity="0.25"/>
                <!-- Heartbeat / EKG Pulse in Sky Blue & White -->
                <path d="M11 32h13l3-7 5 14 4-9 3 5 4-3h10" stroke="#38bdf8" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="32" cy="32" r="4.5" fill="#ffffff" stroke="#2563eb" stroke-width="2"/>
                <defs>
                  <linearGradient id="hcBlueGrad" x1="0" y1="0" x2="64" y2="64">
                    <stop offset="0%" stop-color="#38bdf8"/>
                    <stop offset="100%" stop-color="#2563eb"/>
                  </linearGradient>
                  <linearGradient id="hcRedDark" x1="0" y1="0" x2="64" y2="64">
                    <stop offset="0%" stop-color="#3b0712"/>
                    <stop offset="100%" stop-color="#0f172a"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                <h3 class="healthcare-title">IBRAHIM HEALTHCARE & SURGICAL</h3>
                <span class="hc-badge-red">Emergency & OT Supplies</span>
                <span class="hc-badge-blue">Certified Consumables</span>
              </div>
              <p class="healthcare-tagline">
                Dedicated surgical theater distributor: IV Cannulas, Sutures, Surgical Blades, Drips, Drainage Tubes & Sterility Solutions.
              </p>
              <div class="healthcare-features">
                <span class="hc-feat"><span class="hc-dot-red"></span> 100% Sterile Products</span>
                <span class="hc-feat"><span class="hc-dot-blue"></span> Dynamic Hospital Rates</span>
                <span class="hc-feat"><span class="hc-dot-green"></span> Live Stock Valuation</span>
                <span class="hc-feat"><span class="hc-dot-cyan"></span> Safe Storage (E:\\ Drive)</span>
              </div>
            </div>
          </div>

          <div class="healthcare-seal-box">
            <div class="hc-seal-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <path d="m9 12 2 2 4-4"/>
              </svg>
            </div>
            <div style="text-align:right;">
              <div style="font-size:0.72rem; color:#f87171; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">HEALTHCARE VERIFIED</div>
              <div style="font-size:0.92rem; font-weight:800; color:#fff;">Precision OT Consumables</div>
              <div style="font-size:0.72rem; color:#94a3b8;">Standard Hospital Protocol</div>
            </div>
          </div>
        </div>

        <!-- Activity & Stock Movement Flow Chart Card -->
        <div class="card" id="dashboard-chart-card">
          <div class="card-header" style="flex-wrap:wrap; gap:12px;">
            <div>
              <h3 class="card-title">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" x2="18" y1="20" y2="10"/>
                  <line x1="12" x2="12" y1="20" y2="4"/>
                  <line x1="6" x2="6" y1="20" y2="14"/>
                </svg>
                Sales & Stock Movement Activity
              </h3>
              <div style="font-size:0.78rem; color:#64748b; margin-top:2px;">
                Daily performance trend (کتنا پمپ کیا / کتنا نہیں کیا)
              </div>
            </div>
            
            <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
              <!-- Metric Selector -->
              <div class="chart-pill-group">
                <button class="chart-pill active" id="metric-sales-btn" onclick="App.setChartMetric('sales')">Sales Revenue</button>
                <button class="chart-pill" id="metric-purchases-btn" onclick="App.setChartMetric('purchases')">Stock Purchases</button>
                <button class="chart-pill" id="metric-profit-btn" onclick="App.setChartMetric('profit')">Net Profit</button>
              </div>

              <!-- Timeframe Selector (7 Days, 15 Days, 1 Month, 3 Months) -->
              <div class="chart-pill-group">
                <button class="chart-pill" id="range-7days-btn" onclick="App.loadDashboardChart('7days')">7 Days</button>
                <button class="chart-pill" id="range-15days-btn" onclick="App.loadDashboardChart('15days')">15 Days</button>
                <button class="chart-pill active" id="range-1month-btn" onclick="App.loadDashboardChart('1month')">1 Month</button>
                <button class="chart-pill" id="range-3months-btn" onclick="App.loadDashboardChart('3months')">3 Months</button>
              </div>
            </div>
          </div>

          <!-- Chart Summary Mini Badges -->
          <div class="chart-summary-bar" id="chart-summary-bar">
            <!-- Dynamically populated -->
          </div>

          <!-- Interactive SVG Chart Container -->
          <div class="chart-visual-container" id="chart-visual-container">
            <div style="padding:40px; text-align:center; color:#64748b;">Loading activity graph...</div>
          </div>
        </div>

        <!-- 2 Column Section: Base Catalog Preview & Dues -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:24px; margin-bottom:24px;">
          <!-- Catalog Rate List Preview -->
          <div class="card" style="margin-bottom:0;">
            <div class="card-header">
              <div>
                <h3 class="card-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                  Surgical Items & Base Rates
                </h3>
                <div style="font-size:0.78rem; color:#64748b; margin-top:2px;">Showing surgical items (${d.totalProducts} total)</div>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="App.loadView('products');">Open Product List</button>
            </div>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Unit</th>
                    <th>Cost Price</th>
                    <th>Base Sale Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${d.criticalStock.length === 0 ? '<tr><td colspan="4" style="text-align:center; color:#64748b; padding:24px;">No products added yet. Open Stock & Rate List to add items manually.</td></tr>' :
                    d.criticalStock.slice(0, 6).map(p => `
                      <tr>
                        <td style="font-weight:600; color:var(--slate-900);">${p.name}</td>
                        <td><span class="badge badge-secondary">${p.unit}</span></td>
                        <td style="color:#64748b;">Rs. ${p.purchase_price}</td>
                        <td style="font-weight:700; color:var(--primary);">Rs. ${p.selling_price}</td>
                      </tr>
                    `).join('')
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- Top Receivables / Dues -->
          <div class="card" style="margin-bottom:0;">
            <div class="card-header">
              <div>
                <h3 class="card-title">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>
                  Outstanding Dealer / Hospital Balances
                </h3>
                <div style="font-size:0.78rem; color:#64748b; margin-top:2px;">Receivables pending recovery</div>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="App.loadView('customers');">View All Dealers</button>
            </div>
            <div class="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Dealer / Hospital</th>
                    <th>Mobile</th>
                    <th>Pending Due</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${d.topDuesHospitals.length === 0 ? '<tr><td colspan="4" style="text-align:center; color:#64748b; padding:24px;">No outstanding dues. Add your dealers & hospitals to start billing.</td></tr>' : 
                    d.topDuesHospitals.map(h => `
                      <tr>
                        <td style="font-weight:600;">${h.business_name || h.name}</td>
                        <td style="color:#64748b;">${h.mobile || '-'}</td>
                        <td style="font-weight:700; color:#dc2626;">Rs. ${h.balance.toLocaleString()}</td>
                        <td>
                          <button class="btn btn-success btn-sm" onclick="App.openReceivePaymentModal(${h.id}, '${(h.business_name || h.name).replace(/'/g, "\\'")}', ${h.balance})">Receive</button>
                        </td>
                      </tr>
                    `).join('')
                  }
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- Recent Invoices Table -->
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" x2="8" y1="13" y2="13"/><line x1="16" x2="8" y1="17" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                Recent Sales Invoices
              </h3>
              <div style="font-size:0.78rem; color:#64748b; margin-top:2px;">Latest billing records generated for hospitals</div>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="App.loadView('sales');">View All Invoices</button>
          </div>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Dealer / Hospital</th>
                  <th>Date</th>
                  <th>Total Amount</th>
                  <th>Paid</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${d.recentSales.length === 0 ? '<tr><td colspan="8" style="text-align:center; color:#64748b; padding:24px;">No invoices generated yet. Click "+ New Invoice" to start billing.</td></tr>' : 
                  d.recentSales.map(s => `
                    <tr>
                      <td style="font-weight:700; font-family:monospace; color:var(--primary);">${s.invoice_no}</td>
                      <td style="font-weight:600;">${s.customer_name}</td>
                      <td>${s.sale_date}</td>
                      <td style="font-weight:700;">Rs. ${s.total_amount.toLocaleString()}</td>
                      <td style="color:#059669;">Rs. ${s.paid_amount.toLocaleString()}</td>
                      <td style="color:#dc2626; font-weight:600;">Rs. ${s.due_amount.toLocaleString()}</td>
                      <td>
                        <span class="badge ${s.payment_status === 'paid' ? 'badge-success' : (s.payment_status === 'partial' ? 'badge-warning' : 'badge-danger')}">
                          ${s.payment_status}
                        </span>
                      </td>
                      <td>
                        <div style="display:flex; gap:6px;">
                          <button class="btn btn-secondary btn-sm" onclick="App.viewInvoice(${s.id})">Print / View</button>
                          <button class="btn btn-primary btn-sm" onclick="App.openEditInvoiceModal(${s.id})" title="Edit / Correct Invoice">Edit</button>
                        </div>
                      </td>
                    </tr>
                  `).join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      `;

      // Load interactive activity chart
      this.loadDashboardChart(this.currentChartRange || '1month');
    } catch (err) {
      container.innerHTML = `<div style="padding:20px; color:#ef4444;">Error loading dashboard: ${err.message}</div>`;
    }
  },

  // ----------------------------------------------------
  // INTERACTIVE ACTIVITY & STOCK FLOW CHART ENGINE
  // ----------------------------------------------------
  async loadDashboardChart(range = '1month') {
    this.currentChartRange = range;
    const container = document.getElementById('chart-visual-container');
    const summaryBar = document.getElementById('chart-summary-bar');
    if (!container) return;

    ['7days', '15days', '1month', '3months'].forEach(r => {
      const btn = document.getElementById(`range-${r}-btn`);
      if (btn) {
        if (r === range) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });

    container.innerHTML = '<div style="padding:40px; text-align:center; color:#64748b;">Loading activity trend...</div>';

    try {
      const res = await fetch(`/api/dashboard/chart?range=${range}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      this.currentChartData = json;
      const s = json.summary;

      if (summaryBar) {
        summaryBar.innerHTML = `
          <div class="chart-stat-item">
            <span class="chart-stat-label">Period Sales</span>
            <span class="chart-stat-val" style="color:#0284c7;">Rs. ${s.totalSales.toLocaleString()}</span>
          </div>
          <div class="chart-stat-item">
            <span class="chart-stat-label">Invoices Count</span>
            <span class="chart-stat-val">${s.totalInvoices} Invoices</span>
          </div>
          <div class="chart-stat-item">
            <span class="chart-stat-label">Stock Intake (Purchases)</span>
            <span class="chart-stat-val" style="color:#4f46e5;">Rs. ${s.totalPurchases.toLocaleString()}</span>
          </div>
          <div class="chart-stat-item">
            <span class="chart-stat-label">Period Net Profit</span>
            <span class="chart-stat-val" style="color:#059669;">Rs. ${s.totalProfit.toLocaleString()}</span>
          </div>
          <div class="chart-stat-item">
            <span class="chart-stat-label">Daily Average Sales</span>
            <span class="chart-stat-val">Rs. ${s.avgDailySales.toLocaleString()} / day</span>
          </div>
          <div class="chart-stat-item">
            <span class="chart-stat-label">Peak Performance Day</span>
            <span class="chart-stat-val" style="color:var(--primary); font-size:0.95rem;">
              ${s.peakDay && s.peakDay.amount > 0 ? `${s.peakDay.date} (Rs. ${s.peakDay.amount.toLocaleString()})` : 'No Sales Yet'}
            </span>
          </div>
        `;
      }

      this.renderSvgChart();
    } catch (err) {
      console.error('Error loading chart:', err);
      container.innerHTML = `<div style="padding:20px; text-align:center; color:#ef4444;">Failed to load chart: ${err.message}</div>`;
    }
  },

  setChartMetric(metric) {
    this.currentChartMetric = metric;
    ['sales', 'purchases', 'profit'].forEach(m => {
      const btn = document.getElementById(`metric-${m}-btn`);
      if (btn) {
        if (m === metric) btn.classList.add('active');
        else btn.classList.remove('active');
      }
    });
    this.renderSvgChart();
  },

  renderSvgChart() {
    const container = document.getElementById('chart-visual-container');
    if (!container || !this.currentChartData) return;

    const metric = this.currentChartMetric || 'sales';
    const data = this.currentChartData.chartData || [];
    const count = data.length;

    let barColor1 = '#0284c7', barColor2 = '#38bdf8', lineColor = '#0369a1', metricTitle = 'Sales Revenue';
    if (metric === 'purchases') {
      barColor1 = '#4f46e5'; barColor2 = '#818cf8'; lineColor = '#3730a3'; metricTitle = 'Stock Purchases';
    } else if (metric === 'profit') {
      barColor1 = '#059669'; barColor2 = '#34d399'; lineColor = '#047857'; metricTitle = 'Net Profit';
    }

    const values = data.map(d => d[metric] || 0);
    const maxVal = Math.max(...values, 0);

    let upperY = 10000;
    if (maxVal > 0) {
      const magnitude = Math.pow(10, Math.floor(Math.log10(maxVal)));
      upperY = Math.ceil((maxVal * 1.15) / magnitude) * magnitude;
      if (upperY === 0) upperY = 10000;
    }

    const svgW = 1000;
    const svgH = 260;
    const padL = 75;
    const padR = 25;
    const padT = 25;
    const padB = 40;
    const chartW = svgW - padL - padR;
    const chartH = svgH - padT - padB;

    let gridLinesSvg = '';
    const steps = [1, 0.66, 0.33, 0];
    steps.forEach(pct => {
      const y = padT + (1 - pct) * chartH;
      const amt = Math.round(upperY * pct);
      gridLinesSvg += `
        <line x1="${padL}" y1="${y}" x2="${svgW - padR}" y2="${y}" stroke="#e2e8f0" stroke-dasharray="${pct === 0 ? 'none' : '4 4'}" stroke-width="1"/>
        <text x="${padL - 10}" y="${y + 4}" fill="#64748b" font-size="11" font-weight="600" text-anchor="end">
          Rs. ${amt >= 1000 ? (amt / 1000).toLocaleString() + 'k' : amt}
        </text>
      `;
    });

    const barWidth = Math.max(3, Math.min(28, (chartW / count) * 0.65));
    const stepX = chartW / count;
    let barsSvg = '';
    let polyPoints = [];
    let labelsSvg = '';

    let labelInterval = 1;
    if (count > 45) labelInterval = 7;
    else if (count > 20) labelInterval = 3;
    else if (count > 10) labelInterval = 2;

    data.forEach((item, idx) => {
      const val = item[metric] || 0;
      const xCenter = padL + idx * stepX + stepX / 2;
      const barH = upperY > 0 ? (val / upperY) * chartH : 0;
      const yTop = padT + (chartH - barH);
      const xLeft = xCenter - barWidth / 2;

      polyPoints.push(`${xCenter},${yTop}`);

      barsSvg += `
        <rect class="chart-bar-rect" 
              x="${xLeft}" y="${yTop}" width="${barWidth}" height="${Math.max(barH, 2)}" 
              rx="4" fill="url(#barGradient)"
              data-date="${item.date}" 
              data-label="${item.label}" 
              data-val="${val}" 
              data-invoices="${item.invoices || 0}"
              data-sales="${item.sales || 0}"
              data-purchases="${item.purchases || 0}"
              data-profit="${item.profit || 0}"
        />
      `;

      if (idx % labelInterval === 0 || idx === count - 1) {
        labelsSvg += `
          <text x="${xCenter}" y="${svgH - 12}" fill="#64748b" font-size="11" font-weight="600" text-anchor="middle">
            ${item.label}
          </text>
        `;
      }
    });

    const polyLineStr = polyPoints.join(' ');

    const svgHtml = `
      <svg class="chart-svg" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${barColor2}"/>
            <stop offset="100%" stop-color="${barColor1}"/>
          </linearGradient>
        </defs>

        ${gridLinesSvg}
        <polyline fill="none" stroke="${lineColor}" stroke-width="2.5" opacity="0.45" stroke-linecap="round" stroke-linejoin="round" points="${polyLineStr}"/>
        ${barsSvg}
        ${labelsSvg}
      </svg>

      <div id="chart-tooltip" class="chart-tooltip" style="display:none;"></div>

      ${maxVal === 0 ? `
        <div style="position:absolute; top:42%; left:50%; transform:translate(-50%, -50%); text-align:center; background:rgba(255,255,255,0.95); padding:16px 24px; border-radius:12px; border:1px solid #e2e8f0; box-shadow:0 4px 16px rgba(0,0,0,0.06); max-width:380px;">
          <div style="font-size:1.4rem; margin-bottom:4px;">📊</div>
          <div style="font-weight:800; color:var(--slate-800); font-size:0.95rem;">No ${metricTitle} in this period</div>
          <div style="font-size:0.8rem; color:#64748b; margin-top:4px;">Daily activity graph is ready! As soon as you record a sale or stock purchase, the daily graph will reflect here automatically.</div>
        </div>
      ` : ''}
    `;

    container.innerHTML = svgHtml;

    const tooltip = document.getElementById('chart-tooltip');
    const bars = container.querySelectorAll('.chart-bar-rect');

    bars.forEach(bar => {
      bar.addEventListener('mouseenter', () => {
        const d = bar.dataset;
        const rect = bar.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const left = rect.left - containerRect.left + rect.width / 2;
        const top = rect.top - containerRect.top;

        tooltip.innerHTML = `
          <div style="font-weight:800; font-size:0.85rem; color:#38bdf8; margin-bottom:4px;">📅 ${d.date} (${d.label})</div>
          <div style="margin:2px 0;"><span style="color:#94a3b8;">Sales:</span> <strong>Rs. ${parseFloat(d.sales).toLocaleString()}</strong> (${d.invoices} inv)</div>
          <div style="margin:2px 0;"><span style="color:#94a3b8;">Stock In:</span> <strong>Rs. ${parseFloat(d.purchases).toLocaleString()}</strong></div>
          <div style="margin:2px 0;"><span style="color:#94a3b8;">Profit:</span> <strong style="color:#34d399;">Rs. ${parseFloat(d.profit).toLocaleString()}</strong></div>
        `;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
        tooltip.style.display = 'block';
      });

      bar.addEventListener('mouseleave', () => {
        tooltip.style.display = 'none';
      });
    });
  },

  // ----------------------------------------------------
  // STOCK REPORT VIEW (Dedicated Feature)
  // ----------------------------------------------------
  async renderStockReport(container) {
    container.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b;">Loading Live Stock Report...</div>';

    try {
      const res = await fetch('/api/reports/stock');
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      const s = json.data.summary;
      const products = json.data.products;

      container.innerHTML = `
        <!-- Stock Summary KPI Cards -->
        <div class="stats-grid" style="margin-bottom:20px;">
          <div class="stat-card">
            <div>
              <div class="stat-label">Total Catalog Items</div>
              <div class="stat-value">${s.totalItems}</div>
              <div class="stat-subtext">${s.inStockCount} In Stock | ${s.outOfStockCount} Out of Stock</div>
            </div>
            <div class="stat-icon icon-blue">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            </div>
          </div>

          <div class="stat-card">
            <div>
              <div class="stat-label">Total Units in Hand</div>
              <div class="stat-value" style="color:var(--primary);">${s.totalUnits.toLocaleString()} Units</div>
              <div class="stat-subtext">Across all surgical products</div>
            </div>
            <div class="stat-icon icon-green">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
          </div>

          <div class="stat-card">
            <div>
              <div class="stat-label">Inventory Cost Value</div>
              <div class="stat-value" style="color:#334155;">Rs. ${s.totalCostValue.toLocaleString()}</div>
              <div class="stat-subtext">Valued at purchase rate</div>
            </div>
            <div class="stat-icon icon-amber">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
            </div>
          </div>

          <div class="stat-card">
            <div>
              <div class="stat-label">Inventory Sale Value</div>
              <div class="stat-value" style="color:#059669;">Rs. ${s.totalSaleValue.toLocaleString()}</div>
              <div class="stat-subtext">Potential Profit: Rs. ${s.potentialProfit.toLocaleString()}</div>
            </div>
            <div class="stat-icon icon-green">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
            </div>
          </div>
        </div>

        <!-- Filter & Table Card -->
        <div class="card">
          <div class="card-header">
            <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
              <input type="text" id="stock-report-search" class="form-control" style="width:260px;" placeholder="Search stock by name or SKU..." oninput="App.filterStockReportTable()">
              <select id="stock-report-status-filter" class="form-control" style="width:180px;" onchange="App.filterStockReportTable()">
                <option value="">All Items (${s.totalItems})</option>
                <option value="in_stock">In Stock Only (> 0)</option>
                <option value="out_of_stock">Out of Stock (0)</option>
                <option value="low_stock">Low Stock (≤ Alert Limit)</option>
              </select>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn ${this.stockReportEditMode ? 'btn-warning' : 'btn-secondary'}" id="stock-bulk-edit-btn" onclick="App.toggleStockReportBulkEdit()">
                ${this.stockReportEditMode ? '✖️ Exit Edit Mode' : '✏️ Manual Edit Stock'}
              </button>
              <button class="btn btn-success" id="stock-save-all-btn" style="display:${this.stockReportEditMode ? 'inline-flex' : 'none'};" onclick="App.saveAllStockReportEdits()">
                💾 Save All Changes
              </button>
              <button class="btn btn-secondary" onclick="App.exportStockReportCsv()">Export CSV</button>
              <button class="btn btn-primary" onclick="App.printStockReport()">🖨️ Print Stock Report</button>
            </div>
          </div>

          <div class="table-container" id="stock-report-table-box">
            <!-- Table dynamically injected -->
          </div>
        </div>
      `;

      this.currentStockProducts = products;
      this.filterStockReportTable();
    } catch (err) {
      container.innerHTML = `<div style="padding:20px; color:#ef4444;">Error loading stock report: ${err.message}</div>`;
    }
  },

  toggleStockReportBulkEdit() {
    this.editingStockRowId = null;
    this.stockReportEditMode = !this.stockReportEditMode;
    const toggleBtn = document.getElementById('stock-bulk-edit-btn');
    const saveAllBtn = document.getElementById('stock-save-all-btn');
    if (toggleBtn) {
      toggleBtn.className = `btn ${this.stockReportEditMode ? 'btn-warning' : 'btn-secondary'}`;
      toggleBtn.innerHTML = this.stockReportEditMode ? '✖️ Exit Edit Mode' : '✏️ Manual Edit Stock';
    }
    if (saveAllBtn) {
      saveAllBtn.style.display = this.stockReportEditMode ? 'inline-flex' : 'none';
    }
    this.filterStockReportTable();
  },

  startStockReportRowEdit(productId) {
    this.editingStockRowId = productId;
    this.filterStockReportTable();
  },

  cancelStockReportRowEdit() {
    this.editingStockRowId = null;
    if (this.stockReportEditMode) {
      this.toggleStockReportBulkEdit();
      return;
    }
    this.filterStockReportTable();
  },

  getStockStatusBadge(stock, alertQty) {
    if (stock > alertQty) return '<span class="badge badge-success">In Stock</span>';
    if (stock > 0) return '<span class="badge badge-warning">Low Stock</span>';
    return '<span class="badge badge-info">Out of Stock</span>';
  },

  recalcStockRowPreview(inputEl) {
    const tr = inputEl.closest('tr');
    if (!tr) return;
    const stock = parseFloat(tr.querySelector('[data-field="current_stock"]')?.value) || 0;
    const alertQty = parseFloat(tr.querySelector('[data-field="alert_quantity"]')?.value) || 0;
    const cost = parseFloat(tr.querySelector('[data-field="purchase_price"]')?.value) || 0;
    const sale = parseFloat(tr.querySelector('[data-field="selling_price"]')?.value) || 0;

    const costValEl = tr.querySelector('.stock-row-cost-val');
    const saleValEl = tr.querySelector('.stock-row-sale-val');
    const statusEl = tr.querySelector('.stock-row-status');

    if (costValEl) costValEl.textContent = `Rs. ${this.formatNum(stock * cost)}`;
    if (saleValEl) saleValEl.textContent = `Rs. ${this.formatNum(stock * sale)}`;
    if (statusEl) statusEl.innerHTML = this.getStockStatusBadge(stock, alertQty);
  },

  readStockRowPayload(tr, origProduct) {
    const name = tr.querySelector('[data-field="name"]')?.value?.trim() || origProduct.name;
    const sku = tr.querySelector('[data-field="sku"]')?.value?.trim() || origProduct.sku;
    const unit = tr.querySelector('[data-field="unit"]')?.value?.trim() || origProduct.unit || 'Piece';
    const current_stock = parseFloat(tr.querySelector('[data-field="current_stock"]')?.value);
    const alert_quantity = parseFloat(tr.querySelector('[data-field="alert_quantity"]')?.value);
    const purchase_price = parseFloat(tr.querySelector('[data-field="purchase_price"]')?.value);
    const selling_price = parseFloat(tr.querySelector('[data-field="selling_price"]')?.value);

    return {
      name,
      sku,
      unit,
      current_stock: Number.isFinite(current_stock) ? current_stock : origProduct.current_stock,
      alert_quantity: Number.isFinite(alert_quantity) ? alert_quantity : origProduct.alert_quantity,
      purchase_price: Number.isFinite(purchase_price) ? purchase_price : origProduct.purchase_price,
      selling_price: Number.isFinite(selling_price) ? selling_price : origProduct.selling_price
    };
  },

  async saveStockReportRow(productId, btn) {
    const tr = btn ? btn.closest('tr') : document.querySelector(`#printable-stock-table tr[data-product-id="${productId}"]`);
    const orig = (this.currentStockProducts || []).find(item => item.id === productId);
    if (!tr || !orig) return;

    const payload = this.readStockRowPayload(tr, orig);
    if (!payload.name) return alert('Product name cannot be empty');

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving...';
    }

    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      this.editingStockRowId = null;
      this.showToast(`Stock updated for ${payload.name}!`, 'success');
      await this.renderStockReport(document.getElementById('content-container'));
    } catch (err) {
      alert('Failed to update stock: ' + err.message);
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Save';
      }
    }
  },

  async saveAllStockReportEdits() {
    const rows = Array.from(document.querySelectorAll('#printable-stock-table tbody tr[data-product-id]'));
    if (rows.length === 0) return;

    const btn = document.getElementById('stock-save-all-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Saving All...';
    }

    let updatedCount = 0;
    try {
      for (const tr of rows) {
        const productId = parseInt(tr.getAttribute('data-product-id'), 10);
        const orig = (this.currentStockProducts || []).find(item => item.id === productId);
        if (!orig) continue;

        const payload = this.readStockRowPayload(tr, orig);
        if (!payload.name) throw new Error(`Product name cannot be empty (SKU: ${orig.sku})`);

        const changed =
          payload.name !== orig.name ||
          payload.sku !== orig.sku ||
          payload.unit !== orig.unit ||
          Number(payload.current_stock) !== Number(orig.current_stock) ||
          Number(payload.alert_quantity) !== Number(orig.alert_quantity) ||
          Number(payload.purchase_price) !== Number(orig.purchase_price) ||
          Number(payload.selling_price) !== Number(orig.selling_price);

        if (!changed) continue;

        const res = await fetch(`/api/products/${productId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.message || `Error updating ${orig.name}`);
        updatedCount++;
      }

      this.stockReportEditMode = false;
      this.editingStockRowId = null;
      this.showToast(
        updatedCount > 0 ? `${updatedCount} stock item(s) updated successfully!` : 'No changes to save',
        updatedCount > 0 ? 'success' : 'info'
      );
      await this.renderStockReport(document.getElementById('content-container'));
    } catch (err) {
      alert('Error saving stock edits: ' + err.message);
      if (btn) {
        btn.disabled = false;
        btn.textContent = '💾 Save All Changes';
      }
    }
  },

  filterStockReportTable() {
    const tableBox = document.getElementById('stock-report-table-box');
    const search = document.getElementById('stock-report-search')?.value.toLowerCase() || '';
    const filter = document.getElementById('stock-report-status-filter')?.value || '';

    let items = this.currentStockProducts || [];

    if (search) {
      items = items.filter(p => p.name.toLowerCase().includes(search) || (p.sku && p.sku.toLowerCase().includes(search)));
    }

    if (filter === 'in_stock') {
      items = items.filter(p => p.current_stock > 0);
    } else if (filter === 'out_of_stock') {
      items = items.filter(p => p.current_stock <= 0);
    } else if (filter === 'low_stock') {
      items = items.filter(p => p.current_stock > 0 && p.current_stock <= p.alert_quantity);
    }

    const baseUnits = ['Piece', 'Pieces', 'Box', 'Pack', 'Bottle', 'Tube', 'Strip', 'Roll', 'Kit', 'Pair', 'Set'];

    tableBox.innerHTML = `
      <table id="printable-stock-table">
        <thead>
          <tr>
            <th>Product Name</th>
            <th>SKU</th>
            <th>Unit</th>
            <th>Current Stock</th>
            <th>Cost Price</th>
            <th>Selling Price</th>
            <th>Total Cost Value</th>
            <th>Total Sale Value</th>
            <th>Status</th>
            <th class="no-print" style="min-width:130px;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${items.length === 0 ? '<tr><td colspan="10" style="text-align:center; color:#64748b; padding:24px;">No products matching criteria.</td></tr>' :
            items.map(p => {
              const isEditing = this.stockReportEditMode || this.editingStockRowId === p.id;
              const statusBadge = this.getStockStatusBadge(p.current_stock, p.alert_quantity);

              if (isEditing) {
                const unitOptions = baseUnits.includes(p.unit) ? baseUnits : [p.unit, ...baseUnits];
                return `
                  <tr data-product-id="${p.id}" style="background:#f8fafc;">
                    <td>
                      <input type="text" class="stock-inline-input" data-field="name" value="${this.escapeHtml(p.name)}" style="min-width:150px; font-weight:600;">
                    </td>
                    <td>
                      <input type="text" class="stock-inline-input" data-field="sku" value="${this.escapeHtml(p.sku || '')}" style="width:105px; font-family:monospace;">
                    </td>
                    <td>
                      <select class="stock-inline-input" data-field="unit" style="width:88px;">
                        ${unitOptions.map(u => `<option value="${this.escapeHtml(u)}" ${u === p.unit ? 'selected' : ''}>${this.escapeHtml(u)}</option>`).join('')}
                      </select>
                    </td>
                    <td>
                      <input type="number" step="0.01" min="0" class="stock-inline-input" data-field="current_stock" value="${p.current_stock}" oninput="App.recalcStockRowPreview(this)" style="width:88px; font-weight:700;">
                      <div style="font-size:0.72rem; color:#64748b; margin-top:3px;">
                        Alert: <input type="number" step="1" min="0" class="stock-inline-input" data-field="alert_quantity" value="${p.alert_quantity}" oninput="App.recalcStockRowPreview(this)" style="width:52px; padding:2px 4px; font-size:0.75rem;">
                      </div>
                    </td>
                    <td>
                      <input type="number" step="0.01" min="0" class="stock-inline-input" data-field="purchase_price" value="${p.purchase_price}" oninput="App.recalcStockRowPreview(this)" style="width:92px;">
                    </td>
                    <td>
                      <input type="number" step="0.01" min="0" class="stock-inline-input" data-field="selling_price" value="${p.selling_price}" oninput="App.recalcStockRowPreview(this)" style="width:92px;">
                    </td>
                    <td class="stock-row-cost-val" style="font-weight:600;">Rs. ${this.formatNum(p.stock_cost_value)}</td>
                    <td class="stock-row-sale-val" style="font-weight:700; color:#059669;">Rs. ${this.formatNum(p.stock_sale_value)}</td>
                    <td class="stock-row-status">${statusBadge}</td>
                    <td class="no-print">
                      <div style="display:flex; gap:6px;">
                        <button class="btn btn-primary btn-sm" onclick="App.saveStockReportRow(${p.id}, this)">Save</button>
                        <button class="btn btn-secondary btn-sm" onclick="App.cancelStockReportRowEdit()">Cancel</button>
                      </div>
                    </td>
                  </tr>
                `;
              }

              return `
                <tr data-product-id="${p.id}">
                  <td style="font-weight:700;">${this.escapeHtml(p.name)}</td>
                  <td><span style="font-family:monospace; color:#64748b;">${this.escapeHtml(p.sku)}</span></td>
                  <td>${this.escapeHtml(p.unit)}</td>
                  <td style="font-weight:800; font-size:1.05rem; color:${p.current_stock > 0 ? '#059669' : '#64748b'};">
                    ${p.current_stock} ${this.escapeHtml(p.unit)}
                  </td>
                  <td>Rs. ${this.formatNum(p.purchase_price)}</td>
                  <td style="font-weight:700; color:var(--primary);">Rs. ${this.formatNum(p.selling_price)}</td>
                  <td style="font-weight:600;">Rs. ${p.stock_cost_value.toLocaleString()}</td>
                  <td style="font-weight:700; color:#059669;">Rs. ${p.stock_sale_value.toLocaleString()}</td>
                  <td>${statusBadge}</td>
                  <td class="no-print">
                    <button class="btn btn-secondary btn-sm" onclick="App.startStockReportRowEdit(${p.id})">✏️ Edit</button>
                  </td>
                </tr>
              `;
            }).join('')
          }
        </tbody>
      </table>
    `;
  },

  async printStockReport() {
    const tableEl = document.getElementById('printable-stock-table');
    if (!tableEl) return;

    const settings = await this.ensureSettingsLoaded();
    const tableClone = tableEl.cloneNode(true);
    tableClone.querySelectorAll('.no-print').forEach(el => el.remove());
    tableClone.querySelectorAll('input, select').forEach(el => {
      const span = document.createElement('span');
      span.textContent = el.value;
      el.replaceWith(span);
    });

    const headerHtml = this.buildDocumentHeaderHtml({
      settings,
      reportTitle: 'Current Warehouse Stock Report',
      dateLabel: `Generated Date: ${new Date().toLocaleString()}`
    });

    this.triggerPrint(`
      <div style="font-family:sans-serif; color:#0f172a;">
        ${headerHtml}
        ${tableClone.outerHTML}
      </div>
    `);
  },

  exportStockReportCsv() {
    const items = this.currentStockProducts || [];
    if (items.length === 0) return alert('No products to export');

    let csv = 'Product Name,SKU,Unit,Current Stock,Cost Price,Selling Price,Stock Cost Value,Stock Sale Value,Status\n';
    items.forEach(p => {
      csv += `"${p.name}","${p.sku}","${p.unit}",${p.current_stock},${p.purchase_price},${p.selling_price},${p.stock_cost_value},${p.stock_sale_value},"${p.stock_status}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ibrahim_Surgical_Stock_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  },

  // ----------------------------------------------------
  // 2. SALES / INVOICES VIEW
  // ----------------------------------------------------
  async renderSales(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <input type="text" id="sales-search" class="form-control" style="width:240px;" placeholder="Search invoice or dealer..." oninput="App.filterSales()">
            <select id="sales-status-filter" class="form-control" style="width:160px;" onchange="App.filterSales()">
              <option value="">All Statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="due">Due (Unpaid)</option>
            </select>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-secondary" onclick="App.printSalesReport()">🖨️ Print Sales Report</button>
            <button class="btn btn-primary" onclick="App.openNewSaleModal()">+ Create New Invoice</button>
          </div>
        </div>
        <div class="table-container" id="sales-table-container">
          <div style="padding:20px; text-align:center; color:#64748b;">Loading Sales Invoices...</div>
        </div>
      </div>
    `;
    this.filterSales();
  },

  async printSalesReport() {
    const tableEl = document.querySelector('#sales-table-container table');
    if (!tableEl) return;

    const settings = await this.ensureSettingsLoaded();
    const tableClone = tableEl.cloneNode(true);
    tableClone.querySelectorAll('.no-print').forEach(el => el.remove());

    const headerHtml = this.buildDocumentHeaderHtml({
      settings,
      reportTitle: 'Sales & Invoices Report',
      dateLabel: `Generated Date: ${new Date().toLocaleString()}`
    });

    this.triggerPrint(`
      <div style="font-family:sans-serif; color:#0f172a;">
        ${headerHtml}
        ${tableClone.outerHTML}
      </div>
    `);
  },

  async filterSales() {
    const tableBox = document.getElementById('sales-table-container');
    const status = document.getElementById('sales-status-filter')?.value || '';
    const search = document.getElementById('sales-search')?.value.toLowerCase() || '';

    try {
      const res = await fetch(`/api/sales?status=${status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      let sales = json.data;
      if (search) {
        sales = sales.filter(s => 
          (s.invoice_no && s.invoice_no.toLowerCase().includes(search)) ||
          (s.customer_name && s.customer_name.toLowerCase().includes(search))
        );
      }

      tableBox.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Dealer / Hospital</th>
              <th>Date</th>
              <th>Due Date</th>
              <th>Total Amount</th>
              <th>Paid</th>
              <th>Due Balance</th>
              <th>Profit</th>
              <th>Status</th>
              <th class="no-print">Action</th>
            </tr>
          </thead>
          <tbody>
            ${sales.length === 0 ? '<tr><td colspan="10" style="text-align:center; color:#64748b; padding:24px;">No invoices found.</td></tr>' :
              sales.map(s => `
                <tr>
                  <td style="font-weight:700; font-family:monospace; color:var(--primary);">${s.invoice_no}</td>
                  <td style="font-weight:600;">${s.customer_name}</td>
                  <td>${s.sale_date}</td>
                  <td>${s.due_date || '-'}</td>
                  <td style="font-weight:700;">Rs. ${s.total_amount.toLocaleString()}</td>
                  <td style="color:#059669;">Rs. ${s.paid_amount.toLocaleString()}</td>
                  <td style="color:#dc2626; font-weight:600;">Rs. ${s.due_amount.toLocaleString()}</td>
                  <td style="color:#0284c7; font-weight:600;">Rs. ${s.profit_total.toLocaleString()}</td>
                  <td>
                    <span class="badge ${s.payment_status === 'paid' ? 'badge-success' : (s.payment_status === 'partial' ? 'badge-warning' : 'badge-danger')}">
                      ${s.payment_status}
                    </span>
                  </td>
                  <td class="no-print">
                    <div style="display:flex; gap:6px;">
                      <button class="btn btn-secondary btn-sm" onclick="App.viewInvoice(${s.id})">Print / View</button>
                      <button class="btn btn-primary btn-sm" onclick="App.openEditInvoiceModal(${s.id})" title="Edit / Correct Invoice">Edit</button>
                      <button class="btn btn-danger btn-sm" onclick="App.confirmDeleteInvoice(${s.id}, '${s.invoice_no}')" title="Delete invoice & restore stock">Delete</button>
                    </div>
                  </td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      `;
    } catch (err) {
      tableBox.innerHTML = `<div style="padding:20px; color:#ef4444;">Error: ${err.message}</div>`;
    }
  },

  // ----------------------------------------------------
  // 3. PRODUCT LIST & MANUAL RATE / PROFIT / DISCOUNT SECTION
  // ----------------------------------------------------
  async renderProducts(container) {
    this.editingProductId = null;
    container.innerHTML = `
      <!-- Top Summary KPI Bar -->
      <div class="stats-grid" id="pl-summary-grid" style="margin-bottom:20px;">
        <div class="stat-card card-blue">
          <div>
            <div class="stat-label">Total Products</div>
            <div class="stat-value" id="pl-sum-count">0</div>
            <div class="stat-subtext" id="pl-sum-units">0 Total Stock Units</div>
          </div>
          <div class="stat-icon icon-blue">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
          </div>
        </div>

        <div class="stat-card card-indigo">
          <div>
            <div class="stat-label">Total Cost Value</div>
            <div class="stat-value" id="pl-sum-cost" style="color:#4f46e5;">Rs. 0</div>
            <div class="stat-subtext" id="pl-sum-cost-sub">Purchase cost across stock</div>
          </div>
          <div class="stat-icon icon-indigo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
          </div>
        </div>

        <div class="stat-card card-amber">
          <div>
            <div class="stat-label">After-Discount Total</div>
            <div class="stat-value" id="pl-sum-final" style="color:#0284c7;">Rs. 0</div>
            <div class="stat-subtext" id="pl-sum-discount">Total Discount Given: Rs. 0</div>
          </div>
          <div class="stat-icon icon-amber">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
          </div>
        </div>

        <div class="stat-card card-green" id="pl-sum-profit-card">
          <div>
            <div class="stat-label">Net Profit / Loss (Remaining)</div>
            <div class="stat-value" id="pl-sum-profit" style="color:#059669;">Rs. 0</div>
            <div class="stat-subtext" id="pl-sum-profit-sub">Final total after discount &amp; cost</div>
          </div>
          <div class="stat-icon icon-green" id="pl-sum-profit-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
          </div>
        </div>
      </div>

      <!-- Inline Manual Product Entry & Live Profit/Loss/Discount Calculator -->
      <div class="card product-entry-card" id="pl-entry-card">
        <div class="card-header" style="margin-bottom:14px;">
          <div>
            <h3 class="card-title" id="pl-form-title">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
              <span>Add Product Manually (Price, Profit / Loss &amp; Discount Calculator)</span>
            </h3>
            <div style="font-size:0.78rem; color:#64748b; margin-top:2px;">
              Enter product name, purchase cost, unit price, and discount to see live profit, loss, and net remaining total.
            </div>
          </div>
          <span class="badge badge-info" id="pl-mode-badge">New Product</span>
        </div>

        <form id="pl-inline-form" onsubmit="event.preventDefault(); App.saveInlineProduct();">
          <div class="product-entry-grid">
            <div class="form-group">
              <label class="form-label">Product Name *</label>
              <input type="text" id="pl-name" class="form-control" placeholder="e.g. Disposable Syringe 5cc" required oninput="App.updateInlineProductPreview()">
            </div>

            <div class="form-group">
              <label class="form-label">Unit</label>
              <input type="text" id="pl-unit" class="form-control" list="pl-unit-options" value="Pieces" placeholder="Pieces" oninput="App.updateInlineProductPreview()">
              <datalist id="pl-unit-options">
                <option value="Pieces">
                <option value="Box">
                <option value="Pack">
                <option value="Bottle">
                <option value="Pair">
                <option value="Roll">
                <option value="Vial">
                <option value="Tube">
              </datalist>
            </div>

            <div class="form-group">
              <label class="form-label">Cost Price (Rs.)</label>
              <input type="number" step="any" min="0" id="pl-cost" class="form-control" placeholder="0" oninput="App.updateInlineProductPreview()">
            </div>

            <div class="form-group">
              <label class="form-label">Unit Sale Price (Rs.) *</label>
              <input type="number" step="any" min="0" id="pl-sell" class="form-control" placeholder="0" oninput="App.updateInlineProductPreview()">
            </div>

            <div class="form-group">
              <label class="form-label">Discount Given</label>
              <div class="discount-input-group">
                <input type="number" step="any" min="0" id="pl-discount" class="form-control" placeholder="0" oninput="App.updateInlineProductPreview()">
                <select id="pl-discount-type" onchange="App.updateInlineProductPreview()">
                  <option value="rs">Rs.</option>
                  <option value="pct">%</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">Stock Qty</label>
              <input type="number" step="any" id="pl-qty" class="form-control" value="1" oninput="App.updateInlineProductPreview()">
            </div>

            <div class="form-group">
              <label class="form-label">SKU (Optional)</label>
              <input type="text" id="pl-sku" class="form-control" placeholder="Auto">
            </div>
          </div>

          <!-- Live Aligned Calculation Level -->
          <div class="product-calc-level">
            <div class="product-calc-metrics">
              <div class="calc-metric-box" id="pl-prev-gross-box">
                <span class="calc-metric-label">Profit / Loss (Before Disc.)</span>
                <span class="calc-metric-val" id="pl-prev-gross">Rs. 0</span>
                <span class="calc-metric-sub" id="pl-prev-gross-sub">Unit Price - Cost</span>
              </div>

              <div class="calc-metric-box is-discount">
                <span class="calc-metric-label">Discount Applied</span>
                <span class="calc-metric-val" id="pl-prev-disc">- Rs. 0</span>
                <span class="calc-metric-sub" id="pl-prev-disc-sub">0% off unit price</span>
              </div>

              <div class="calc-metric-box is-final">
                <span class="calc-metric-label">Final Unit Price</span>
                <span class="calc-metric-val" id="pl-prev-final">Rs. 0</span>
                <span class="calc-metric-sub">Net customer rate</span>
              </div>

              <div class="calc-metric-box" id="pl-prev-net-box">
                <span class="calc-metric-label">Net Profit / Loss (Per Unit)</span>
                <span class="calc-metric-val" id="pl-prev-net">Rs. 0</span>
                <span class="calc-metric-sub" id="pl-prev-net-sub">After discount bachat</span>
              </div>

              <div class="calc-metric-box" id="pl-prev-total-box">
                <span class="calc-metric-label">Total Remaining (× Qty)</span>
                <span class="calc-metric-val" id="pl-prev-total">Rs. 0</span>
                <span class="calc-metric-sub" id="pl-prev-total-sub">Net Sale: Rs. 0</span>
              </div>
            </div>

            <div class="product-entry-actions">
              <button type="button" class="btn btn-secondary" id="pl-reset-btn" onclick="App.resetInlineProductForm()">Clear</button>
              <button type="submit" class="btn btn-primary" id="pl-submit-btn">+ Add to Product List</button>
            </div>
          </div>
        </form>
      </div>

      <!-- Saved Product List Table -->
      <div class="card">
        <div class="card-header" style="flex-wrap:wrap; gap:12px;">
          <div style="display:flex; gap:12px; align-items:center; flex-wrap:wrap;">
            <input type="text" id="product-search" class="form-control" style="width:240px;" placeholder="Search product name or SKU..." oninput="App.filterProducts()">
            <select id="product-margin-filter" class="form-control" style="width:185px;" onchange="App.filterProducts()">
              <option value="all">All Products</option>
              <option value="profit">Profitable Only</option>
              <option value="loss">Loss Only</option>
              <option value="discounted">With Discount</option>
            </select>
            <button class="btn btn-secondary btn-sm" onclick="App.loadView('stock-report')">📊 Stock Report</button>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-secondary" onclick="App.exportReorderList()">Export CSV</button>
            <button class="btn btn-primary" onclick="App.printProductList()">🖨️ Print List</button>
          </div>
        </div>
        <div class="table-container" id="products-table-container">
          <div style="padding:20px; text-align:center; color:#64748b;">Loading Product List...</div>
        </div>
      </div>
    `;

    this.updateInlineProductPreview();
    await this.filterProducts();
    document.getElementById('pl-name')?.focus();
  },

  updateInlineProductPreview() {
    const m = this.computeProductMetrics({
      purchase_price: document.getElementById('pl-cost')?.value || 0,
      selling_price: document.getElementById('pl-sell')?.value || 0,
      discount_type: document.getElementById('pl-discount-type')?.value || 'rs',
      discount_value: document.getElementById('pl-discount')?.value || 0,
      current_stock: document.getElementById('pl-qty')?.value || 0
    });

    const grossBox = document.getElementById('pl-prev-gross-box');
    const grossEl = document.getElementById('pl-prev-gross');
    const grossSub = document.getElementById('pl-prev-gross-sub');
    if (grossEl && grossBox && grossSub) {
      grossBox.className = 'calc-metric-box ' + (m.grossDiff > 0 ? 'is-profit' : (m.grossDiff < 0 ? 'is-loss' : ''));
      grossEl.textContent = m.grossDiff >= 0 ? `+Rs. ${this.formatNum(m.grossDiff)}` : `-Rs. ${this.formatNum(Math.abs(m.grossDiff))}`;
      grossSub.textContent = m.grossDiff > 0 ? 'Profit before discount' : (m.grossDiff < 0 ? 'Loss before discount' : 'Break-even');
    }

    const discEl = document.getElementById('pl-prev-disc');
    const discSub = document.getElementById('pl-prev-disc-sub');
    if (discEl && discSub) {
      discEl.textContent = `-Rs. ${this.formatNum(m.discountRs)}`;
      discSub.textContent = `${this.formatNum(m.discountPct)}% off unit price`;
    }

    const finalEl = document.getElementById('pl-prev-final');
    if (finalEl) {
      finalEl.textContent = `Rs. ${this.formatNum(m.finalPrice)}`;
    }

    const netBox = document.getElementById('pl-prev-net-box');
    const netEl = document.getElementById('pl-prev-net');
    const netSub = document.getElementById('pl-prev-net-sub');
    if (netBox && netEl && netSub) {
      netBox.className = 'calc-metric-box ' + (m.netDiffPerUnit > 0 ? 'is-profit' : (m.netDiffPerUnit < 0 ? 'is-loss' : ''));
      netEl.textContent = m.netDiffPerUnit >= 0
        ? `+Rs. ${this.formatNum(m.netDiffPerUnit)}`
        : `-Rs. ${this.formatNum(Math.abs(m.netDiffPerUnit))}`;
      netSub.textContent = m.netDiffPerUnit > 0 ? 'PROFIT per unit' : (m.netDiffPerUnit < 0 ? 'LOSS per unit' : 'Break-even');
    }

    const totBox = document.getElementById('pl-prev-total-box');
    const totEl = document.getElementById('pl-prev-total');
    const totSub = document.getElementById('pl-prev-total-sub');
    if (totBox && totEl && totSub) {
      totBox.className = 'calc-metric-box ' + (m.totalNetProfit > 0 ? 'is-profit' : (m.totalNetProfit < 0 ? 'is-loss' : ''));
      totEl.textContent = m.totalNetProfit >= 0
        ? `+Rs. ${this.formatNum(m.totalNetProfit)}`
        : `-Rs. ${this.formatNum(Math.abs(m.totalNetProfit))}`;
      totSub.textContent = `Net Sale: Rs. ${this.formatNum(m.totalFinal)} (${this.formatNum(m.qty)} qty)`;
    }
  },

  resetInlineProductForm() {
    this.editingProductId = null;
    const form = document.getElementById('pl-inline-form');
    if (form) form.reset();
    const unitEl = document.getElementById('pl-unit');
    const qtyEl = document.getElementById('pl-qty');
    const discTypeEl = document.getElementById('pl-discount-type');
    if (unitEl) unitEl.value = 'Pieces';
    if (qtyEl) qtyEl.value = '1';
    if (discTypeEl) discTypeEl.value = 'rs';

    const card = document.getElementById('pl-entry-card');
    if (card) card.classList.remove('editing-mode');
    const titleEl = document.getElementById('pl-form-title');
    if (titleEl) {
      titleEl.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
        <span>Add Product Manually (Price, Profit / Loss &amp; Discount Calculator)</span>
      `;
    }
    const badge = document.getElementById('pl-mode-badge');
    if (badge) { badge.textContent = 'New Product'; badge.className = 'badge badge-info'; }
    const submitBtn = document.getElementById('pl-submit-btn');
    if (submitBtn) submitBtn.textContent = '+ Add to Product List';
    const resetBtn = document.getElementById('pl-reset-btn');
    if (resetBtn) resetBtn.textContent = 'Clear';

    this.updateInlineProductPreview();
    document.getElementById('pl-name')?.focus();
  },

  editProductInList(productId) {
    const prod = this.productsCache.find(p => p.id === productId);
    if (!prod) return;

    this.editingProductId = prod.id;
    document.getElementById('pl-name').value = prod.name || '';
    document.getElementById('pl-unit').value = prod.unit || 'Pieces';
    document.getElementById('pl-cost').value = prod.purchase_price ?? 0;
    document.getElementById('pl-sell').value = prod.selling_price ?? 0;
    document.getElementById('pl-discount').value = prod.discount_value ?? 0;
    document.getElementById('pl-discount-type').value = prod.discount_type === 'pct' ? 'pct' : 'rs';
    document.getElementById('pl-qty').value = prod.current_stock ?? 0;
    document.getElementById('pl-sku').value = prod.sku || '';

    const card = document.getElementById('pl-entry-card');
    if (card) {
      card.classList.add('editing-mode');
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    const titleEl = document.getElementById('pl-form-title');
    if (titleEl) {
      titleEl.innerHTML = `<span>Editing Product: ${this.escapeHtml(prod.name)}</span>`;
    }
    const badge = document.getElementById('pl-mode-badge');
    if (badge) { badge.textContent = 'Editing Mode'; badge.className = 'badge badge-warning'; }
    const submitBtn = document.getElementById('pl-submit-btn');
    if (submitBtn) submitBtn.textContent = 'Save Changes';
    const resetBtn = document.getElementById('pl-reset-btn');
    if (resetBtn) resetBtn.textContent = 'Cancel Edit';

    this.updateInlineProductPreview();
    document.getElementById('pl-name')?.focus();
  },

  async saveInlineProduct() {
    const name = (document.getElementById('pl-name')?.value || '').trim();
    if (!name) {
      alert('Product name is required');
      document.getElementById('pl-name')?.focus();
      return;
    }

    const payload = {
      name,
      sku: (document.getElementById('pl-sku')?.value || '').trim(),
      unit: (document.getElementById('pl-unit')?.value || '').trim() || 'Pieces',
      purchase_price: parseFloat(document.getElementById('pl-cost')?.value) || 0,
      selling_price: parseFloat(document.getElementById('pl-sell')?.value) || 0,
      discount_type: document.getElementById('pl-discount-type')?.value === 'pct' ? 'pct' : 'rs',
      discount_value: Math.max(0, parseFloat(document.getElementById('pl-discount')?.value) || 0),
      current_stock: parseFloat(document.getElementById('pl-qty')?.value) || 0
    };

    try {
      const isEdit = Boolean(this.editingProductId);
      const url = isEdit ? `/api/products/${this.editingProductId}` : '/api/products';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.success) {
        alert(json.message || 'Could not save product');
        return;
      }

      this.showToast(isEdit ? 'Product updated!' : 'Product added to list!', 'success');
      this.resetInlineProductForm();
      await this.filterProducts();
    } catch (err) {
      alert(err.message);
    }
  },

  async deleteProductFromList(productId) {
    const prod = this.productsCache.find(p => p.id === productId);
    const label = prod ? prod.name : 'this product';
    if (!confirm(`Delete "${label}" from the Product List?`)) return;

    try {
      const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) {
        alert(json.message || 'Could not delete product');
        return;
      }
      if (this.editingProductId === productId) {
        this.resetInlineProductForm();
      }
      this.showToast('Product removed from list', 'success');
      await this.filterProducts();
    } catch (err) {
      alert(err.message);
    }
  },

  async filterProducts() {
    const tableBox = document.getElementById('products-table-container');
    const search = document.getElementById('product-search')?.value || '';
    const marginFilter = document.getElementById('product-margin-filter')?.value || 'all';

    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(search)}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      this.productsCache = json.data;

      // Update overall summary cards from all fetched products matching search
      let sumUnits = 0, sumCost = 0, sumDisc = 0, sumFinal = 0, sumNetProfit = 0;
      const computedAll = this.productsCache.map(p => {
        const m = this.computeProductMetrics(p);
        sumUnits += m.qty;
        sumCost += m.totalCost;
        sumDisc += m.totalDiscount;
        sumFinal += m.totalFinal;
        sumNetProfit += m.totalNetProfit;
        return { p, m };
      });

      const elCount = document.getElementById('pl-sum-count');
      const elUnits = document.getElementById('pl-sum-units');
      const elCost = document.getElementById('pl-sum-cost');
      const elFinal = document.getElementById('pl-sum-final');
      const elDisc = document.getElementById('pl-sum-discount');
      const elProfit = document.getElementById('pl-sum-profit');
      const elProfitCard = document.getElementById('pl-sum-profit-card');
      const elProfitIcon = document.getElementById('pl-sum-profit-icon');
      const elProfitSub = document.getElementById('pl-sum-profit-sub');

      if (elCount) elCount.textContent = `${this.productsCache.length} Items`;
      if (elUnits) elUnits.textContent = `${this.formatNum(sumUnits)} Total Units in Stock`;
      if (elCost) elCost.textContent = `Rs. ${this.formatNum(sumCost)}`;
      if (elFinal) elFinal.textContent = `Rs. ${this.formatNum(sumFinal)}`;
      if (elDisc) elDisc.textContent = `Total Discount Given: Rs. ${this.formatNum(sumDisc)}`;
      if (elProfit && elProfitCard && elProfitIcon && elProfitSub) {
        const isLoss = sumNetProfit < 0;
        elProfit.textContent = isLoss
          ? `-Rs. ${this.formatNum(Math.abs(sumNetProfit))}`
          : `+Rs. ${this.formatNum(sumNetProfit)}`;
        elProfit.style.color = isLoss ? '#dc2626' : '#059669';
        elProfitCard.className = `stat-card ${isLoss ? 'card-red' : 'card-green'}`;
        elProfitIcon.className = `stat-icon ${isLoss ? 'icon-red' : 'icon-green'}`;
        elProfitSub.textContent = isLoss ? 'Net Loss across stock' : 'Net Bachat after discount & cost';
      }

      const filtered = computedAll.filter(({ m }) => {
        if (marginFilter === 'profit') return m.netDiffPerUnit > 0;
        if (marginFilter === 'loss') return m.netDiffPerUnit < 0;
        if (marginFilter === 'discounted') return m.discountRs > 0;
        return true;
      });

      let fQty = 0, fCost = 0, fGross = 0, fDisc = 0, fFinal = 0, fNetProfit = 0;
      filtered.forEach(({ m }) => {
        fQty += m.qty;
        fCost += m.totalCost;
        fGross += m.totalGross;
        fDisc += m.totalDiscount;
        fFinal += m.totalFinal;
        fNetProfit += m.totalNetProfit;
      });

      tableBox.innerHTML = `
        <table class="pl-table">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product Name</th>
              <th>Unit</th>
              <th class="num-col">Cost Price</th>
              <th class="num-col">Unit Price</th>
              <th class="num-col">Gross Profit / Loss</th>
              <th class="num-col">Discount</th>
              <th class="num-col">Final Price</th>
              <th class="num-col">Net Profit / Loss</th>
              <th class="num-col">Qty</th>
              <th class="num-col">Total Remaining</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length === 0 ? '<tr><td colspan="12" style="text-align:center; color:#64748b; padding:28px;">No products added yet. Use the form above to add products manually.</td></tr>' :
              filtered.map(({ p, m }) => {
                const grossColor = m.grossDiff > 0 ? '#059669' : (m.grossDiff < 0 ? '#dc2626' : '#64748b');
                const grossText = m.grossDiff >= 0 ? `+Rs. ${this.formatNum(m.grossDiff)}` : `-Rs. ${this.formatNum(Math.abs(m.grossDiff))}`;
                const netBadge = m.netDiffPerUnit > 0
                  ? `<span class="badge badge-success">Profit +Rs. ${this.formatNum(m.netDiffPerUnit)}</span>`
                  : (m.netDiffPerUnit < 0
                    ? `<span class="badge badge-danger">Loss -Rs. ${this.formatNum(Math.abs(m.netDiffPerUnit))}</span>`
                    : `<span class="badge badge-info">Rs. 0</span>`);
                const totColor = m.totalNetProfit > 0 ? '#059669' : (m.totalNetProfit < 0 ? '#dc2626' : '#64748b');
                const totText = m.totalNetProfit >= 0
                  ? `+Rs. ${this.formatNum(m.totalNetProfit)}`
                  : `-Rs. ${this.formatNum(Math.abs(m.totalNetProfit))}`;

                return `
                  <tr>
                    <td style="font-family:monospace; font-weight:600; color:#64748b;">${this.escapeHtml(p.sku)}</td>
                    <td style="font-weight:700; color:var(--slate-900);">${this.escapeHtml(p.name)}</td>
                    <td><span class="badge badge-info">${this.escapeHtml(p.unit)}</span></td>
                    <td class="num-col">Rs. ${this.formatNum(m.cost)}</td>
                    <td class="num-col" style="font-weight:700;">Rs. ${this.formatNum(m.unitPrice)}</td>
                    <td class="num-col" style="font-weight:700; color:${grossColor};">${grossText}</td>
                    <td class="num-col" style="color:#d97706; font-weight:700;">
                      ${m.discountRs > 0 ? `-Rs. ${this.formatNum(m.discountRs)} <span style="font-size:0.75rem; color:#64748b;">(${this.formatNum(m.discountPct)}%)</span>` : '<span style="color:#94a3b8;">Rs. 0</span>'}
                    </td>
                    <td class="num-col" style="font-weight:800; color:var(--primary);">Rs. ${this.formatNum(m.finalPrice)}</td>
                    <td class="num-col">${netBadge}</td>
                    <td class="num-col"><span class="badge ${m.qty > 0 ? 'badge-success' : 'badge-warning'}">${this.formatNum(m.qty)}</span></td>
                    <td class="num-col">
                      <div style="font-weight:800; color:${totColor};">${totText}</div>
                      <div style="font-size:0.72rem; color:#64748b;">Sale: Rs. ${this.formatNum(m.totalFinal)}</div>
                    </td>
                    <td style="white-space:nowrap;">
                      <button class="btn btn-secondary btn-sm" onclick="App.editProductInList(${p.id})">Edit</button>
                      <button class="btn btn-danger btn-sm" onclick="App.deleteProductFromList(${p.id})">Delete</button>
                    </td>
                  </tr>
                `;
              }).join('')
            }
          </tbody>
          ${filtered.length > 0 ? `
            <tfoot>
              <tr>
                <td colspan="3">TOTAL (${filtered.length} Products)</td>
                <td class="num-col">Rs. ${this.formatNum(fCost)}</td>
                <td class="num-col">Rs. ${this.formatNum(fGross)}</td>
                <td class="num-col" style="color:${(fGross - fCost) >= 0 ? '#059669' : '#dc2626'};">
                  ${(fGross - fCost) >= 0 ? '+' : '-'}Rs. ${this.formatNum(Math.abs(fGross - fCost))}
                </td>
                <td class="num-col" style="color:#d97706;">-Rs. ${this.formatNum(fDisc)}</td>
                <td class="num-col" style="color:var(--primary);">Rs. ${this.formatNum(fFinal)}</td>
                <td class="num-col" style="color:${fNetProfit >= 0 ? '#059669' : '#dc2626'};">
                  ${fNetProfit >= 0 ? '+' : '-'}Rs. ${this.formatNum(Math.abs(fNetProfit))}
                </td>
                <td class="num-col">${this.formatNum(fQty)}</td>
                <td class="num-col" style="color:${fNetProfit >= 0 ? '#059669' : '#dc2626'};">
                  ${fNetProfit >= 0 ? '+' : '-'}Rs. ${this.formatNum(Math.abs(fNetProfit))}
                </td>
                <td></td>
              </tr>
            </tfoot>
          ` : ''}
        </table>
      `;
    } catch (err) {
      tableBox.innerHTML = `<div style="padding:20px; color:#ef4444;">Error: ${err.message}</div>`;
    }
  },

  async printProductList() {
    if (!this.productsCache || this.productsCache.length === 0) {
      alert('No products to print yet!');
      return;
    }

    const settings = await this.ensureSettingsLoaded();

    let totCost = 0, totFinal = 0, totDisc = 0, totProfit = 0;
    const rowsHtml = this.productsCache.map((p, idx) => {
      const m = this.computeProductMetrics(p);
      totCost += m.totalCost;
      totDisc += m.totalDiscount;
      totFinal += m.totalFinal;
      totProfit += m.totalNetProfit;
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${this.escapeHtml(p.sku)}</td>
          <td style="font-weight:700;">${this.escapeHtml(p.name)}</td>
          <td>${this.escapeHtml(p.unit)}</td>
          <td style="text-align:right;">Rs. ${this.formatNum(m.cost)}</td>
          <td style="text-align:right;">Rs. ${this.formatNum(m.unitPrice)}</td>
          <td style="text-align:right;">Rs. ${this.formatNum(m.discountRs)} (${this.formatNum(m.discountPct)}%)</td>
          <td style="text-align:right; font-weight:700;">Rs. ${this.formatNum(m.finalPrice)}</td>
          <td style="text-align:right; color:${m.netDiffPerUnit >= 0 ? '#059669' : '#dc2626'}; font-weight:700;">
            ${m.netDiffPerUnit >= 0 ? '+' : '-'}Rs. ${this.formatNum(Math.abs(m.netDiffPerUnit))}
          </td>
          <td style="text-align:right;">${this.formatNum(m.qty)}</td>
          <td style="text-align:right; font-weight:700;">
            ${m.totalNetProfit >= 0 ? '+' : '-'}Rs. ${this.formatNum(Math.abs(m.totalNetProfit))}
          </td>
        </tr>
      `;
    }).join('');

    const headerHtml = this.buildDocumentHeaderHtml({
      settings,
      reportTitle: 'Product List & Margin Report',
      dateLabel: `Generated Date: ${new Date().toLocaleString()}`,
      extraRightHtml: `<div style="font-size:0.8rem; color:#64748b; margin-top:2px;">Total Items: ${this.productsCache.length}</div>`
    });

    this.triggerPrint(`
      <div style="font-family:Arial, sans-serif; color:#0f172a;">
        ${headerHtml}
        <table style="width:100%; border-collapse:collapse; font-size:12px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="border:1px solid #cbd5e1; padding:6px;">#</th>
              <th style="border:1px solid #cbd5e1; padding:6px;">SKU</th>
              <th style="border:1px solid #cbd5e1; padding:6px; text-align:left;">Product</th>
              <th style="border:1px solid #cbd5e1; padding:6px;">Unit</th>
              <th style="border:1px solid #cbd5e1; padding:6px;">Cost</th>
              <th style="border:1px solid #cbd5e1; padding:6px;">Unit Price</th>
              <th style="border:1px solid #cbd5e1; padding:6px;">Discount</th>
              <th style="border:1px solid #cbd5e1; padding:6px;">Final Price</th>
              <th style="border:1px solid #cbd5e1; padding:6px;">Profit/Loss</th>
              <th style="border:1px solid #cbd5e1; padding:6px;">Qty</th>
              <th style="border:1px solid #cbd5e1; padding:6px;">Total Bachat</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
          <tfoot>
            <tr style="background:#f8fafc; font-weight:bold;">
              <td colspan="4" style="border:1px solid #cbd5e1; padding:6px;">TOTALS</td>
              <td style="border:1px solid #cbd5e1; padding:6px; text-align:right;">Rs. ${this.formatNum(totCost)}</td>
              <td style="border:1px solid #cbd5e1; padding:6px;"></td>
              <td style="border:1px solid #cbd5e1; padding:6px; text-align:right;">Rs. ${this.formatNum(totDisc)}</td>
              <td style="border:1px solid #cbd5e1; padding:6px; text-align:right;">Rs. ${this.formatNum(totFinal)}</td>
              <td style="border:1px solid #cbd5e1; padding:6px;"></td>
              <td style="border:1px solid #cbd5e1; padding:6px;"></td>
              <td style="border:1px solid #cbd5e1; padding:6px; text-align:right;">${totProfit >= 0 ? '+' : '-'}Rs. ${this.formatNum(Math.abs(totProfit))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    `);
  },

  // ----------------------------------------------------
  // 4. DEALERS & HOSPITALS VIEW (WITH CUSTOM RATE LISTS)
  // ----------------------------------------------------
  async renderCustomers(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div style="display:flex; gap:12px; align-items:center;">
            <input type="text" id="customer-search" class="form-control" style="width:260px;" placeholder="Search dealers & hospitals..." oninput="App.filterCustomers()">
            <label style="display:flex; align-items:center; gap:6px; font-size:0.88rem; font-weight:600; cursor:pointer;">
              <input type="checkbox" id="customer-dues-only" onchange="App.filterCustomers()">
              <span style="color:#dc2626;">Only With Dues</span>
            </label>
          </div>
          <button class="btn btn-primary" onclick="App.openAddCustomerModal()">+ Add New Dealer / Hospital</button>
        </div>
        <div class="table-container" id="customers-table-container">
          <div style="padding:20px; text-align:center; color:#64748b;">Loading Dealers...</div>
        </div>
      </div>
    `;
    this.filterCustomers();
  },

  async filterCustomers() {
    const tableBox = document.getElementById('customers-table-container');
    const search = document.getElementById('customer-search')?.value || '';
    const withDues = document.getElementById('customer-dues-only')?.checked ? 'true' : 'false';

    try {
      const res = await fetch(`/api/customers?search=${encodeURIComponent(search)}&with_dues=${withDues}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      this.customersCache = json.data;
      tableBox.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Dealer / Hospital Name</th>
              <th>Contact Person</th>
              <th>Mobile / Phone</th>
              <th>Address</th>
              <th>Pay Term</th>
              <th>Outstanding Balance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${this.customersCache.length === 0 ? '<tr><td colspan="7" style="text-align:center; color:#64748b; padding:24px;">No dealers or hospitals added yet. Click "+ Add New Dealer / Hospital" above to add your companies.</td></tr>' :
              this.customersCache.map(c => `
                <tr>
                  <td style="font-weight:700;">${c.business_name || c.name}</td>
                  <td style="color:#64748b;">${c.name !== c.business_name ? c.name : '-'}</td>
                  <td>${c.mobile || '-'}</td>
                  <td>${c.address || '-'}</td>
                  <td><span class="badge badge-info">${c.pay_term_days || 30} Days</span></td>
                  <td style="font-weight:800; font-size:1.05rem; color:${c.balance > 0 ? '#dc2626' : '#059669'};">
                    Rs. ${c.balance.toLocaleString()}
                  </td>
                  <td>
                    <div style="display:flex; gap:6px;">
                      <button class="btn btn-primary btn-sm" onclick="App.openDealerRateListModal(${c.id}, '${(c.business_name || c.name).replace(/'/g, "\\'")}')" title="Manage special rates for this company">
                        Rates
                      </button>
                      <button class="btn btn-secondary btn-sm" onclick="App.openEditCustomerModal(${c.id})" title="Edit Dealer / Hospital details & balance">
                        Edit
                      </button>
                      <button class="btn btn-success btn-sm" onclick="App.openReceivePaymentModal(${c.id}, '${(c.business_name || c.name).replace(/'/g, "\\'")}', ${c.balance})">
                        Receive
                      </button>
                      <button class="btn btn-secondary btn-sm" onclick="App.viewCustomerLedger(${c.id})">
                        Ledger
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      `;
    } catch (err) {
      tableBox.innerHTML = `<div style="padding:20px; color:#ef4444;">Error: ${err.message}</div>`;
    }
  },

  // ----------------------------------------------------
  // DEALER SPECIFIC RATE LIST MODAL
  // ----------------------------------------------------
  async openDealerRateListModal(customerId, customerName) {
    const [pRes, rRes] = await Promise.all([
      fetch('/api/products'),
      fetch(`/api/customers/${customerId}/rates`)
    ]);
    const pJson = await pRes.json();
    const rJson = await rRes.json();

    const products = pJson.data || [];
    const customRateMap = rJson.data?.map || {};

    const html = `
      <div class="modal-header">
        <div>
          <h3 class="card-title">Custom Rate List for: ${customerName}</h3>
          <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">Set agreed contract rates for this specific dealer / hospital. Rates are also saved automatically whenever you create an invoice.</div>
        </div>
        <button style="border:none; background:none; font-size:1.5rem; cursor:pointer;" onclick="App.closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:12px;">
          <input type="text" id="rate-modal-search" class="form-control" placeholder="Search product to set custom rate..." oninput="App.filterRateModalTable()">
        </div>
        <div class="table-container" style="max-height: 400px; overflow-y:auto;">
          <table id="rate-modal-table">
            <thead>
              <tr>
                <th>Product Name</th>
                <th>Unit</th>
                <th>Base Selling Price</th>
                <th>Agreed Rate for this Company</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${products.map(p => {
                const currentCustom = customRateMap[p.id] !== undefined ? customRateMap[p.id] : p.selling_price;
                const isCustomized = customRateMap[p.id] !== undefined;

                return `
                  <tr class="rate-modal-row" data-name="${p.name.toLowerCase()}">
                    <td style="font-weight:600;">${p.name}</td>
                    <td><span class="badge badge-info">${p.unit}</span></td>
                    <td style="color:#64748b;">Rs. ${p.selling_price}</td>
                    <td>
                      <input type="number" id="rate-input-${p.id}" class="form-control" style="width:120px; font-weight:700; color:${isCustomized ? 'var(--primary)' : 'inherit'};" value="${currentCustom}">
                    </td>
                    <td>
                      <button class="btn btn-secondary btn-sm" onclick="App.saveIndividualRate(${customerId}, ${p.id})">Save Rate</button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="App.closeModal()">Done</button>
      </div>
    `;

    this.openModal(html);
  },

  filterRateModalTable() {
    const q = document.getElementById('rate-modal-search').value.toLowerCase();
    document.querySelectorAll('.rate-modal-row').forEach(r => {
      const name = r.getAttribute('data-name');
      r.style.display = name.includes(q) ? '' : 'none';
    });
  },

  async saveIndividualRate(customerId, productId) {
    const input = document.getElementById(`rate-input-${productId}`);
    const customPrice = parseFloat(input.value) || 0;

    try {
      const res = await fetch(`/api/customers/${customerId}/rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, custom_price: customPrice })
      });
      const json = await res.json();
      if (json.success) {
        this.showToast('Custom rate saved for this company!', 'success');
      }
    } catch (err) {
      alert(err.message);
    }
  },

  // ----------------------------------------------------
  // 5. PURCHASES VIEW (SUPPLIERS)
  // ----------------------------------------------------
  async renderPurchases(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Stock Purchases from Suppliers & Distributors</h3>
            <div style="font-size:0.85rem; color:#64748b; margin-top:4px;">Record stock received from medicine & surgical distributors. Auto-updates warehouse inventory.</div>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-secondary" onclick="App.printPurchaseReport()">🖨️ Print Purchase Report</button>
            <button class="btn btn-secondary" onclick="App.openAddSupplierModal()">+ Add New Supplier</button>
            <button class="btn btn-primary" onclick="App.openAddPurchaseModal()">+ Record Stock Purchase</button>
          </div>
        </div>
        <div class="table-container" id="purchases-table-container">
          <div style="padding:20px; text-align:center; color:#64748b;">Loading Stock Purchases...</div>
        </div>
      </div>
    `;

    try {
      const res = await fetch('/api/purchases');
      const json = await res.json();
      const purchases = json.data || [];
      this.currentPurchasesList = purchases;

      document.getElementById('purchases-table-container').innerHTML = `
        <table>
          <thead>
            <tr>
              <th>PO #</th>
              <th>Supplier / Company</th>
              <th>Bill Date</th>
              <th>Updated On</th>
              <th>Total Amount</th>
              <th>Paid Amount</th>
              <th>Due Balance</th>
              <th>Method</th>
              <th>Notes</th>
              <th class="no-print" style="min-width:145px;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${purchases.length === 0 ? '<tr><td colspan="10" style="text-align:center; color:#64748b; padding:24px;">No purchases recorded yet. Click "+ Record Stock Purchase" or "+ Add New Supplier" above to start.</td></tr>' :
              purchases.map(p => {
                const updatedHtml = p.updated_at
                  ? `<div style="display:inline-flex; flex-direction:column; gap:2px;">
                       <span class="badge badge-warning" style="font-size:0.75rem; white-space:nowrap;">${this.escapeHtml(String(p.updated_at).split(' ')[0])}</span>
                       ${String(p.updated_at).includes(' ') ? `<span style="font-size:0.72rem; color:#92400e;">${this.escapeHtml(String(p.updated_at).split(' ')[1])}</span>` : ''}
                     </div>`
                  : '<span style="color:#94a3b8; font-size:0.8rem;">-</span>';

                return `
                  <tr>
                    <td style="font-family:monospace; font-weight:700; color:var(--primary);">${this.escapeHtml(p.purchase_no)}</td>
                    <td style="font-weight:700;">${this.escapeHtml(p.supplier_name)}</td>
                    <td style="white-space:nowrap; font-weight:600;">${this.escapeHtml(p.purchase_date)}</td>
                    <td>${updatedHtml}</td>
                    <td style="font-weight:700;">Rs. ${p.total_amount.toLocaleString()}</td>
                    <td style="color:#059669;">Rs. ${p.paid_amount.toLocaleString()}</td>
                    <td style="color:#dc2626;">Rs. ${p.due_amount.toLocaleString()}</td>
                    <td>${this.escapeHtml(p.payment_method)}</td>
                    <td style="color:#64748b;">${this.escapeHtml(p.notes || '-')}</td>
                    <td class="no-print">
                      <div style="display:flex; gap:6px;">
                        <button class="btn btn-secondary btn-sm" onclick="App.viewPurchase(${p.id})">View</button>
                        <button class="btn btn-primary btn-sm" onclick="App.openEditPurchaseModal(${p.id})" title="Edit Purchase Bill">Edit</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join('')
            }
          </tbody>
        </table>
      `;
    } catch (err) {
      document.getElementById('purchases-table-container').innerHTML = `<div style="padding:20px; color:#ef4444;">Error: ${err.message}</div>`;
    }
  },

  async printPurchaseReport() {
    const tableEl = document.querySelector('#purchases-table-container table');
    if (!tableEl) return;

    const settings = await this.ensureSettingsLoaded();
    const tableClone = tableEl.cloneNode(true);
    tableClone.querySelectorAll('.no-print').forEach(el => el.remove());

    const headerHtml = this.buildDocumentHeaderHtml({
      settings,
      reportTitle: 'Stock Purchases Report',
      dateLabel: `Generated Date: ${new Date().toLocaleString()}`
    });

    this.triggerPrint(`
      <div style="font-family:sans-serif; color:#0f172a;">
        ${headerHtml}
        ${tableClone.outerHTML}
      </div>
    `);
  },

  async viewPurchase(purchaseId) {
    try {
      const res = await fetch(`/api/purchases/${purchaseId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      const { purchase, items, supplier, settings } = json.data;
      this.currentViewingPurchaseNo = purchase.purchase_no;
      const store = settings || {};
      this.storeSettingsCache = store;

      const updatedBadge = purchase.updated_at
        ? `<div style="margin-top:5px; display:inline-block; background:#fef3c7; color:#92400e; border:1px solid #f59e0b; border-radius:6px; padding:3px 9px; font-size:0.78rem; font-weight:700;">Updated On: ${this.escapeHtml(purchase.updated_at)}</div>`
        : '';

      const purchaseHtml = `
        <div id="printable-purchase" style="background:#fff; padding:24px; color:#0f172a; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
          ${this.buildDocumentHeaderHtml({
            settings: store,
            reportTitle: 'Stock Purchase Voucher',
            docNo: purchase.purchase_no,
            dateLabel: `Bill Date: ${purchase.purchase_date}`,
            extraRightHtml: updatedBadge
          })}

          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px; margin-bottom:18px;">
            <div style="font-size:0.72rem; text-transform:uppercase; letter-spacing:0.6px; color:#64748b; font-weight:700;">SUPPLIER / DISTRIBUTOR:</div>
            <div style="font-size:1.08rem; font-weight:800; margin-top:2px;">${this.escapeHtml(purchase.supplier_name || supplier?.name || '-')}</div>
            ${supplier && supplier.business_name && supplier.business_name !== supplier.name ? `<div style="font-size:0.86rem; color:#475569;">Company: ${this.escapeHtml(supplier.business_name)}</div>` : ''}
            ${supplier && supplier.mobile ? `<div style="font-size:0.85rem; color:#475569;">Contact: ${this.escapeHtml(supplier.mobile)}</div>` : ''}
            ${supplier && supplier.address ? `<div style="font-size:0.82rem; color:#64748b;">${this.escapeHtml(supplier.address)}</div>` : ''}
          </div>

          <table style="width:100%; border-collapse:collapse; margin-bottom:18px;">
            <thead>
              <tr style="background:#f1f5f9; border-bottom:2px solid #cbd5e1;">
                <th style="padding:9px; text-align:left; font-size:0.76rem; color:#475569;">#</th>
                <th style="padding:9px; text-align:left; font-size:0.76rem; color:#475569;">ITEM DESCRIPTION</th>
                <th style="padding:9px; text-align:right; font-size:0.76rem; color:#475569;">QTY</th>
                <th style="padding:9px; text-align:right; font-size:0.76rem; color:#475569;">COST RATE</th>
                <th style="padding:9px; text-align:right; font-size:0.76rem; color:#475569;">AMOUNT</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it, idx) => `
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:9px;">${idx + 1}</td>
                  <td style="padding:9px; font-weight:700;">
                    ${this.escapeHtml(it.product_name)}
                    ${it.sku ? `<span style="font-weight:400; color:#64748b; font-size:0.82rem;"> (${this.escapeHtml(it.sku)})</span>` : ''}
                  </td>
                  <td style="padding:9px; text-align:right;">${it.quantity} ${this.escapeHtml(it.unit || 'Unit')}</td>
                  <td style="padding:9px; text-align:right;">Rs. ${this.formatNum(it.purchase_price)}</td>
                  <td style="padding:9px; text-align:right; font-weight:700;">Rs. ${Number(it.line_total || 0).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap;">
            <div style="flex:1; min-width:200px;">
              ${purchase.notes ? `
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:10px 12px; font-size:0.84rem; color:#475569;">
                  <strong>Notes:</strong> ${this.escapeHtml(purchase.notes)}
                </div>
              ` : ''}
            </div>
            <div style="width:270px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px;">
              <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:0.9rem;">
                <span style="color:#475569;">Total Bill Amount:</span>
                <strong>Rs. ${Number(purchase.total_amount || 0).toLocaleString()}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:0.9rem; color:#059669;">
                <span>Paid (${this.escapeHtml(purchase.payment_method)}):</span>
                <strong>Rs. ${Number(purchase.paid_amount || 0).toLocaleString()}</strong>
              </div>
              <div style="display:flex; justify-content:space-between; padding-top:6px; border-top:1px solid #cbd5e1; font-size:0.98rem; color:${purchase.due_amount > 0 ? '#dc2626' : '#0f172a'}; font-weight:800;">
                <span>Due Balance:</span>
                <span>Rs. ${Number(purchase.due_amount || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      `;

      const modalHtml = `
        <div class="modal-header">
          <h3 class="card-title">Purchase Bill Details (${this.escapeHtml(purchase.purchase_no)})</h3>
          <button style="border:none; background:none; font-size:1.5rem; cursor:pointer;" onclick="App.closeModal()">&times;</button>
        </div>
        <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
          ${purchaseHtml}
        </div>
        <div class="modal-footer" style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; gap:8px;">
            <button class="btn btn-warning" onclick="App.openEditPurchaseModal(${purchase.id})">✏️ Edit Purchase</button>
            <button class="btn btn-danger" onclick="App.confirmDeletePurchase(${purchase.id})">🗑️ Delete Purchase</button>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
            <button class="btn btn-primary" onclick="App.printCurrentPurchase()">🖨️ Print Purchase Bill</button>
          </div>
        </div>
      `;

      this.openModal(modalHtml);
    } catch (err) {
      alert('Error loading purchase bill: ' + err.message);
    }
  },

  printCurrentPurchase() {
    const el = document.getElementById('printable-purchase');
    if (!el) return;
    this.triggerPrint(el.innerHTML);
  },

  buildEditPurchaseRowHtml(products, item = null) {
    const selectedId = item ? item.product_id : '';
    const qty = item ? item.quantity : 1;
    const rate = item ? item.purchase_price : 0;
    const lineTotal = (parseFloat(qty) || 0) * (parseFloat(rate) || 0);

    return `
      <div class="edit-po-item-row" style="display:grid; grid-template-columns: 2fr 0.9fr 1fr 1fr 36px; gap:8px; margin-bottom:8px; align-items:center;">
        <select class="form-control edit-po-item-prod" onchange="App.onEditPoProductSelect(this)">
          <option value="">-- Choose Item --</option>
          ${products.map(p => `
            <option value="${p.id}" data-cost="${p.purchase_price}" ${Number(p.id) === Number(selectedId) ? 'selected' : ''}>
              ${this.escapeHtml(p.name)} (Stock: ${p.current_stock})
            </option>
          `).join('')}
        </select>
        <input type="number" step="0.01" min="0.01" class="form-control edit-po-item-qty" value="${qty}" placeholder="Qty" oninput="App.recalcEditPurchaseTotals()">
        <input type="number" step="0.01" min="0" class="form-control edit-po-item-cost" value="${rate}" placeholder="Cost" oninput="App.recalcEditPurchaseTotals()">
        <div class="edit-po-line-total" style="font-weight:700; text-align:right; color:#0f172a;">Rs. ${this.formatNum(lineTotal)}</div>
        <button type="button" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;" onclick="this.parentElement.remove(); App.recalcEditPurchaseTotals();">&times;</button>
      </div>
    `;
  },

  async openEditPurchaseModal(purchaseId) {
    try {
      const [poRes, prodsRes, supRes] = await Promise.all([
        fetch(`/api/purchases/${purchaseId}`),
        fetch('/api/products'),
        fetch('/api/suppliers')
      ]);
      const [poJson, prodsJson, supJson] = await Promise.all([poRes.json(), prodsRes.json(), supRes.json()]);
      if (!poJson.success) throw new Error(poJson.message);

      const { purchase, items } = poJson.data;
      const products = prodsJson.data || [];
      const suppliers = supJson.data || [];
      this.productsCache = products;

      const html = `
        <div class="modal-header">
          <div>
            <h3 class="card-title">✏️ Edit Purchase (${this.escapeHtml(purchase.purchase_no)})</h3>
            <div style="font-size:0.82rem; color:#64748b;">
              Original Bill Date (<strong>${this.escapeHtml(purchase.purchase_date)}</strong>) stays unchanged; saving records today's update date separately.
            </div>
          </div>
          <button style="border:none; background:none; font-size:1.5rem; cursor:pointer;" onclick="App.closeModal()">&times;</button>
        </div>
        <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Supplier / Distributor *</label>
              <select id="edit-po-supplier" class="form-control">
                ${suppliers.map(s => `
                  <option value="${s.id}" ${Number(s.id) === Number(purchase.supplier_id) ? 'selected' : ''}>
                    ${this.escapeHtml(s.name)} ${s.business_name && s.business_name !== s.name ? `(${this.escapeHtml(s.business_name)})` : ''}
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">PO / Bill #</label>
              <input type="text" id="edit-po-no" class="form-control" value="${this.escapeHtml(purchase.purchase_no)}">
            </div>
            <div class="form-group">
              <label class="form-label">Original Bill Date (Preserved)</label>
              <input type="text" class="form-control" value="${this.escapeHtml(purchase.purchase_date)}" disabled style="background:#f1f5f9; color:#334155; font-weight:700;">
              ${purchase.updated_at ? `<div style="font-size:0.76rem; color:#b45309; margin-top:4px;">Last Updated: ${this.escapeHtml(purchase.updated_at)}</div>` : ''}
            </div>
          </div>

          <div style="margin-top:12px;">
            <div style="display:grid; grid-template-columns: 2fr 0.9fr 1fr 1fr 36px; gap:8px; font-size:0.75rem; font-weight:700; color:#64748b; text-transform:uppercase; margin-bottom:6px;">
              <span>Product</span>
              <span>Qty</span>
              <span>Cost Rate</span>
              <span style="text-align:right;">Line Total</span>
              <span></span>
            </div>
            <div id="edit-po-items-container">
              ${items.map(it => this.buildEditPurchaseRowHtml(products, it)).join('')}
            </div>
            <button type="button" class="btn btn-secondary btn-sm" style="margin-top:6px;" onclick="App.addEditPurchaseRow()">+ Add Item Row</button>
          </div>

          <div class="form-row" style="margin-top:16px;">
            <div class="form-group">
              <label class="form-label">Payment Method</label>
              <select id="edit-po-method" class="form-control">
                <option value="Cash" ${purchase.payment_method === 'Cash' ? 'selected' : ''}>Cash</option>
                <option value="Bank" ${purchase.payment_method === 'Bank' ? 'selected' : ''}>Bank Transfer</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Amount Paid (Rs.)</label>
              <input type="number" step="0.01" min="0" id="edit-po-paid" class="form-control" value="${purchase.paid_amount}" oninput="App.recalcEditPurchaseTotals()">
            </div>
            <div class="form-group">
              <label class="form-label">Notes</label>
              <input type="text" id="edit-po-notes" class="form-control" value="${this.escapeHtml(purchase.notes || '')}" placeholder="Optional bill notes...">
            </div>
          </div>

          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-top:8px;">
            <div>Bill Total: <strong id="edit-po-grand-total" style="font-size:1.1rem; color:#0f172a;">Rs. 0</strong></div>
            <div>Due Balance: <strong id="edit-po-due-total" style="font-size:1.1rem; color:#dc2626;">Rs. 0</strong></div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="App.submitEditPurchase(${purchase.id})">💾 Save Changes</button>
        </div>
      `;

      this.openModal(html);
      this.recalcEditPurchaseTotals();
    } catch (err) {
      alert('Error opening purchase editor: ' + err.message);
    }
  },

  addEditPurchaseRow() {
    const container = document.getElementById('edit-po-items-container');
    if (!container) return;
    container.insertAdjacentHTML('beforeend', this.buildEditPurchaseRowHtml(this.productsCache || []));
    this.recalcEditPurchaseTotals();
  },

  onEditPoProductSelect(elem) {
    const opt = elem.options[elem.selectedIndex];
    const cost = opt?.getAttribute('data-cost') || 0;
    const row = elem.closest('.edit-po-item-row');
    const costInput = row?.querySelector('.edit-po-item-cost');
    if (costInput) costInput.value = cost;
    this.recalcEditPurchaseTotals();
  },

  recalcEditPurchaseTotals() {
    let total = 0;
    document.querySelectorAll('.edit-po-item-row').forEach(row => {
      const qty = parseFloat(row.querySelector('.edit-po-item-qty')?.value) || 0;
      const cost = parseFloat(row.querySelector('.edit-po-item-cost')?.value) || 0;
      const lineTotal = qty * cost;
      total += lineTotal;
      const lineEl = row.querySelector('.edit-po-line-total');
      if (lineEl) lineEl.textContent = `Rs. ${this.formatNum(lineTotal)}`;
    });

    const paid = parseFloat(document.getElementById('edit-po-paid')?.value) || 0;
    const due = Math.max(0, total - paid);

    const totalEl = document.getElementById('edit-po-grand-total');
    const dueEl = document.getElementById('edit-po-due-total');
    if (totalEl) totalEl.textContent = `Rs. ${this.formatNum(total)}`;
    if (dueEl) dueEl.textContent = `Rs. ${this.formatNum(due)}`;
  },

  async submitEditPurchase(purchaseId) {
    const supplierId = document.getElementById('edit-po-supplier')?.value;
    if (!supplierId) return alert('Please select a supplier');

    const purchaseNo = document.getElementById('edit-po-no')?.value?.trim();
    const items = [];
    document.querySelectorAll('.edit-po-item-row').forEach(row => {
      const productId = row.querySelector('.edit-po-item-prod')?.value;
      const qty = parseFloat(row.querySelector('.edit-po-item-qty')?.value) || 0;
      const cost = parseFloat(row.querySelector('.edit-po-item-cost')?.value) || 0;
      if (productId && qty > 0) {
        items.push({ product_id: productId, quantity: qty, purchase_price: cost });
      }
    });

    if (items.length === 0) return alert('Please include at least one valid item with quantity > 0');

    const payload = {
      supplier_id: supplierId,
      purchase_no: purchaseNo,
      items,
      paid_amount: parseFloat(document.getElementById('edit-po-paid')?.value) || 0,
      payment_method: document.getElementById('edit-po-method')?.value || 'Cash',
      notes: document.getElementById('edit-po-notes')?.value || ''
    };

    try {
      const res = await fetch(`/api/purchases/${purchaseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      this.showToast('Purchase updated! Original bill date preserved & update date saved.', 'success');
      if (this.currentView === 'purchases') {
        await this.renderPurchases(document.getElementById('content-container'));
      } else if (this.currentView === 'stock-report') {
        await this.renderStockReport(document.getElementById('content-container'));
      }
      await this.viewPurchase(purchaseId);
    } catch (err) {
      alert('Failed to update purchase: ' + err.message);
    }
  },

  async confirmDeletePurchase(purchaseId) {
    const label = this.currentViewingPurchaseNo || `#${purchaseId}`;
    if (!confirm(`Delete Purchase ${label}? This will reverse its added stock and supplier due balance.`)) return;

    try {
      const res = await fetch(`/api/purchases/${purchaseId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      this.closeModal();
      this.showToast('Purchase deleted and stock reversed', 'success');
      if (this.currentView === 'purchases') {
        await this.renderPurchases(document.getElementById('content-container'));
      } else if (this.currentView === 'stock-report') {
        await this.renderStockReport(document.getElementById('content-container'));
      }
    } catch (err) {
      alert('Failed to delete purchase: ' + err.message);
    }
  },

  // Add Supplier Modal
  openAddSupplierModal() {
    const html = `
      <div class="modal-header">
        <h3 class="card-title">Add Supplier / Company</h3>
        <button style="border:none; background:none; font-size:1.5rem; cursor:pointer;" onclick="App.closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Supplier / Company Name *</label>
          <input type="text" id="supp-name" class="form-control" placeholder="e.g. Shaheen Medical Agency / Al-Rehman Surgical">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Mobile / Phone</label>
            <input type="text" id="supp-mobile" class="form-control" placeholder="0300-XXXXXXX">
          </div>
          <div class="form-group">
            <label class="form-label">Opening Balance Owed (Rs.)</label>
            <input type="number" id="supp-balance" class="form-control" value="0">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Address</label>
          <input type="text" id="supp-address" class="form-control" placeholder="Market, City">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.submitAddSupplier()">Save Supplier</button>
      </div>
    `;
    this.openModal(html);
  },

  async submitAddSupplier() {
    const name = document.getElementById('supp-name').value;
    if (!name) return alert('Supplier name is required');

    const payload = {
      name,
      business_name: name,
      mobile: document.getElementById('supp-mobile').value,
      address: document.getElementById('supp-address').value,
      balance: parseFloat(document.getElementById('supp-balance').value) || 0
    };

    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        this.closeModal();
        this.showToast('Supplier added successfully!', 'success');
        if (this.currentView === 'purchases') this.renderPurchases(document.getElementById('content-container'));
      }
    } catch (err) {
      alert(err.message);
    }
  },

  // ----------------------------------------------------
  // 6. EXPENSES VIEW
  // ----------------------------------------------------
  async renderExpenses(container) {
    container.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <h3 class="card-title">Operating & Store Expenses</h3>
            <div style="font-size:0.85rem; color:#64748b; margin-top:4px;">Recorded expenses are automatically deducted from monthly gross sales to calculate actual Net Profit.</div>
          </div>
          <button class="btn btn-primary" onclick="App.openAddExpenseModal()">+ Add New Expense</button>
        </div>
        <div class="table-container" id="expenses-table-container">
          <div style="padding:20px; text-align:center; color:#64748b;">Loading Expenses...</div>
        </div>
      </div>
    `;

    try {
      const res = await fetch('/api/expenses');
      const json = await res.json();
      const expenses = json.data || [];

      document.getElementById('expenses-table-container').innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Category</th>
              <th>Expense Description</th>
              <th>Amount</th>
              <th>Notes</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${expenses.length === 0 ? '<tr><td colspan="6" style="text-align:center; color:#64748b; padding:24px;">No expenses recorded yet.</td></tr>' :
              expenses.map(e => `
                <tr>
                  <td>${e.date}</td>
                  <td><span class="badge badge-info">${e.category}</span></td>
                  <td style="font-weight:600;">${e.title}</td>
                  <td style="font-weight:700; color:#dc2626;">Rs. ${e.amount.toLocaleString()}</td>
                  <td style="color:#64748b;">${e.notes || '-'}</td>
                  <td>
                    <button class="btn btn-danger btn-sm" onclick="App.deleteExpense(${e.id})">Delete</button>
                  </td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      `;
    } catch (err) {
      document.getElementById('expenses-table-container').innerHTML = `<div style="padding:20px; color:#ef4444;">Error: ${err.message}</div>`;
    }
  },

  // ----------------------------------------------------
  // 7. REPORTS VIEW (P&L, Stock, Aging)
  // ----------------------------------------------------
  async renderReports(container) {
    container.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b;">Generating Monthly Financial Report...</div>';

    try {
      const res = await fetch('/api/reports/profit-loss');
      const json = await res.json();
      const pnl = json.data;
      this.currentPnlData = pnl;

      container.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div>
              <h3 class="card-title">Monthly Profit & Loss Statement (P&L)</h3>
              <div style="font-size:0.85rem; color:#64748b; margin-top:4px;">Period: ${pnl.month}</div>
            </div>
            <button class="btn btn-secondary" onclick="App.printProfitReport()">🖨️ Print Statement</button>
          </div>

          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:24px;">
            <div style="background:#f8fafc; border:1px solid var(--slate-200); border-radius:10px; padding:16px;">
              <div style="font-size:0.8rem; color:#64748b; font-weight:700; text-transform:uppercase;">Gross Revenue</div>
              <div style="font-size:1.5rem; font-weight:800; color:var(--primary); margin-top:4px;">Rs. ${pnl.revenue.toLocaleString()}</div>
            </div>
            <div style="background:#f8fafc; border:1px solid var(--slate-200); border-radius:10px; padding:16px;">
              <div style="font-size:0.8rem; color:#64748b; font-weight:700; text-transform:uppercase;">Cost of Goods Sold (COGS)</div>
              <div style="font-size:1.5rem; font-weight:800; color:#475569; margin-top:4px;">Rs. ${pnl.cogs.toLocaleString()}</div>
            </div>
            <div style="background:#f8fafc; border:1px solid var(--slate-200); border-radius:10px; padding:16px;">
              <div style="font-size:0.8rem; color:#64748b; font-weight:700; text-transform:uppercase;">Operating Expenses</div>
              <div style="font-size:1.5rem; font-weight:800; color:#dc2626; margin-top:4px;">Rs. ${pnl.totalExpenses.toLocaleString()}</div>
            </div>
            <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:10px; padding:16px;">
              <div style="font-size:0.8rem; color:#065f46; font-weight:700; text-transform:uppercase;">Net Profit</div>
              <div style="font-size:1.6rem; font-weight:800; color:#059669; margin-top:4px;">Rs. ${pnl.netProfit.toLocaleString()}</div>
              <div style="font-size:0.8rem; color:#059669; margin-top:2px;">Margin: ${pnl.profitMargin}</div>
            </div>
          </div>

          <h4 style="margin:20px 0 10px 0; font-size:1rem;">Expenses Breakdown</h4>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Total Spent</th>
                </tr>
              </thead>
              <tbody>
                ${pnl.expenseBreakdown.length === 0 ? '<tr><td colspan="2" style="text-align:center; color:#64748b;">No expenses recorded this month.</td></tr>' :
                  pnl.expenseBreakdown.map(e => `
                    <tr>
                      <td style="font-weight:600;">${e.category}</td>
                      <td style="font-weight:700; color:#dc2626;">Rs. ${e.total.toLocaleString()}</td>
                    </tr>
                  `).join('')
                }
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div style="padding:20px; color:#ef4444;">Error: ${err.message}</div>`;
    }
  },

  async printProfitReport() {
    const pnl = this.currentPnlData;
    if (!pnl) return;
    const settings = await this.ensureSettingsLoaded();

    const headerHtml = this.buildDocumentHeaderHtml({
      settings,
      reportTitle: 'Monthly Profit & Loss Statement',
      docNo: `Period: ${pnl.month}`,
      dateLabel: `Generated Date: ${new Date().toLocaleString()}`
    });

    this.triggerPrint(`
      <div style="font-family:sans-serif; color:#0f172a;">
        ${headerHtml}
        <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap:12px; margin-bottom:20px;">
          <div style="border:1px solid #cbd5e1; border-radius:8px; padding:12px;">
            <div style="font-size:0.75rem; color:#64748b; font-weight:700;">GROSS REVENUE</div>
            <div style="font-size:1.25rem; font-weight:800; color:#0284c7; margin-top:4px;">Rs. ${pnl.revenue.toLocaleString()}</div>
          </div>
          <div style="border:1px solid #cbd5e1; border-radius:8px; padding:12px;">
            <div style="font-size:0.75rem; color:#64748b; font-weight:700;">COGS</div>
            <div style="font-size:1.25rem; font-weight:800; color:#475569; margin-top:4px;">Rs. ${pnl.cogs.toLocaleString()}</div>
          </div>
          <div style="border:1px solid #cbd5e1; border-radius:8px; padding:12px;">
            <div style="font-size:0.75rem; color:#64748b; font-weight:700;">EXPENSES</div>
            <div style="font-size:1.25rem; font-weight:800; color:#dc2626; margin-top:4px;">Rs. ${pnl.totalExpenses.toLocaleString()}</div>
          </div>
          <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:12px;">
            <div style="font-size:0.75rem; color:#065f46; font-weight:700;">NET PROFIT</div>
            <div style="font-size:1.25rem; font-weight:800; color:#059669; margin-top:4px;">Rs. ${pnl.netProfit.toLocaleString()}</div>
          </div>
        </div>
        <h4 style="margin:12px 0 8px 0;">Expenses Breakdown</h4>
        <table>
          <thead>
            <tr><th>Category</th><th>Total Spent</th></tr>
          </thead>
          <tbody>
            ${pnl.expenseBreakdown.length === 0 ? '<tr><td colspan="2" style="text-align:center; color:#64748b;">No expenses recorded this month.</td></tr>' :
              pnl.expenseBreakdown.map(e => `
                <tr>
                  <td style="font-weight:600;">${this.escapeHtml(e.category)}</td>
                  <td style="font-weight:700; color:#dc2626;">Rs. ${e.total.toLocaleString()}</td>
                </tr>
              `).join('')
            }
          </tbody>
        </table>
      </div>
    `);
  },

  // ----------------------------------------------------
  // 8. SETTINGS & SAFE BACKUP VIEW
  // ----------------------------------------------------
  async renderSettings(container) {
    container.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b;">Loading Settings & Safe Backup status...</div>';
    try {
      const res = await fetch('/api/backup/status');
      const json = await res.json();
      const b = json.data;

      const setRes = await fetch('/api/backup/settings');
      const setJson = await setRes.json();
      const s = setJson.data || {};

      container.innerHTML = `
        <div class="card" style="border-left: 5px solid #10b981;">
          <div class="card-header">
            <div>
              <h3 class="card-title">Permanent Data Storage & Safe Backup (E: Drive)</h3>
              <div style="font-size:0.85rem; color:#64748b; margin-top:4px;">
                Verified Rule: Your database and backups are stored strictly away from the C: drive for complete safety.
              </div>
            </div>
            <button class="btn btn-primary" onclick="App.triggerManualBackup()">Create Safe Backup Now</button>
          </div>

          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:16px; margin-bottom:20px;">
            <div style="background:#f8fafc; padding:14px; border-radius:8px; border:1px solid var(--slate-200);">
              <div style="font-size:0.78rem; color:#64748b; font-weight:700;">ACTIVE STORAGE DIRECTORY</div>
              <div style="font-size:0.95rem; font-weight:700; color:var(--primary); font-family:monospace; margin-top:4px;">${b.dataDirectory}</div>
            </div>
            <div style="background:#f8fafc; padding:14px; border-radius:8px; border:1px solid var(--slate-200);">
              <div style="font-size:0.78rem; color:#64748b; font-weight:700;">DATABASE FILE SIZE</div>
              <div style="font-size:1.1rem; font-weight:800; color:var(--slate-900); margin-top:4px;">${b.databaseSize}</div>
            </div>
            <div style="background:#f8fafc; padding:14px; border-radius:8px; border:1px solid var(--slate-200);">
              <div style="font-size:0.78rem; color:#64748b; font-weight:700;">AVAILABLE BACKUP COPIES</div>
              <div style="font-size:1.1rem; font-weight:800; color:#059669; margin-top:4px;">${b.backupsCount} Backups Safe</div>
            </div>
          </div>

          <h4 style="font-size:0.95rem; margin-bottom:10px;">Recent Automated Safe Backups:</h4>
          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Backup File</th>
                  <th>Created Date & Time</th>
                  <th>File Size</th>
                  <th>Storage Location</th>
                </tr>
              </thead>
              <tbody>
                ${b.backups.length === 0 ? '<tr><td colspan="4" style="text-align:center; color:#64748b;">No backup files found yet.</td></tr>' :
                  b.backups.map(bk => `
                    <tr>
                      <td style="font-family:monospace; font-weight:700; color:var(--primary);">${bk.filename}</td>
                      <td>${new Date(bk.createdAt).toLocaleString()}</td>
                      <td>${bk.size}</td>
                      <td style="color:#059669; font-weight:600;">E:\\Ibrahim_Surgical_Data\\backups</td>
                    </tr>
                  `).join('')
                }
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Store Profile & Invoice Header</h3>
            <button class="btn btn-primary" onclick="App.saveSettings()">Save Changes</button>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Store / Business Name</label>
              <input type="text" id="set-store-name" class="form-control" value="${s.store_name || 'Ibrahim Surgical Store'}">
            </div>
            <div class="form-group">
              <label class="form-label">Tagline / Specialization</label>
              <input type="text" id="set-tagline" class="form-control" value="${s.tagline || 'Specialized Surgical & Patient Operation Theater Supplies'}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Contact Phone</label>
              <input type="text" id="set-phone" class="form-control" value="${s.phone || '0300-1234567'}">
            </div>
            <div class="form-group">
              <label class="form-label">Store Address</label>
              <input type="text" id="set-address" class="form-control" value="${s.address || 'Hospital Road, Surgical Market'}">
            </div>
          </div>
        </div>
      `;
    } catch (err) {
      container.innerHTML = `<div style="padding:20px; color:#ef4444;">Error: ${err.message}</div>`;
    }
  },

  // ----------------------------------------------------
  // MODALS & ACTIONS
  // ----------------------------------------------------
  openModal(html) {
    const modal = document.getElementById('app-modal');
    const content = document.getElementById('modal-content-box');
    content.innerHTML = html;
    modal.classList.add('open');
  },

  closeModal() {
    const modal = document.getElementById('app-modal');
    modal.classList.remove('open');
  },

  showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3500);
  },

  // Trigger manual backup
  async triggerManualBackup() {
    try {
      this.showToast('Creating safe backup on E: drive...', 'info');
      const res = await fetch('/api/backup/now', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        this.showToast(json.message, 'success');
        if (this.currentView === 'settings') this.renderSettings(document.getElementById('content-container'));
      } else {
        this.showToast(json.message, 'error');
      }
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // Save Settings
  async saveSettings() {
    try {
      const updates = {
        store_name: document.getElementById('set-store-name').value,
        tagline: document.getElementById('set-tagline').value,
        phone: document.getElementById('set-phone').value,
        address: document.getElementById('set-address').value
      };
      const res = await fetch('/api/backup/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      const json = await res.json();
      if (json.success) {
        this.storeSettingsCache = updates;
        this.showToast('Store settings saved successfully!', 'success');
      }
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // ----------------------------------------------------
  // NEW INVOICE MODAL (WITH DYNAMIC DEALER-SPECIFIC RATES)
  // ----------------------------------------------------
  async openNewSaleModal() {
    const [cRes, pRes] = await Promise.all([
      fetch('/api/customers'),
      fetch('/api/products')
    ]);
    const customersJson = await cRes.json();
    const productsJson = await pRes.json();

    const customers = customersJson.data || [];
    const products = productsJson.data || [];
    this.productsCache = products;
    this.currentCustomerRates = {};

    const html = `
      <div class="modal-header">
        <h3 class="card-title">Create Sales Invoice</h3>
        <button style="border:none; background:none; font-size:1.5rem; cursor:pointer;" onclick="App.closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Select Dealer / Hospital *</label>
            <select id="invoice-customer" class="form-control" onchange="App.onInvoiceCustomerSelect(this.value)">
              <option value="">-- Choose Dealer / Hospital --</option>
              ${customers.map(c => `
                <option value="${c.id}" data-balance="${c.balance}">${c.business_name || c.name} (Balance: Rs. ${c.balance})</option>
              `).join('')}
            </select>
            <div id="invoice-customer-balance-box" style="font-size:0.8rem; color:#dc2626; margin-top:4px; font-weight:600;"></div>
            ${customers.length === 0 ? '<div style="font-size:0.8rem; color:#0284c7; margin-top:4px;">No dealers yet. Go to "Dealers & Hospitals" tab to add your first dealer.</div>' : ''}
          </div>
          <div class="form-group">
            <label class="form-label">Invoice Date</label>
            <input type="date" id="invoice-date" class="form-control" value="${new Date().toISOString().slice(0, 10)}">
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin:16px 0 10px 0;">
          <h4 style="font-size:0.95rem; margin:0;">Items to Supply & Custom Rates:</h4>
          <label style="font-size:0.82rem; color:#059669; font-weight:600; display:flex; align-items:center; gap:6px; cursor:pointer;">
            <input type="checkbox" id="save-custom-rates-toggle" checked>
            <span>Save these rates for this company</span>
          </label>
        </div>

        <div id="invoice-items-container"></div>

        <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="App.addInvoiceItemRow()">+ Add Another Item</button>

        <div style="margin-top:20px; padding:16px; background:#f8fafc; border-radius:8px; border:1px solid var(--slate-200);">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Discount (Rs.)</label>
              <input type="number" id="invoice-discount" class="form-control" value="0" min="0" oninput="App.calculateInvoiceTotals()">
            </div>
            <div class="form-group">
              <label class="form-label">Cash Received / Advance (Rs.)</label>
              <input type="number" id="invoice-paid" class="form-control" value="0" min="0" oninput="App.calculateInvoiceTotals()">
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; font-size:1.15rem; font-weight:800;">
            <div>Net Total Bill: <span id="invoice-net-total" style="color:var(--primary);">Rs. 0</span></div>
            <div>Due Balance: <span id="invoice-due-amount" style="color:#dc2626;">Rs. 0</span></div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.submitInvoice()">Save & Generate Invoice</button>
      </div>
    `;

    this.openModal(html);
    this.addInvoiceItemRow();
  },

  async onInvoiceCustomerSelect(customerId) {
    const sel = document.getElementById('invoice-customer');
    const opt = sel.options[sel.selectedIndex];
    const balance = opt.getAttribute('data-balance') || 0;
    const box = document.getElementById('invoice-customer-balance-box');

    if (balance > 0) {
      box.textContent = `Previous Outstanding Due: Rs. ${parseFloat(balance).toLocaleString()}`;
    } else {
      box.textContent = '';
    }

    if (!customerId) {
      this.currentCustomerRates = {};
      return;
    }

    // Load any saved custom rates for this customer
    try {
      const res = await fetch(`/api/customers/${customerId}/rates`);
      const json = await res.json();
      this.currentCustomerRates = json.data?.map || {};

      // Update rates for any items already in the rows
      document.querySelectorAll('.invoice-item-row').forEach(row => {
        const prodSelect = row.querySelector('.invoice-item-prod');
        const prodId = prodSelect?.value;
        if (prodId) {
          const rateInput = row.querySelector('.invoice-item-price');
          const defaultPrice = prodSelect.options[prodSelect.selectedIndex]?.getAttribute('data-price') || 0;
          const agreedPrice = this.currentCustomerRates[prodId] !== undefined ? this.currentCustomerRates[prodId] : defaultPrice;
          if (rateInput) rateInput.value = agreedPrice;
        }
      });
      this.calculateInvoiceTotals();
    } catch (e) {
      console.warn('Error fetching customer rates:', e);
    }
  },

  addInvoiceItemRow() {
    const container = document.getElementById('invoice-items-container');
    const rowIndex = container.children.length;
    const row = document.createElement('div');
    row.className = 'invoice-item-row';
    row.style = 'display:grid; grid-template-columns: 2fr 1fr 1fr 1fr 40px; gap:8px; margin-bottom:8px; align-items:center;';

    row.innerHTML = `
      <select class="form-control invoice-item-prod" onchange="App.onInvoiceProductSelect(this, ${rowIndex})">
        <option value="">-- Choose Item (${this.productsCache.length} surgical items) --</option>
        ${this.productsCache.map(p => {
          const m = this.computeProductMetrics(p);
          return `
            <option value="${p.id}" data-price="${m.finalPrice}" data-cost="${p.purchase_price}" data-stock="${p.current_stock}" data-unit="${this.escapeHtml(p.unit)}">
              ${this.escapeHtml(p.name)} (Stock: ${p.current_stock} ${this.escapeHtml(p.unit)})
            </option>
          `;
        }).join('')}
      </select>
      <input type="number" class="form-control invoice-item-qty" placeholder="Qty" value="1" min="1" oninput="App.calculateInvoiceTotals()">
      <input type="number" class="form-control invoice-item-price" placeholder="Rate" value="0" oninput="App.calculateInvoiceTotals()" title="Edit rate for this company">
      <div class="invoice-item-subtotal" style="font-weight:700; text-align:right; font-size:0.92rem;">Rs. 0</div>
      <button style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;" onclick="this.parentElement.remove(); App.calculateInvoiceTotals();">&times;</button>
    `;

    container.appendChild(row);
  },

  onInvoiceProductSelect(selectElem, rowIndex) {
    const opt = selectElem.options[selectElem.selectedIndex];
    const defaultPrice = opt.getAttribute('data-price') || 0;
    const prodId = selectElem.value;
    const row = selectElem.parentElement;
    const priceInput = row.querySelector('.invoice-item-price');

    // Use this customer's special price if exists, otherwise base price
    const agreedPrice = this.currentCustomerRates[prodId] !== undefined ? this.currentCustomerRates[prodId] : defaultPrice;

    if (priceInput) priceInput.value = agreedPrice;
    this.calculateInvoiceTotals();
  },

  calculateInvoiceTotals() {
    let subtotal = 0;
    const rows = document.querySelectorAll('.invoice-item-row');
    rows.forEach(row => {
      const qty = parseFloat(row.querySelector('.invoice-item-qty')?.value) || 0;
      const price = parseFloat(row.querySelector('.invoice-item-price')?.value) || 0;
      const lineTotal = qty * price;
      subtotal += lineTotal;
      const subElem = row.querySelector('.invoice-item-subtotal');
      if (subElem) subElem.textContent = `Rs. ${lineTotal.toLocaleString()}`;
    });

    const discount = parseFloat(document.getElementById('invoice-discount')?.value) || 0;
    const netTotal = Math.max(0, subtotal - discount);
    const paid = parseFloat(document.getElementById('invoice-paid')?.value) || 0;
    const due = Math.max(0, netTotal - paid);

    const netElem = document.getElementById('invoice-net-total');
    if (netElem) netElem.textContent = `Rs. ${netTotal.toLocaleString()}`;

    const dueElem = document.getElementById('invoice-due-amount');
    if (dueElem) dueElem.textContent = `Rs. ${due.toLocaleString()}`;
  },

  async submitInvoice() {
    const customerId = document.getElementById('invoice-customer').value;
    if (!customerId) return alert('Please select a dealer or hospital');

    const rows = document.querySelectorAll('.invoice-item-row');
    const items = [];
    rows.forEach(r => {
      const prodId = r.querySelector('.invoice-item-prod')?.value;
      const qty = parseFloat(r.querySelector('.invoice-item-qty')?.value) || 0;
      const price = parseFloat(r.querySelector('.invoice-item-price')?.value) || 0;
      if (prodId && qty > 0) {
        items.push({ product_id: prodId, quantity: qty, unit_price: price });
      }
    });

    if (items.length === 0) return alert('Please add at least one item');

    const payload = {
      customer_id: customerId,
      sale_date: document.getElementById('invoice-date').value,
      discount: parseFloat(document.getElementById('invoice-discount').value) || 0,
      paid_amount: parseFloat(document.getElementById('invoice-paid').value) || 0,
      save_custom_rates: document.getElementById('save-custom-rates-toggle')?.checked,
      items
    };

    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        this.closeModal();
        this.showToast('Invoice created and company rates saved!', 'success');
        this.viewInvoice(json.data.id);
        if (this.currentView === 'dashboard') this.renderDashboard(document.getElementById('content-container'));
        if (this.currentView === 'sales') this.filterSales();
      } else {
        alert(json.message);
      }
    } catch (err) {
      alert(err.message);
    }
  },

  // ----------------------------------------------------
  // VIEW / PRINT INVOICE
  // ----------------------------------------------------
  async viewInvoice(invoiceId) {
    try {
      const res = await fetch(`/api/sales/${invoiceId}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      const { sale, items, customer, settings } = json.data;
      if (settings) this.storeSettingsCache = settings;

      const invoiceHtml = `
        <div style="padding:20px; font-family:sans-serif;" id="printable-bill">
          <!-- Header -->
          ${this.buildDocumentHeaderHtml({
            settings,
            reportTitle: 'Sale Invoice',
            docNo: sale.invoice_no,
            dateLabel: `Date: ${sale.sale_date}`
          })}

          <!-- Customer details -->
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:12px; margin-bottom:16px;">
            <div style="font-size:0.75rem; color:#64748b; font-weight:700;">BILLED TO (DEALER / HOSPITAL):</div>
            <div style="font-size:1.1rem; font-weight:700; color:#0f172a;">${customer ? (customer.business_name || customer.name) : sale.customer_name}</div>
            <div style="font-size:0.85rem; color:#475569;">Contact: ${customer ? (customer.mobile || '-') : sale.customer_phone}</div>
          </div>

          <!-- Items Table -->
          <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
            <thead>
              <tr style="background:#f1f5f9; border-bottom:1px solid #cbd5e1;">
                <th style="padding:8px 10px; text-align:left;">#</th>
                <th style="padding:8px 10px; text-align:left;">Item Description</th>
                <th style="padding:8px 10px; text-align:center;">Qty</th>
                <th style="padding:8px 10px; text-align:right;">Rate</th>
                <th style="padding:8px 10px; text-align:right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((it, idx) => `
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:8px 10px;">${idx + 1}</td>
                  <td style="padding:8px 10px; font-weight:600;">${it.product_name} <span style="font-size:0.75rem; color:#64748b;">(${it.sku})</span></td>
                  <td style="padding:8px 10px; text-align:center;">${it.quantity} ${it.unit}</td>
                  <td style="padding:8px 10px; text-align:right;">Rs. ${it.unit_price}</td>
                  <td style="padding:8px 10px; text-align:right; font-weight:700;">Rs. ${it.line_total.toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- Totals summary -->
          <div style="display:flex; justify-content:flex-end;">
            <div style="width:280px;">
              <div style="display:flex; justify-content:space-between; padding:4px 0;">
                <span>Subtotal:</span>
                <span style="font-weight:600;">Rs. ${sale.subtotal.toLocaleString()}</span>
              </div>
              <div style="display:flex; justify-content:space-between; padding:4px 0; color:#dc2626;">
                <span>Discount:</span>
                <span>- Rs. ${sale.discount.toLocaleString()}</span>
              </div>
              <div style="display:flex; justify-content:space-between; padding:6px 0; border-top:1px solid #cbd5e1; font-size:1.1rem; font-weight:800;">
                <span>Total Bill:</span>
                <span style="color:#0284c7;">Rs. ${sale.total_amount.toLocaleString()}</span>
              </div>
              <div style="display:flex; justify-content:space-between; padding:4px 0; color:#059669; font-weight:700;">
                <span>Amount Paid:</span>
                <span>Rs. ${sale.paid_amount.toLocaleString()}</span>
              </div>
              <div style="display:flex; justify-content:space-between; padding:6px 0; border-top:1px dashed #cbd5e1; font-weight:800; color:#dc2626;">
                <span>Current Due:</span>
                <span>Rs. ${sale.due_amount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div style="margin-top:24px; padding-top:12px; border-top:1px solid #e2e8f0; text-align:center; font-size:0.8rem; color:#64748b;">
            Thank you for your business. Computer generated invoice by Ibrahim Surgical Store System.
          </div>
        </div>
      `;

      const modalHtml = `
        <div class="modal-header">
          <h3 class="card-title">Invoice Preview (${sale.invoice_no})</h3>
          <button style="border:none; background:none; font-size:1.5rem; cursor:pointer;" onclick="App.closeModal()">&times;</button>
        </div>
        <div class="modal-body">
          ${invoiceHtml}
        </div>
        <div class="modal-footer" style="display:flex; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; gap:8px;">
            <button class="btn btn-warning" onclick="App.openEditInvoiceModal(${sale.id})">✏️ Edit / Correct Invoice</button>
            <button class="btn btn-danger" onclick="App.confirmDeleteInvoice(${sale.id}, '${sale.invoice_no}')">🗑️ Delete Invoice</button>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
            <button class="btn btn-primary" onclick="App.printCurrentInvoice()">🖨️ Print Invoice (A4 / Thermal)</button>
          </div>
        </div>
      `;

      this.openModal(modalHtml);
    } catch (err) {
      alert('Error fetching invoice: ' + err.message);
    }
  },

  printCurrentInvoice() {
    const billEl = document.getElementById('printable-bill');
    if (!billEl) return;
    this.triggerPrint(billEl.innerHTML);
  },

  // ----------------------------------------------------
  // EDIT / CORRECT INVOICE MODAL
  // ----------------------------------------------------
  async openEditInvoiceModal(saleId) {
    try {
      const [saleRes, prodsRes, custsRes] = await Promise.all([
        fetch(`/api/sales/${saleId}`),
        fetch('/api/products'),
        fetch('/api/customers')
      ]);
      const saleJson = await saleRes.json();
      const prodsJson = await prodsRes.json();
      const custsJson = await custsRes.json();

      if (!saleJson.success) throw new Error(saleJson.message);
      const { sale, items, customer } = saleJson.data;
      const products = prodsJson.data || [];
      const customers = custsJson.data || [];
      this.productsCache = products;

      const html = `
        <div class="modal-header">
          <div>
            <h3 class="card-title">✏️ Edit / Correct Invoice (${sale.invoice_no})</h3>
            <div style="font-size:0.82rem; color:#64748b;">Modify quantities, rates, customer, or items. Stock & ledger adjust automatically.</div>
          </div>
          <button style="border:none; background:none; font-size:1.5rem; cursor:pointer;" onclick="App.closeModal()">&times;</button>
        </div>
        <div class="modal-body" style="max-height:75vh; overflow-y:auto;">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Dealer / Hospital *</label>
              <select id="edit-invoice-customer" class="form-control">
                ${customers.map(c => `
                  <option value="${c.id}" ${c.id === sale.customer_id ? 'selected' : ''}>
                    ${c.business_name || c.name} (Bal: Rs. ${c.balance.toLocaleString()})
                  </option>
                `).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Invoice Date</label>
              <input type="date" id="edit-invoice-date" class="form-control" value="${sale.sale_date}">
            </div>
          </div>

          <div style="margin-top:16px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <h4 style="margin:0; font-size:0.95rem; color:#0f172a; font-weight:700;">Invoice Billed Items</h4>
            <span style="font-size:0.8rem; color:#64748b;">(Change quantity or price directly below)</span>
          </div>

          <div class="table-container" style="max-height:300px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px;">
            <table style="width:100%; border-collapse:collapse;" id="edit-invoice-items-table">
              <thead>
                <tr style="background:#f8fafc; border-bottom:1px solid #e2e8f0; font-size:0.82rem;">
                  <th style="padding:8px;">Item Name</th>
                  <th style="padding:8px; width:70px;">Unit</th>
                  <th style="padding:8px; width:110px;">Quantity</th>
                  <th style="padding:8px; width:120px;">Rate (Rs.)</th>
                  <th style="padding:8px; width:120px;">Total</th>
                  <th style="padding:8px; width:50px;"></th>
                </tr>
              </thead>
              <tbody id="edit-invoice-items-body">
                ${items.map(it => `
                  <tr class="edit-invoice-item-row" data-prod-id="${it.product_id}">
                    <td style="padding:6px 8px; font-weight:600; font-size:0.88rem;">${it.product_name}</td>
                    <td style="padding:6px 8px; font-size:0.82rem; color:#64748b;">${it.unit || 'Pcs'}</td>
                    <td style="padding:6px 8px;">
                      <input type="number" step="any" min="0" class="form-control edit-item-qty" style="padding:4px 8px; font-size:0.9rem;" value="${it.quantity}" oninput="App.recalcEditInvoiceTotals()">
                    </td>
                    <td style="padding:6px 8px;">
                      <input type="number" step="any" min="0" class="form-control edit-item-price" style="padding:4px 8px; font-size:0.9rem;" value="${it.unit_price}" oninput="App.recalcEditInvoiceTotals()">
                    </td>
                    <td style="padding:6px 8px; font-weight:700; font-size:0.9rem; color:#0f172a;" class="edit-item-total">
                      Rs. ${(it.quantity * it.unit_price).toLocaleString()}
                    </td>
                    <td style="padding:6px 8px; text-align:center;">
                      <button type="button" class="btn btn-danger btn-sm" style="padding:2px 6px; font-size:0.75rem;" onclick="App.removeEditInvoiceRow(this)" title="Remove item">✕</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Add Item Row -->
          <div style="margin-top:12px; padding:12px; background:#f1f5f9; border-radius:6px; display:flex; gap:10px; align-items:center;">
            <select id="edit-invoice-add-prod" class="form-control" style="flex:1;">
              <option value="">-- Add another product to this invoice --</option>
              ${products.map(p => `
                <option value="${p.id}" data-name="${p.name.replace(/"/g, '&quot;')}" data-unit="${p.unit}" data-price="${p.selling_price}">
                  ${p.name} (Stock: ${p.current_stock} ${p.unit} | Rate: Rs. ${p.selling_price})
                </option>
              `).join('')}
            </select>
            <button type="button" class="btn btn-secondary btn-sm" onclick="App.addEditInvoiceRow()">+ Add to Invoice</button>
          </div>

          <!-- Totals summary -->
          <div style="margin-top:16px; display:flex; justify-content:space-between; align-items:flex-start;">
            <div style="flex:1; margin-right:20px;">
              <label class="form-label">Invoice Notes / Remarks</label>
              <textarea id="edit-invoice-notes" class="form-control" rows="2">${sale.notes || ''}</textarea>
            </div>
            <div style="width:280px; background:#f8fafc; padding:14px; border-radius:6px; border:1px solid #e2e8f0;">
              <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:0.9rem;">
                <span>Subtotal:</span>
                <span style="font-weight:700;" id="edit-inv-subtotal">Rs. ${sale.subtotal.toLocaleString()}</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-size:0.85rem; color:#dc2626;">Discount (Rs.):</span>
                <input type="number" id="edit-inv-discount" class="form-control" style="width:110px; padding:3px 6px; text-align:right;" value="${sale.discount || 0}" oninput="App.recalcEditInvoiceTotals()">
              </div>
              <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:1.05rem; font-weight:800; border-top:1px solid #cbd5e1; padding-top:6px;">
                <span>Net Total:</span>
                <span style="color:#0284c7;" id="edit-inv-net">Rs. ${sale.total_amount.toLocaleString()}</span>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <span style="font-size:0.85rem; color:#059669;">Paid (Rs.):</span>
                <input type="number" id="edit-inv-paid" class="form-control" style="width:110px; padding:3px 6px; text-align:right;" value="${sale.paid_amount || 0}" oninput="App.recalcEditInvoiceTotals()">
              </div>
              <div style="display:flex; justify-content:space-between; font-size:1.05rem; font-weight:800; border-top:1px dashed #cbd5e1; padding-top:6px; color:#dc2626;">
                <span>Due Balance:</span>
                <span id="edit-inv-due">Rs. ${sale.due_amount.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex; justify-content:space-between;">
          <button class="btn btn-danger btn-sm" onclick="App.confirmDeleteInvoice(${sale.id}, '${sale.invoice_no}')">🗑️ Delete Invoice</button>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="App.submitEditInvoice(${sale.id})">💾 Save & Update Invoice</button>
          </div>
        </div>
      `;
      this.openModal(html);
      this.recalcEditInvoiceTotals();
    } catch (err) {
      alert('Error loading invoice: ' + err.message);
    }
  },

  recalcEditInvoiceTotals() {
    let subtotal = 0;
    const rows = document.querySelectorAll('.edit-invoice-item-row');
    rows.forEach(r => {
      const qty = parseFloat(r.querySelector('.edit-item-qty')?.value) || 0;
      const price = parseFloat(r.querySelector('.edit-item-price')?.value) || 0;
      const lineTotal = qty * price;
      subtotal += lineTotal;
      const totalCell = r.querySelector('.edit-item-total');
      if (totalCell) totalCell.textContent = `Rs. ${lineTotal.toLocaleString()}`;
    });

    const discount = parseFloat(document.getElementById('edit-inv-discount')?.value) || 0;
    const netTotal = Math.max(0, subtotal - discount);
    const paid = parseFloat(document.getElementById('edit-inv-paid')?.value) || 0;
    const due = Math.max(0, netTotal - paid);

    const subElem = document.getElementById('edit-inv-subtotal');
    if (subElem) subElem.textContent = `Rs. ${subtotal.toLocaleString()}`;

    const netElem = document.getElementById('edit-inv-net');
    if (netElem) netElem.textContent = `Rs. ${netTotal.toLocaleString()}`;

    const dueElem = document.getElementById('edit-inv-due');
    if (dueElem) dueElem.textContent = `Rs. ${due.toLocaleString()}`;
  },

  removeEditInvoiceRow(btn) {
    const row = btn.closest('tr');
    if (row) {
      row.remove();
      this.recalcEditInvoiceTotals();
    }
  },

  addEditInvoiceRow() {
    const select = document.getElementById('edit-invoice-add-prod');
    const prodId = select?.value;
    if (!prodId) return alert('Please select a product to add');

    const opt = select.options[select.selectedIndex];
    const name = opt.getAttribute('data-name');
    const unit = opt.getAttribute('data-unit') || 'Pcs';
    const price = parseFloat(opt.getAttribute('data-price')) || 0;

    const tbody = document.getElementById('edit-invoice-items-body');
    const tr = document.createElement('tr');
    tr.className = 'edit-invoice-item-row';
    tr.setAttribute('data-prod-id', prodId);
    tr.innerHTML = `
      <td style="padding:6px 8px; font-weight:600; font-size:0.88rem;">${name}</td>
      <td style="padding:6px 8px; font-size:0.82rem; color:#64748b;">${unit}</td>
      <td style="padding:6px 8px;">
        <input type="number" step="any" min="0" class="form-control edit-item-qty" style="padding:4px 8px; font-size:0.9rem;" value="1" oninput="App.recalcEditInvoiceTotals()">
      </td>
      <td style="padding:6px 8px;">
        <input type="number" step="any" min="0" class="form-control edit-item-price" style="padding:4px 8px; font-size:0.9rem;" value="${price}" oninput="App.recalcEditInvoiceTotals()">
      </td>
      <td style="padding:6px 8px; font-weight:700; font-size:0.9rem; color:#0f172a;" class="edit-item-total">
        Rs. ${price.toLocaleString()}
      </td>
      <td style="padding:6px 8px; text-align:center;">
        <button type="button" class="btn btn-danger btn-sm" style="padding:2px 6px; font-size:0.75rem;" onclick="App.removeEditInvoiceRow(this)" title="Remove item">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
    select.value = '';
    this.recalcEditInvoiceTotals();
  },

  async submitEditInvoice(saleId) {
    const customerId = document.getElementById('edit-invoice-customer')?.value;
    if (!customerId) return alert('Dealer / Hospital is required');

    const rows = document.querySelectorAll('.edit-invoice-item-row');
    const items = [];
    rows.forEach(r => {
      const prodId = r.getAttribute('data-prod-id');
      const qty = parseFloat(r.querySelector('.edit-item-qty')?.value) || 0;
      const price = parseFloat(r.querySelector('.edit-item-price')?.value) || 0;
      if (prodId && qty > 0) {
        items.push({ product_id: parseInt(prodId), quantity: qty, unit_price: price });
      }
    });

    if (items.length === 0) return alert('Invoice must contain at least one surgical item with quantity > 0');

    const payload = {
      customer_id: customerId,
      sale_date: document.getElementById('edit-invoice-date')?.value,
      discount: parseFloat(document.getElementById('edit-inv-discount')?.value) || 0,
      paid_amount: parseFloat(document.getElementById('edit-inv-paid')?.value) || 0,
      notes: document.getElementById('edit-invoice-notes')?.value || '',
      items
    };

    try {
      const res = await fetch(`/api/sales/${saleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        this.closeModal();
        this.showToast('Invoice updated successfully! Stock & ledger recalculated.', 'success');
        this.viewInvoice(saleId);
        if (this.currentView === 'dashboard') this.renderDashboard(document.getElementById('content-container'));
        if (this.currentView === 'sales') this.filterSales();
        if (this.currentView === 'stock-report') this.renderStockReport(document.getElementById('content-container'));
      } else {
        alert(json.message);
      }
    } catch (err) {
      alert(err.message);
    }
  },

  async confirmDeleteInvoice(saleId, invoiceNo) {
    if (!confirm(`Are you sure you want to DELETE Invoice "${invoiceNo}"?\n\n- All sold items will be RESTORED to stock.\n- Customer balance will be REVERSED.\n- This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/sales/${saleId}`, {
        method: 'DELETE'
      });
      const json = await res.json();
      if (json.success) {
        this.closeModal();
        this.showToast(json.message, 'success');
        if (this.currentView === 'dashboard') this.renderDashboard(document.getElementById('content-container'));
        if (this.currentView === 'sales') this.filterSales();
        if (this.currentView === 'stock-report') this.renderStockReport(document.getElementById('content-container'));
        if (this.currentView === 'customers') this.filterCustomers();
      } else {
        alert(json.message);
      }
    } catch (err) {
      alert(err.message);
    }
  },

  // ----------------------------------------------------
  // RECEIVE PAYMENT / RECOVERY MODAL
  // ----------------------------------------------------
  openReceivePaymentModal(customerId, customerName, currentBalance) {
    const html = `
      <div class="modal-header">
        <h3 class="card-title">Record Payment Received</h3>
        <button style="border:none; background:none; font-size:1.5rem; cursor:pointer;" onclick="App.closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Dealer / Hospital</label>
          <input type="text" class="form-control" value="${customerName}" disabled>
        </div>
        <div class="form-group">
          <label class="form-label">Current Outstanding Due</label>
          <div style="font-size:1.3rem; font-weight:800; color:#dc2626;">Rs. ${parseFloat(currentBalance).toLocaleString()}</div>
        </div>
        <div class="form-group">
          <label class="form-label">Amount Received (Rs.) *</label>
          <input type="number" id="recovery-amount" class="form-control" value="${currentBalance > 0 ? currentBalance : 0}" min="1" autofocus>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Payment Date</label>
            <input type="date" id="recovery-date" class="form-control" value="${new Date().toISOString().slice(0, 10)}">
          </div>
          <div class="form-group">
            <label class="form-label">Payment Method</label>
            <select id="recovery-method" class="form-control">
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cheque">Cheque</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Notes / Remarks</label>
          <input type="text" id="recovery-notes" class="form-control" placeholder="e.g. Cleared bill for this month">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-success" onclick="App.submitRecovery(${customerId})">Save Payment Receipt</button>
      </div>
    `;
    this.openModal(html);
  },

  async submitRecovery(customerId) {
    const amount = parseFloat(document.getElementById('recovery-amount').value);
    if (!amount || amount <= 0) return alert('Please enter valid received amount');

    const payload = {
      customer_id: customerId,
      amount,
      payment_date: document.getElementById('recovery-date').value,
      payment_method: document.getElementById('recovery-method').value,
      notes: document.getElementById('recovery-notes').value
    };

    try {
      const res = await fetch('/api/payments/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        this.closeModal();
        this.showToast(json.message, 'success');
        if (this.currentView === 'dashboard') this.renderDashboard(document.getElementById('content-container'));
        if (this.currentView === 'customers') this.filterCustomers();
      } else {
        alert(json.message);
      }
    } catch (err) {
      alert(err.message);
    }
  },

  // ----------------------------------------------------
  // ADD PRODUCT MODAL
  // ----------------------------------------------------
  openAddProductModal() {
    const html = `
      <div class="modal-header">
        <h3 class="card-title">Add New Surgical Item</h3>
        <button style="border:none; background:none; font-size:1.5rem; cursor:pointer;" onclick="App.closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Item / Product Name *</label>
          <input type="text" id="prod-name" class="form-control" placeholder="e.g. Disposable Syringe 5cc">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">SKU / Code</label>
            <input type="text" id="prod-sku" class="form-control" placeholder="Leave empty for auto">
          </div>
          <div class="form-group">
            <label class="form-label">Unit</label>
            <input type="text" id="prod-unit" class="form-control" value="Pieces">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Purchase / Cost Price (Rs.) *</label>
            <input type="number" step="any" id="prod-cost" class="form-control" value="0">
          </div>
          <div class="form-group">
            <label class="form-label">Unit Selling Price (Rs.) *</label>
            <input type="number" step="any" id="prod-sell" class="form-control" value="0">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Discount</label>
            <div class="discount-input-group">
              <input type="number" step="any" min="0" id="prod-discount" class="form-control" value="0">
              <select id="prod-discount-type">
                <option value="rs">Rs.</option>
                <option value="pct">%</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Initial Stock</label>
            <input type="number" step="any" id="prod-stock" class="form-control" value="0">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Low Stock Alert Limit</label>
          <input type="number" id="prod-alert" class="form-control" value="25">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.submitAddProduct()">Save Product</button>
      </div>
    `;
    this.openModal(html);
  },

  async submitAddProduct() {
    const name = document.getElementById('prod-name').value;
    if (!name) return alert('Product name is required');

    const payload = {
      name,
      sku: document.getElementById('prod-sku').value,
      unit: document.getElementById('prod-unit').value,
      purchase_price: parseFloat(document.getElementById('prod-cost').value) || 0,
      selling_price: parseFloat(document.getElementById('prod-sell').value) || 0,
      discount_type: document.getElementById('prod-discount-type')?.value === 'pct' ? 'pct' : 'rs',
      discount_value: Math.max(0, parseFloat(document.getElementById('prod-discount')?.value) || 0),
      current_stock: parseFloat(document.getElementById('prod-stock').value) || 0,
      alert_quantity: parseFloat(document.getElementById('prod-alert').value) || 10
    };

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        this.closeModal();
        this.showToast('Product added successfully!', 'success');
        if (this.currentView === 'products') this.filterProducts();
        if (this.currentView === 'stock-report') this.renderStockReport(document.getElementById('content-container'));
      } else {
        alert(json.message);
      }
    } catch (err) {
      alert(err.message);
    }
  },

  // Edit product
  async openEditProductModal(productId) {
    const prod = this.productsCache.find(p => p.id === productId);
    if (!prod) return;

    const html = `
      <div class="modal-header">
        <h3 class="card-title">Edit Product: ${this.escapeHtml(prod.name)}</h3>
        <button style="border:none; background:none; font-size:1.5rem; cursor:pointer;" onclick="App.closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Product Name</label>
          <input type="text" id="edit-prod-name" class="form-control" value="${this.escapeHtml(prod.name)}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">SKU</label>
            <input type="text" id="edit-prod-sku" class="form-control" value="${this.escapeHtml(prod.sku)}">
          </div>
          <div class="form-group">
            <label class="form-label">Unit</label>
            <input type="text" id="edit-prod-unit" class="form-control" value="${this.escapeHtml(prod.unit)}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cost Price (Rs.)</label>
            <input type="number" step="any" id="edit-prod-cost" class="form-control" value="${prod.purchase_price}">
          </div>
          <div class="form-group">
            <label class="form-label">Unit Selling Price (Rs.)</label>
            <input type="number" step="any" id="edit-prod-sell" class="form-control" value="${prod.selling_price}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Discount</label>
            <div class="discount-input-group">
              <input type="number" step="any" min="0" id="edit-prod-discount" class="form-control" value="${prod.discount_value || 0}">
              <select id="edit-prod-discount-type">
                <option value="rs" ${prod.discount_type !== 'pct' ? 'selected' : ''}>Rs.</option>
                <option value="pct" ${prod.discount_type === 'pct' ? 'selected' : ''}>%</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Current Stock Quantity</label>
            <input type="number" step="any" id="edit-prod-stock" class="form-control" value="${prod.current_stock}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Alert Limit</label>
          <input type="number" id="edit-prod-alert" class="form-control" value="${prod.alert_quantity}">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.submitEditProduct(${prod.id})">Update Product</button>
      </div>
    `;
    this.openModal(html);
  },

  async submitEditProduct(productId) {
    const payload = {
      name: document.getElementById('edit-prod-name').value,
      sku: document.getElementById('edit-prod-sku').value,
      unit: document.getElementById('edit-prod-unit').value,
      purchase_price: parseFloat(document.getElementById('edit-prod-cost').value) || 0,
      selling_price: parseFloat(document.getElementById('edit-prod-sell').value) || 0,
      discount_type: document.getElementById('edit-prod-discount-type')?.value === 'pct' ? 'pct' : 'rs',
      discount_value: Math.max(0, parseFloat(document.getElementById('edit-prod-discount')?.value) || 0),
      current_stock: parseFloat(document.getElementById('edit-prod-stock').value) || 0,
      alert_quantity: parseFloat(document.getElementById('edit-prod-alert').value) || 10
    };

    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        this.closeModal();
        this.showToast('Product updated successfully!', 'success');
        if (this.currentView === 'products') this.filterProducts();
        if (this.currentView === 'stock-report') this.renderStockReport(document.getElementById('content-container'));
      } else {
        alert(json.message);
      }
    } catch (err) {
      alert(err.message);
    }
  },

  // ----------------------------------------------------
  // ADD DEALER / HOSPITAL MODAL
  // ----------------------------------------------------
  openAddCustomerModal() {
    const html = `
      <div class="modal-header">
        <h3 class="card-title">Add Dealer / Hospital</h3>
        <button style="border:none; background:none; font-size:1.5rem; cursor:pointer;" onclick="App.closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Dealer / Hospital / Business Name *</label>
          <input type="text" id="cust-name" class="form-control" placeholder="e.g. City Care Hospital / Shifa Medical Agency">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Mobile / Phone</label>
            <input type="text" id="cust-phone" class="form-control" placeholder="0300-XXXXXXX">
          </div>
          <div class="form-group">
            <label class="form-label">Payment Terms (Days)</label>
            <input type="number" id="cust-term" class="form-control" value="30">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Address / Location</label>
          <input type="text" id="cust-address" class="form-control" placeholder="e.g. Civil Lines, Main OT Wing">
        </div>
        <div class="form-group">
          <label class="form-label">Opening Balance / Previous Due (Rs.)</label>
          <input type="number" id="cust-balance" class="form-control" value="0">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.submitAddCustomer()">Save Dealer / Hospital</button>
      </div>
    `;
    this.openModal(html);
  },

  async submitAddCustomer() {
    const name = document.getElementById('cust-name').value;
    if (!name) return alert('Dealer or Hospital name is required');

    const payload = {
      name,
      business_name: name,
      mobile: document.getElementById('cust-phone').value,
      address: document.getElementById('cust-address').value,
      pay_term_days: parseInt(document.getElementById('cust-term').value) || 30,
      balance: parseFloat(document.getElementById('cust-balance').value) || 0
    };

    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        this.closeModal();
        this.showToast('Dealer / Hospital added successfully!', 'success');
        if (this.currentView === 'customers') this.filterCustomers();
      } else {
        alert(json.message);
      }
    } catch (err) {
      alert(err.message);
    }
  },

  // ----------------------------------------------------
  // EDIT DEALER / HOSPITAL MODAL
  // ----------------------------------------------------
  async openEditCustomerModal(customerId) {
    const cust = this.customersCache?.find(c => c.id === customerId);
    if (!cust) return;

    const html = `
      <div class="modal-header">
        <h3 class="card-title">Edit Dealer / Hospital: ${cust.business_name || cust.name}</h3>
        <button style="border:none; background:none; font-size:1.5rem; cursor:pointer;" onclick="App.closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Dealer / Hospital Name *</label>
          <input type="text" id="edit-cust-name" class="form-control" value="${cust.business_name || cust.name}">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Mobile / Phone</label>
            <input type="text" id="edit-cust-phone" class="form-control" value="${cust.mobile || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">Payment Terms (Days)</label>
            <input type="number" id="edit-cust-term" class="form-control" value="${cust.pay_term_days || 30}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Address / Location</label>
          <input type="text" id="edit-cust-address" class="form-control" value="${cust.address || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">Outstanding Balance (Rs.)</label>
          <input type="number" id="edit-cust-balance" class="form-control" value="${cust.balance || 0}">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.submitEditCustomer(${cust.id})">Update Dealer / Hospital</button>
      </div>
    `;
    this.openModal(html);
  },

  async submitEditCustomer(customerId) {
    const name = document.getElementById('edit-cust-name').value;
    if (!name) return alert('Dealer or Hospital name is required');

    const payload = {
      name,
      business_name: name,
      mobile: document.getElementById('edit-cust-phone').value,
      address: document.getElementById('edit-cust-address').value,
      pay_term_days: parseInt(document.getElementById('edit-cust-term').value) || 30,
      balance: parseFloat(document.getElementById('edit-cust-balance').value) || 0
    };

    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        this.closeModal();
        this.showToast('Dealer / Hospital updated successfully!', 'success');
        if (this.currentView === 'customers') this.filterCustomers();
        if (this.currentView === 'dashboard') this.renderDashboard(document.getElementById('content-container'));
      } else {
        alert(json.message);
      }
    } catch (err) {
      alert(err.message);
    }
  },

  // ----------------------------------------------------
  // ADD STOCK PURCHASE MODAL
  // ----------------------------------------------------
  async openAddPurchaseModal() {
    const [sRes, pRes] = await Promise.all([
      fetch('/api/suppliers'),
      fetch('/api/products')
    ]);
    const sJson = await sRes.json();
    const pJson = await pRes.json();
    const suppliers = sJson.data || [];
    this.productsCache = pJson.data || [];

    const html = `
      <div class="modal-header">
        <h3 class="card-title">Record Stock Purchase</h3>
        <button style="border:none; background:none; font-size:1.5rem; cursor:pointer;" onclick="App.closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Select Supplier / Distributor *</label>
            <select id="po-supplier" class="form-control">
              <option value="">-- Choose Supplier --</option>
              ${suppliers.map(s => `<option value="${s.id}">${s.business_name || s.name}</option>`).join('')}
            </select>
            ${suppliers.length === 0 ? '<div style="font-size:0.8rem; color:#0284c7; margin-top:4px;">No suppliers yet. Click "+ Add New Supplier" in Purchases tab to add one.</div>' : ''}
          </div>
          <div class="form-group">
            <label class="form-label">Purchase Date</label>
            <input type="date" id="po-date" class="form-control" value="${new Date().toISOString().slice(0, 10)}">
          </div>
        </div>

        <h4 style="font-size:0.95rem; margin:16px 0 10px 0;">Purchased Items:</h4>
        <div id="po-items-container"></div>
        <button class="btn btn-secondary btn-sm" style="margin-top:8px;" onclick="App.addPurchaseItemRow()">+ Add Item</button>

        <div style="margin-top:20px; padding:16px; background:#f8fafc; border-radius:8px; border:1px solid var(--slate-200);">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Payment Method</label>
              <select id="po-method" class="form-control">
                <option value="Cash">Cash</option>
                <option value="Bank">Bank Transfer</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Amount Paid (Rs.)</label>
              <input type="number" id="po-paid" class="form-control" value="0" min="0">
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.submitPurchase()">Save Stock Purchase</button>
      </div>
    `;

    this.openModal(html);
    this.addPurchaseItemRow();
  },

  addPurchaseItemRow() {
    const container = document.getElementById('po-items-container');
    const row = document.createElement('div');
    row.className = 'po-item-row';
    row.style = 'display:grid; grid-template-columns: 2fr 1fr 1fr 40px; gap:8px; margin-bottom:8px; align-items:center;';

    row.innerHTML = `
      <select class="form-control po-item-prod" onchange="App.onPoProductSelect(this)">
        <option value="">-- Choose Item --</option>
        ${this.productsCache.map(p => `
          <option value="${p.id}" data-cost="${p.purchase_price}">${p.name} (Cost: Rs. ${p.purchase_price})</option>
        `).join('')}
      </select>
      <input type="number" class="form-control po-item-qty" placeholder="Quantity" value="10" min="1">
      <input type="number" class="form-control po-item-cost" placeholder="Purchase Cost" value="0">
      <button style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer;" onclick="this.parentElement.remove();">&times;</button>
    `;

    container.appendChild(row);
  },

  onPoProductSelect(elem) {
    const opt = elem.options[elem.selectedIndex];
    const cost = opt.getAttribute('data-cost') || 0;
    const row = elem.parentElement;
    const costInput = row.querySelector('.po-item-cost');
    if (costInput) costInput.value = cost;
  },

  async submitPurchase() {
    const supplierId = document.getElementById('po-supplier').value;
    if (!supplierId) return alert('Please select a supplier');

    const rows = document.querySelectorAll('.po-item-row');
    const items = [];
    rows.forEach(r => {
      const prodId = r.querySelector('.po-item-prod')?.value;
      const qty = parseFloat(r.querySelector('.po-item-qty')?.value) || 0;
      const cost = parseFloat(r.querySelector('.po-item-cost')?.value) || 0;
      if (prodId && qty > 0) {
        items.push({ product_id: prodId, quantity: qty, purchase_price: cost });
      }
    });

    if (items.length === 0) return alert('Please add at least one item');

    const payload = {
      supplier_id: supplierId,
      purchase_date: document.getElementById('po-date').value,
      paid_amount: parseFloat(document.getElementById('po-paid').value) || 0,
      payment_method: document.getElementById('po-method').value,
      items
    };

    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        this.closeModal();
        this.showToast('Stock purchase recorded and inventory updated!', 'success');
        if (this.currentView === 'purchases') this.renderPurchases(document.getElementById('content-container'));
        if (this.currentView === 'products') this.filterProducts();
        if (this.currentView === 'stock-report') this.renderStockReport(document.getElementById('content-container'));
      } else {
        alert(json.message);
      }
    } catch (err) {
      alert(err.message);
    }
  },

  // ----------------------------------------------------
  // ADD EXPENSE MODAL
  // ----------------------------------------------------
  openAddExpenseModal() {
    const html = `
      <div class="modal-header">
        <h3 class="card-title">Add Store Expense</h3>
        <button style="border:none; background:none; font-size:1.5rem; cursor:pointer;" onclick="App.closeModal()">&times;</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Expense Description *</label>
          <input type="text" id="exp-title" class="form-control" placeholder="e.g. Shop Rent, OT Delivery Bike Fuel, Staff Tea">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Category</label>
            <select id="exp-cat" class="form-control">
              <option value="Rent">Shop Rent</option>
              <option value="Electricity">Electricity / Utilities</option>
              <option value="Transport">Delivery & Transport</option>
              <option value="Salaries">Staff Salary</option>
              <option value="Refreshment">Tea & Refreshment</option>
              <option value="General">Other / General</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Amount (Rs.) *</label>
            <input type="number" id="exp-amount" class="form-control" placeholder="0" min="1">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Date</label>
          <input type="date" id="exp-date" class="form-control" value="${new Date().toISOString().slice(0, 10)}">
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="App.submitExpense()">Save Expense</button>
      </div>
    `;
    this.openModal(html);
  },

  async submitExpense() {
    const title = document.getElementById('exp-title').value;
    const amount = parseFloat(document.getElementById('exp-amount').value) || 0;
    if (!title || amount <= 0) return alert('Please enter valid title and amount');

    const payload = {
      title,
      category: document.getElementById('exp-cat').value,
      amount,
      date: document.getElementById('exp-date').value
    };

    try {
      const res = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        this.closeModal();
        this.showToast('Expense recorded successfully!', 'success');
        if (this.currentView === 'expenses') this.renderExpenses(document.getElementById('content-container'));
      }
    } catch (err) {
      alert(err.message);
    }
  },

  async deleteExpense(id) {
    if (!confirm('Are you sure you want to delete this expense?')) return;
    try {
      const res = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        this.showToast('Expense deleted', 'success');
        this.renderExpenses(document.getElementById('content-container'));
      }
    } catch (err) {
      alert(err.message);
    }
  },

  // Export price list
  async exportReorderList() {
    try {
      const res = await fetch('/api/products');
      const json = await res.json();
      if (!json.success) throw new Error(json.message);

      const items = json.data;
      if (items.length === 0) return alert('No products found!');

      let csv = 'Product Name,SKU,Category,Unit,Cost Price,Unit Price,Discount (Rs),Discount (%),Final Price,Net Profit/Loss Per Unit,Stock,Total Remaining Profit/Loss\n';
      items.forEach(it => {
        const m = this.computeProductMetrics(it);
        csv += `"${(it.name || '').replace(/"/g, '""')}","${(it.sku || '').replace(/"/g, '""')}","${(it.category || '').replace(/"/g, '""')}","${(it.unit || '').replace(/"/g, '""')}",${m.cost},${m.unitPrice},${m.discountRs},${m.discountPct},${m.finalPrice},${m.netDiffPerUnit},${m.qty},${m.totalNetProfit}\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Surgical_Items_Rate_List_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    } catch (err) {
      alert(err.message);
    }
  }
};

// Start client app on load
window.addEventListener('DOMContentLoaded', () => {
  App.init();
});
