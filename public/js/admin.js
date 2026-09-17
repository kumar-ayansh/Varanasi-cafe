const TOKEN_KEY = 'tvs_admin_token';
const ORDER_STATUSES = ['received', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'];
const BOOKING_STATUSES = ['pending', 'confirmed', 'seated', 'completed', 'cancelled'];

let ownerWhatsapp = '';
let knownOrderIds = new Set();
let firstOrderLoad = true;
let refreshTimer = null;
let currentView = 'dashboard';
let orderFilters = { q: '', status: '', today: false, pending: false, from: '', to: '' };
let bookingFilters = { q: '', status: '', today: false, from: '', to: '' };
let currentReportPeriod = 'daily';

function getToken() { return sessionStorage.getItem(TOKEN_KEY) || ''; }

async function apiGet(path) {
  const res = await fetch(path, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (res.status === 401) throw new Error('unauthorized');
  return res.json();
}
async function apiPatch(path, body) {
  const res = await fetch(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body)
  });
  if (res.status === 401) throw new Error('unauthorized');
  return res.json();
}
async function apiPut(path, body) {
  const res = await fetch(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
    body: JSON.stringify(body)
  });
  if (res.status === 401) throw new Error('unauthorized');
  return res.json();
}
async function apiPost(path, body, authed = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (authed) headers.Authorization = `Bearer ${getToken()}`;
  const res = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
  return { ok: res.ok, status: res.status, data: await res.json() };
}

// ---------- Auth ----------
document.getElementById('loginBtn').addEventListener('click', async () => {
  const password = document.getElementById('adminPassword').value;
  const { ok, data } = await apiPost('/api/admin/login', { password }, false);
  if (!ok) {
    document.getElementById('loginStatus').className = 'form-status err';
    document.getElementById('loginStatus').textContent = data.error || 'Incorrect password.';
    return;
  }
  sessionStorage.setItem(TOKEN_KEY, data.token);
  enterDashboard();
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  sessionStorage.removeItem(TOKEN_KEY);
  clearInterval(refreshTimer);
  document.getElementById('adminMain').style.display = 'none';
  document.getElementById('sidebar').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'block';
});

document.getElementById('changePwBtn').addEventListener('click', () => {
  const box = document.getElementById('modalBox');
  box.innerHTML = `
    <button class="modal-close" id="modalCloseBtn">&times;</button>
    <h3>Change Admin Password</h3>
    <div class="field"><label>New Password</label><input type="password" id="newPw" placeholder="At least 6 characters"></div>
    <button class="btn btn--primary btn--full" id="savePwBtn">Save</button>
    <div class="form-status" id="pwStatus"></div>
  `;
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('savePwBtn').addEventListener('click', async () => {
    const newPassword = document.getElementById('newPw').value;
    const { ok, data } = await apiPost('/api/admin/change-password', { newPassword });
    const el = document.getElementById('pwStatus');
    if (!ok) {
      el.className = 'form-status err'; el.textContent = data.error || 'Could not change password.';
    } else {
      el.className = 'form-status ok'; el.textContent = 'Password updated. Use it next time you log in.';
    }
  });
});

function enterDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('sidebar').style.display = 'block';
  document.getElementById('adminMain').style.display = 'block';
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  fetch('/api/config').then((r) => r.json()).then((c) => { ownerWhatsapp = c.ownerWhatsapp || ''; });
  loadDashboard();
  loadOrders();
  loadBookings();
  loadMenuAdmin();
  loadReport();
  loadUpiSettings();
  refreshTimer = setInterval(() => {
    if (document.getElementById('autoRefreshToggle').checked) {
      loadOrders();
      loadBookings();
      if (currentView === 'dashboard') loadDashboard();
    }
  }, 15000);
}

if (getToken()) enterDashboard();

// ---------- Sidebar view switching ----------
document.querySelectorAll('.side-nav [data-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.side-nav [data-view]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    document.querySelectorAll('.view-panel').forEach((p) => p.classList.remove('active'));
    document.getElementById('view-' + currentView).classList.add('active');
    if (currentView === 'dashboard') loadDashboard();
  });
});

document.getElementById('refreshBtn').addEventListener('click', () => {
  loadOrders(); loadBookings(); loadDashboard();
});

document.getElementById('notifBtn').addEventListener('click', () => {
  document.querySelector('.side-nav [data-view="orders"]').click();
  orderFilters.pending = true;
  document.getElementById('pendingOrdersBtn').classList.add('active');
  loadOrders();
});

document.getElementById('globalSearch').addEventListener('input', (e) => {
  if (currentView === 'bookings') {
    bookingFilters.q = e.target.value;
    document.getElementById('bookingSearch').value = e.target.value;
    loadBookings();
  } else {
    orderFilters.q = e.target.value;
    document.getElementById('orderSearch').value = e.target.value;
    if (currentView !== 'orders') document.querySelector('.side-nav [data-view="orders"]').click();
    loadOrders();
  }
});

// ---------- Sound + Notification for new orders ----------
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.start();
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(660, ctx.currentTime + 0.15);
    osc.stop(ctx.currentTime + 0.35);
  } catch {}
}
function notifyNewOrder(order) {
  playBeep();
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('New order received', { body: `${order.customerName} — ₹${order.total}` });
  }
}

// ---------- Filters wiring ----------
document.getElementById('orderSearch').addEventListener('input', (e) => { orderFilters.q = e.target.value; loadOrders(); });
document.getElementById('orderStatusFilter').addEventListener('change', (e) => { orderFilters.status = e.target.value; loadOrders(); });
document.getElementById('orderFrom').addEventListener('change', (e) => { orderFilters.from = e.target.value; loadOrders(); });
document.getElementById('orderTo').addEventListener('change', (e) => { orderFilters.to = e.target.value; loadOrders(); });
document.getElementById('todayOrdersBtn').addEventListener('click', (e) => {
  orderFilters.today = !orderFilters.today; e.target.classList.toggle('active', orderFilters.today); loadOrders();
});
document.getElementById('pendingOrdersBtn').addEventListener('click', (e) => {
  orderFilters.pending = !orderFilters.pending; e.target.classList.toggle('active', orderFilters.pending); loadOrders();
});
document.getElementById('clearOrderFilters').addEventListener('click', () => {
  orderFilters = { q: '', status: '', today: false, pending: false, from: '', to: '' };
  document.getElementById('orderSearch').value = '';
  document.getElementById('orderStatusFilter').value = '';
  document.getElementById('orderFrom').value = '';
  document.getElementById('orderTo').value = '';
  document.getElementById('todayOrdersBtn').classList.remove('active');
  document.getElementById('pendingOrdersBtn').classList.remove('active');
  loadOrders();
});

document.getElementById('bookingSearch').addEventListener('input', (e) => { bookingFilters.q = e.target.value; loadBookings(); });
document.getElementById('bookingStatusFilter').addEventListener('change', (e) => { bookingFilters.status = e.target.value; loadBookings(); });
document.getElementById('bookingFrom').addEventListener('change', (e) => { bookingFilters.from = e.target.value; loadBookings(); });
document.getElementById('bookingTo').addEventListener('change', (e) => { bookingFilters.to = e.target.value; loadBookings(); });
document.getElementById('todayBookingsBtn').addEventListener('click', (e) => {
  bookingFilters.today = !bookingFilters.today; e.target.classList.toggle('active', bookingFilters.today); loadBookings();
});
document.getElementById('clearBookingFilters').addEventListener('click', () => {
  bookingFilters = { q: '', status: '', today: false, from: '', to: '' };
  document.getElementById('bookingSearch').value = '';
  document.getElementById('bookingStatusFilter').value = '';
  document.getElementById('bookingFrom').value = '';
  document.getElementById('bookingTo').value = '';
  document.getElementById('todayBookingsBtn').classList.remove('active');
  loadBookings();
});

document.getElementById('checkAvailBtn').addEventListener('click', async () => {
  const date = document.getElementById('availDate').value;
  const time = document.getElementById('availTime').value;
  const resultEl = document.getElementById('availResult');
  if (!date || !time) { resultEl.textContent = 'Pick a date and time.'; return; }
  const res = await fetch(`/api/bookings/availability?date=${date}&time=${time}`);
  const data = await res.json();
  resultEl.textContent = `${data.available} of ${data.totalTables} tables free`;
});

function buildQuery(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v === true) params.set(k, 'true');
    else if (v) params.set(k, v);
  });
  return params.toString();
}

// ---------- Dashboard (rings + chart + best sellers) ----------
async function loadDashboard() {
  const { orders: todayOrders } = await apiGet('/api/orders?today=true');
  const { bookings: todayBookings } = await apiGet('/api/bookings?today=true');

  const sales = todayOrders.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.total, 0);
  const pending = todayOrders.filter((o) => !['completed', 'cancelled'].includes(o.status)).length;
  const completed = todayOrders.filter((o) => o.status === 'completed').length;

  document.getElementById('notifCount').style.display = pending > 0 ? 'flex' : 'none';
  document.getElementById('notifCount').textContent = pending;

  const rings = [
    { n: todayOrders.length, l: "Today's Orders", pct: Math.min(100, todayOrders.length * 5) },
    { n: `₹${sales}`, l: "Today's Sales", pct: Math.min(100, sales / 20) },
    { n: pending, l: 'Pending Orders', pct: Math.min(100, pending * 10) },
    { n: completed, l: 'Completed Today', pct: Math.min(100, completed * 10) },
    { n: todayBookings.length, l: "Today's Bookings", pct: Math.min(100, todayBookings.length * 12) }
  ];
  document.getElementById('ringStrip').innerHTML = rings.map((r) => `
    <div class="ring-card">
      <div class="ring" style="--pct:${r.pct}"></div>
      <div><span class="n">${r.n}</span><span class="l">${r.l}</span></div>
    </div>
  `).join('');

  const { rows } = await apiGet('/api/orders/report?period=weekly');
  const maxSales = Math.max(1, ...rows.map((r) => r.sales));
  document.getElementById('salesBarChart').innerHTML = rows.map((r) => `
    <div class="bar-col">
      <div class="bar" style="height:${Math.max(4, (r.sales / maxSales) * 100)}%" title="₹${r.sales}"></div>
      <div class="bar-label">${r.date.slice(5)}</div>
    </div>
  `).join('') || '<p class="form-note">No sales yet this week.</p>';

  const { items } = await apiGet('/api/orders/top-items?period=weekly');
  document.getElementById('bestSellers').innerHTML = items.map((it, i) => `
    <div class="best-seller-row">
      <span class="best-seller-rank">${i + 1}</span>
      <span class="best-seller-name">${escapeHtml(it.name)}</span>
      <span class="best-seller-meta">${it.qty} sold<br>₹${it.revenue}</span>
    </div>
  `).join('') || '<p class="form-note">No orders yet this week.</p>';
}

// ---------- Orders ----------
async function loadOrders() {
  const { orders } = await apiGet('/api/orders?' + buildQuery(orderFilters));

  if (!firstOrderLoad) {
    orders.filter((o) => !knownOrderIds.has(o.id)).forEach(notifyNewOrder);
  }
  orders.forEach((o) => knownOrderIds.add(o.id));
  firstOrderLoad = false;

  const body = document.getElementById('ordersBody');
  body.innerHTML = orders.map((o) => `
    <tr>
      <td><a href="#" class="link-btn" data-view-order="${o.id}">${o.id}</a></td>
      <td>${formatDateTime(o.createdAt)}</td>
      <td>${escapeHtml(o.customerName)}<br><small>${escapeHtml(o.phone)}</small></td>
      <td>₹${o.total}</td>
      <td>${o.paymentMethod === 'upi' ? 'UPI' : 'Razorpay'}</td>
      <td>${paymentPill(o.paymentStatus)}</td>
      <td>
        <select data-order-id="${o.id}" class="order-status-select">
          ${ORDER_STATUSES.map((s) => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>${waLink(o.phone, `Hi ${o.customerName}, this is The Varanasi Story regarding your order ${o.id}.`)}</td>
    </tr>
  `).join('') || `<tr><td colspan="7">No orders match.</td></tr>`;

  body.querySelectorAll('.order-status-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await apiPatch(`/api/orders/${sel.dataset.orderId}/status`, { status: sel.value });
      loadOrders();
    });
  });
  body.querySelectorAll('[data-view-order]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const order = orders.find((o) => o.id === link.dataset.viewOrder);
      if (order) openOrderModal(order);
    });
  });
}

function openOrderModal(o) {
  const box = document.getElementById('modalBox');
  const isUpi = o.paymentMethod === 'upi';
  const paymentIdRow = isUpi
    ? ''
    : `<div class="detail-row"><span>Razorpay Payment ID</span><span style="font-size:0.8rem;">${o.paymentId}</span></div>`;
  const showUpiActions = isUpi && o.paymentStatus !== 'paid' && o.paymentStatus !== 'rejected';
  const verifyBtn = showUpiActions
    ? `<button class="btn btn--gold" id="verifyUpiBtn" style="margin-top:10px;">Mark UPI Payment as Verified</button>`
    : '';
  const rejectBtn = showUpiActions
    ? `<button class="btn btn--outline" id="rejectUpiBtn" style="margin-top:10px;">Reject UPI Payment</button>`
    : '';
  box.innerHTML = `
    <button class="modal-close" id="modalCloseBtn">&times;</button>
    <h3>${o.id}</h3>
    <div class="detail-row"><span>Date & Time</span><span>${formatDateTime(o.createdAt)}</span></div>
    <div class="detail-row"><span>Customer</span><span>${escapeHtml(o.customerName)}</span></div>
    <div class="detail-row"><span>Phone</span><span>${escapeHtml(o.phone)}</span></div>
    <div class="detail-row"><span>Order Type</span><span>${escapeHtml(o.orderType)}</span></div>
    <div class="detail-row"><span>Notes</span><span>${escapeHtml(o.notes) || '—'}</span></div>
    <h3 style="margin-top:18px;">Items</h3>
    ${o.items.map((i) => `<div class="detail-row"><span>${escapeHtml(i.name)} × ${i.qty}</span><span>₹${i.price * i.qty}</span></div>`).join('')}
    <div class="detail-row" style="font-weight:800;"><span>Total</span><span>₹${o.total}</span></div>
    <h3 style="margin-top:18px;">Payment</h3>
    <div class="detail-row"><span>Method</span><span>${isUpi ? 'UPI' : 'Razorpay'}</span></div>
    <div class="detail-row"><span>Status</span><span>${paymentPill(o.paymentStatus)}</span></div>
    ${paymentIdRow}
    <div class="detail-row"><span>Payment Time</span><span>${formatDateTime(o.paymentTime)}</span></div>
    <div style="display:flex; gap:10px; flex-wrap:wrap;">${verifyBtn}${rejectBtn}</div>
    <div style="margin-top:18px;">${waLink(o.phone, `Hi ${o.customerName}, this is The Varanasi Story regarding your order ${o.id}.`)}</div>
  `;
  document.getElementById('modalOverlay').classList.add('open');
  const verifyBtnEl = document.getElementById('verifyUpiBtn');
  if (verifyBtnEl) {
    verifyBtnEl.addEventListener('click', async () => {
      verifyBtnEl.disabled = true;
      verifyBtnEl.textContent = 'Verifying…';
      const data = await apiPatch(`/api/orders/${o.id}/verify-upi`, {});
      if (!data.error) {
        closeModal();
        loadOrders();
      } else {
        verifyBtnEl.disabled = false;
        verifyBtnEl.textContent = 'Mark UPI Payment as Verified';
      }
    });
  }
  const rejectBtnEl = document.getElementById('rejectUpiBtn');
  if (rejectBtnEl) {
    rejectBtnEl.addEventListener('click', async () => {
      rejectBtnEl.disabled = true;
      rejectBtnEl.textContent = 'Rejecting…';
      const data = await apiPatch(`/api/orders/${o.id}/reject-upi`, {});
      if (!data.error) {
        closeModal();
        loadOrders();
      } else {
        rejectBtnEl.disabled = false;
        rejectBtnEl.textContent = 'Reject UPI Payment';
      }
    });
  }
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
}

// ---------- Bookings ----------
async function loadBookings() {
  const { bookings } = await apiGet('/api/bookings?' + buildQuery(bookingFilters));
  const body = document.getElementById('bookingsBody');
  body.innerHTML = bookings.map((b) => `
    <tr>
      <td><a href="#" class="link-btn" data-view-booking="${b.id}">${b.id}</a></td>
      <td>${escapeHtml(b.customerName)}<br><small>${escapeHtml(b.phone)}</small></td>
      <td>${b.date} ${b.time}</td>
      <td>${b.guests}</td>
      <td>
        <select data-booking-id="${b.id}" class="booking-status-select">
          ${BOOKING_STATUSES.map((s) => `<option value="${s}" ${s === b.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>${waLink(b.phone, `Hi ${b.customerName}, this is The Varanasi Story confirming your table booking (${b.id}) for ${b.date} at ${b.time}, ${b.guests} guest(s).`)}</td>
    </tr>
  `).join('') || `<tr><td colspan="6">No bookings match.</td></tr>`;

  body.querySelectorAll('.booking-status-select').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await apiPatch(`/api/bookings/${sel.dataset.bookingId}/status`, { status: sel.value });
      loadBookings();
    });
  });
  body.querySelectorAll('[data-view-booking]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const booking = bookings.find((b) => b.id === link.dataset.viewBooking);
      if (booking) openBookingModal(booking);
    });
  });
}

function openBookingModal(b) {
  const box = document.getElementById('modalBox');
  box.innerHTML = `
    <button class="modal-close" id="modalCloseBtn">&times;</button>
    <h3>${b.id}</h3>
    <div class="detail-row"><span>Customer</span><span>${escapeHtml(b.customerName)}</span></div>
    <div class="detail-row"><span>Phone</span><span>${escapeHtml(b.phone)}</span></div>
    <div class="detail-row"><span>Date</span><span>${b.date}</span></div>
    <div class="detail-row"><span>Time</span><span>${b.time}</span></div>
    <div class="detail-row"><span>Guests</span><span>${b.guests}</span></div>
    <div class="detail-row"><span>Special Request</span><span>${escapeHtml(b.notes) || '—'}</span></div>
    <div class="detail-row"><span>Requested At</span><span>${formatDateTime(b.createdAt)}</span></div>
    <div style="margin-top:18px;">${waLink(b.phone, `Hi ${b.customerName}, this is The Varanasi Story confirming your table booking (${b.id}) for ${b.date} at ${b.time}, ${b.guests} guest(s).`)}</div>
  `;
  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }
document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') closeModal();
});

// ---------- Menu management ----------
let menuCategories = [];
let menuItemsAdmin = [];
let menuItemFilters = { q: '', category: '', showArchived: false };

async function loadMenuAdmin() {
  const res = await fetch('/api/menu');
  const { todaysSpecial } = await res.json();

  if (todaysSpecial) {
    document.getElementById('specialTitle').value = todaysSpecial.title || '';
    document.getElementById('specialDesc').value = todaysSpecial.description || '';
  }

  const { items, categories } = await apiGet('/api/menu/items');
  menuItemsAdmin = items;
  menuCategories = categories;

  const catSelect = document.getElementById('menuCategoryFilter');
  if (catSelect.options.length <= 1) {
    catSelect.innerHTML = '<option value="">All Categories</option>' +
      categories.map((c) => `<option value="${c.key}">${escapeHtml(c.label)}</option>`).join('');
  }

  renderMenuItemsTable();
}

function categoryLabel(key) {
  const cat = menuCategories.find((c) => c.key === key);
  return cat ? cat.label : key;
}

function renderMenuItemsTable() {
  const body = document.getElementById('menuItemsBody');
  const q = menuItemFilters.q.trim().toLowerCase();

  const rows = menuItemsAdmin.filter((item) => {
    if (!menuItemFilters.showArchived && item.archived) return false;
    if (menuItemFilters.category && item.category !== menuItemFilters.category) return false;
    if (q && !item.name.toLowerCase().includes(q)) return false;
    return true;
  });

  body.innerHTML = rows.map((item) => {
    const thumb = item.image
      ? `<img class="menu-thumb" src="/${item.image}" alt="${escapeHtml(item.name)}">`
      : `<div class="menu-thumb-placeholder">🍽️</div>`;
    const vegDot = item.veg === false
      ? `<span class="veg-dot nonveg" title="Non-Veg"></span>`
      : `<span class="veg-dot" title="Veg"></span>`;
    const badges = [
      item.archived ? `<span class="mini-badge mini-badge--archived">Archived</span>` : '',
      item.isNew ? `<span class="mini-badge mini-badge--new">New</span>` : '',
      item.isSpecial ? `<span class="mini-badge mini-badge--special">Special</span>` : ''
    ].filter(Boolean).join('');

    return `
      <tr>
        <td>${thumb}</td>
        <td>
          <div class="menu-item-cell">
            <div>
              <div class="menu-item-name">${escapeHtml(item.name)}</div>
              ${badges ? `<div class="menu-item-badges">${badges}</div>` : ''}
            </div>
          </div>
        </td>
        <td>₹${item.price}${item.halfPrice ? ` <small>(half ₹${item.halfPrice})</small>` : ''}</td>
        <td>${escapeHtml(categoryLabel(item.category))}</td>
        <td>${vegDot}</td>
        <td>${item.available === false ? '<span class="menu-card__oos" style="font-size:0.78rem;">Unavailable</span>' : '<span style="color:#8fdcc9; font-size:0.78rem; font-weight:700;">Available</span>'}</td>
        <td>
          <div class="row-actions">
            <button type="button" data-edit-item="${item.id}">Edit</button>
            ${item.archived
              ? `<button type="button" data-restore-item="${item.id}">Restore</button>`
              : `
                <button type="button" class="${item.available === false ? '' : 'on'}" data-toggle-avail="${item.id}" data-avail="${item.available !== false}">${item.available === false ? 'Available?' : 'Available'}</button>
                <button type="button" class="${item.isNew ? 'on' : ''}" data-toggle-new="${item.id}" data-new="${!!item.isNew}">NEW</button>
                <button type="button" class="${item.isSpecial ? 'on' : ''}" data-toggle-special="${item.id}" data-special="${!!item.isSpecial}">SPECIAL</button>
                <button type="button" class="danger" data-archive-item="${item.id}">Delete</button>
              `}
          </div>
        </td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="7">No items match.</td></tr>`;

  body.querySelectorAll('[data-edit-item]').forEach((btn) => {
    btn.addEventListener('click', () => openMenuItemModal(menuItemsAdmin.find((i) => i.id === btn.dataset.editItem)));
  });
  body.querySelectorAll('[data-toggle-avail]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = !(btn.dataset.avail === 'true');
      const { item } = await apiPatch(`/api/menu/items/${btn.dataset.toggleAvail}/availability`, { available: next });
      applyItemUpdate(item);
    });
  });
  body.querySelectorAll('[data-toggle-new]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = !(btn.dataset.new === 'true');
      const { item } = await apiPatch(`/api/menu/items/${btn.dataset.toggleNew}/new`, { isNew: next });
      applyItemUpdate(item);
    });
  });
  body.querySelectorAll('[data-toggle-special]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const next = !(btn.dataset.special === 'true');
      const { item } = await apiPatch(`/api/menu/items/${btn.dataset.toggleSpecial}/special`, { isSpecial: next });
      applyItemUpdate(item);
    });
  });
  body.querySelectorAll('[data-archive-item]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this item from the menu? You can restore it later from "Show Archived".')) return;
      const res = await fetch(`/api/menu/items/${btn.dataset.archiveItem}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (res.ok) applyItemUpdate(data.item);
    });
  });
  body.querySelectorAll('[data-restore-item]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const { item } = await apiPatch(`/api/menu/items/${btn.dataset.restoreItem}/restore`, {});
      applyItemUpdate(item);
    });
  });
}

function applyItemUpdate(item) {
  if (!item) return;
  const idx = menuItemsAdmin.findIndex((i) => i.id === item.id);
  if (idx === -1) menuItemsAdmin.push(item);
  else menuItemsAdmin[idx] = item;
  renderMenuItemsTable();
}

document.getElementById('menuItemSearch').addEventListener('input', (e) => {
  menuItemFilters.q = e.target.value;
  renderMenuItemsTable();
});
document.getElementById('menuCategoryFilter').addEventListener('change', (e) => {
  menuItemFilters.category = e.target.value;
  renderMenuItemsTable();
});
document.getElementById('menuShowArchivedBtn').addEventListener('click', (e) => {
  menuItemFilters.showArchived = !menuItemFilters.showArchived;
  e.target.classList.toggle('active', menuItemFilters.showArchived);
  renderMenuItemsTable();
});
document.getElementById('addMenuItemBtn').addEventListener('click', () => openMenuItemModal(null));

// ---- Add/Edit item modal ----
function openMenuItemModal(item) {
  const isEdit = !!item;
  const box = document.getElementById('modalBox');
  let pendingImage = item && item.image ? item.image : null; // final `image` value to save
  let pendingImageIsNew = false;

  box.innerHTML = `
    <button class="modal-close" id="modalCloseBtn">&times;</button>
    <h3>${isEdit ? 'Edit Item' : 'Add New Item'}</h3>
    <div class="image-upload-row">
      <div id="itemImagePreviewWrap">
        ${pendingImage ? `<img class="image-upload-preview" id="itemImagePreview" src="/${pendingImage}" alt="">` : `<div class="image-upload-preview-placeholder" id="itemImagePreview">🍽️</div>`}
      </div>
      <div>
        <input type="file" id="itemImageFile" accept="image/jpeg,image/png,image/webp">
        <div class="form-note" style="margin:6px 0 0;">JPG, PNG, or WebP. Max 5MB.</div>
        ${pendingImage ? `<button type="button" class="link-btn" id="removeItemImageBtn" style="margin-top:6px;">Remove image</button>` : ''}
      </div>
    </div>
    <div class="item-form-grid">
      <div class="field full"><label>Name *</label><input type="text" id="itemName" maxlength="100" value="${escapeAttrJs(item?.name)}"></div>
      <div class="field full"><label>Description</label><input type="text" id="itemDesc" maxlength="500" value="${escapeAttrJs(item?.description)}"></div>
      <div class="field"><label>Price (₹) *</label><input type="number" id="itemPrice" min="1" step="0.01" value="${item?.price ?? ''}"></div>
      <div class="field"><label>Half Price (₹, optional)</label><input type="number" id="itemHalfPrice" min="1" step="0.01" value="${item?.halfPrice ?? ''}"></div>
      <div class="field full"><label>Category *</label>
        <select id="itemCategory">
          ${menuCategories.map((c) => `<option value="${c.key}" ${item && item.category === c.key ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Veg / Non-Veg</label>
        <select id="itemVeg">
          <option value="true" ${!item || item.veg !== false ? 'selected' : ''}>Veg</option>
          <option value="false" ${item && item.veg === false ? 'selected' : ''}>Non-Veg</option>
        </select>
      </div>
    </div>
    <div class="checkbox-row"><input type="checkbox" id="itemAvailable" ${!item || item.available !== false ? 'checked' : ''}><label for="itemAvailable">Available for ordering</label></div>
    <div class="checkbox-row"><input type="checkbox" id="itemIsNew" ${item?.isNew ? 'checked' : ''}><label for="itemIsNew">Mark as NEW</label></div>
    <div class="checkbox-row"><input type="checkbox" id="itemIsSpecial" ${item?.isSpecial ? 'checked' : ''}><label for="itemIsSpecial">Mark as SPECIAL</label></div>
    <div style="display:flex; gap:10px; margin-top:10px;">
      <button class="btn btn--gold" id="saveItemBtn">${isEdit ? 'Save Changes' : 'Add Item'}</button>
      <button class="btn btn--outline" id="cancelItemBtn">Cancel</button>
    </div>
    <div class="form-status" id="itemFormStatus"></div>
  `;

  document.getElementById('modalOverlay').classList.add('open');
  document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
  document.getElementById('cancelItemBtn').addEventListener('click', closeModal);

  const fileInput = document.getElementById('itemImageFile');
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setItemFormStatus('Please choose a JPG, PNG, or WebP image.', true);
      fileInput.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setItemFormStatus('Image must be under 5MB.', true);
      fileInput.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingImage = reader.result; // data URL, uploaded on save
      pendingImageIsNew = true;
      const wrap = document.getElementById('itemImagePreviewWrap');
      wrap.innerHTML = `<img class="image-upload-preview" id="itemImagePreview" src="${reader.result}" alt="">`;
    };
    reader.readAsDataURL(file);
  });

  const removeBtn = document.getElementById('removeItemImageBtn');
  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      pendingImage = null;
      pendingImageIsNew = false;
      const wrap = document.getElementById('itemImagePreviewWrap');
      wrap.innerHTML = `<div class="image-upload-preview-placeholder" id="itemImagePreview">🍽️</div>`;
    });
  }

  document.getElementById('saveItemBtn').addEventListener('click', async () => {
    const name = document.getElementById('itemName').value.trim();
    const description = document.getElementById('itemDesc').value.trim();
    const price = document.getElementById('itemPrice').value;
    const halfPriceRaw = document.getElementById('itemHalfPrice').value;
    const category = document.getElementById('itemCategory').value;
    const veg = document.getElementById('itemVeg').value === 'true';
    const available = document.getElementById('itemAvailable').checked;
    const isNew = document.getElementById('itemIsNew').checked;
    const isSpecial = document.getElementById('itemIsSpecial').checked;

    if (!name) return setItemFormStatus('Name is required.', true);
    if (!category) return setItemFormStatus('Category is required.', true);
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) return setItemFormStatus('Enter a valid positive price.', true);

    const saveBtn = document.getElementById('saveItemBtn');
    saveBtn.disabled = true;
    setItemFormStatus('Saving…', false);

    try {
      let imageValue = item && item.image ? item.image : null;
      if (pendingImageIsNew && pendingImage) {
        const { ok, data } = await apiPost('/api/menu/images', { image: pendingImage });
        if (!ok) { setItemFormStatus(data.error || 'Could not upload image.', true); saveBtn.disabled = false; return; }
        imageValue = data.image;
      } else if (pendingImage === null) {
        imageValue = null;
      }

      const payload = {
        name,
        description,
        price: priceNum,
        halfPrice: halfPriceRaw === '' ? null : Number(halfPriceRaw),
        category,
        veg,
        available,
        isNew,
        isSpecial,
        image: imageValue
      };

      const url = isEdit ? `/api/menu/items/${item.id}` : '/api/menu/items';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) {
        setItemFormStatus(data.error || 'Could not save item.', true);
        saveBtn.disabled = false;
        return;
      }
      applyItemUpdate(data.item);
      closeModal();
    } catch (err) {
      setItemFormStatus('Something went wrong. Please try again.', true);
      saveBtn.disabled = false;
    }
  });
}

function setItemFormStatus(msg, isError) {
  const el = document.getElementById('itemFormStatus');
  if (!el) return;
  el.className = `form-status ${isError ? 'err' : 'ok'}`;
  el.textContent = msg;
}

function escapeAttrJs(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

document.getElementById('saveSpecialBtn').addEventListener('click', async () => {
  const title = document.getElementById('specialTitle').value.trim();
  const description = document.getElementById('specialDesc').value.trim();
  const data = await apiPut('/api/menu/today-special', { title, description });
  const el = document.getElementById('specialStatus');
  el.className = 'form-status ok';
  el.textContent = data.todaysSpecial ? "Today's Special saved." : 'Cleared.';
});
document.getElementById('clearSpecialBtn').addEventListener('click', async () => {
  document.getElementById('specialTitle').value = '';
  document.getElementById('specialDesc').value = '';
  await apiPut('/api/menu/today-special', { title: '' });
  const el = document.getElementById('specialStatus');
  el.className = 'form-status ok';
  el.textContent = "Today's Special cleared.";
});

// ---------- UPI payment settings ----------
let pendingUpiQrImage = null; // data URL, uploaded on save — same pattern as menu item images

async function loadUpiSettings() {
  const upi = await apiGet('/api/upi/admin-settings');
  document.getElementById('upiIdInput').value = upi.upiId || '';
  document.getElementById('upiBusinessNameInput').value = upi.businessName || '';
  document.getElementById('upiEnabledToggle').checked = !!upi.enabled;
  pendingUpiQrImage = null;
  renderUpiQrPreview(upi.qrImage);
}

function renderUpiQrPreview(qrImage) {
  const wrap = document.getElementById('upiQrPreviewWrap');
  wrap.innerHTML = qrImage
    ? `<img src="/${qrImage}" alt="Current UPI QR code" style="width:120px; height:120px; object-fit:contain; background:#fff; border-radius:var(--radius); padding:6px;">`
    : `<p class="form-note" style="margin:0;">No QR code uploaded yet.</p>`;
}

document.getElementById('upiQrFile').addEventListener('change', () => {
  const fileInput = document.getElementById('upiQrFile');
  const file = fileInput.files[0];
  if (!file) return;
  const statusEl = document.getElementById('upiSettingsStatus');
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    statusEl.className = 'form-status err';
    statusEl.textContent = 'Please choose a JPG, PNG, or WebP image.';
    fileInput.value = '';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    statusEl.className = 'form-status err';
    statusEl.textContent = 'Image must be under 5MB.';
    fileInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    pendingUpiQrImage = reader.result; // data URL, uploaded to the server on Save
    renderUpiQrPreview(null);
    document.getElementById('upiQrPreviewWrap').innerHTML =
      `<img src="${reader.result}" alt="New UPI QR code" style="width:120px; height:120px; object-fit:contain; background:#fff; border-radius:var(--radius); padding:6px;">`;
  };
  reader.readAsDataURL(file);
});

document.getElementById('saveUpiSettingsBtn').addEventListener('click', async () => {
  const upiId = document.getElementById('upiIdInput').value.trim();
  const businessName = document.getElementById('upiBusinessNameInput').value.trim();
  const enabled = document.getElementById('upiEnabledToggle').checked;
  const statusEl = document.getElementById('upiSettingsStatus');
  const saveBtn = document.getElementById('saveUpiSettingsBtn');

  saveBtn.disabled = true;
  statusEl.className = 'form-status ok';
  statusEl.textContent = 'Saving…';
  statusEl.style.display = 'block';

  try {
    const payload = { upiId, businessName, enabled };

    if (pendingUpiQrImage) {
      const { ok, data } = await apiPost('/api/upi/qr-image', { image: pendingUpiQrImage });
      if (!ok) {
        statusEl.className = 'form-status err';
        statusEl.textContent = data.error || 'Could not upload QR image.';
        saveBtn.disabled = false;
        return;
      }
      payload.qrImage = data.image;
    }

    const result = await apiPut('/api/upi/settings', payload);
    if (result.error) {
      statusEl.className = 'form-status err';
      statusEl.textContent = result.error;
    } else {
      statusEl.className = 'form-status ok';
      statusEl.textContent = 'UPI settings saved.';
      pendingUpiQrImage = null;
      renderUpiQrPreview(result.upi.qrImage);
      document.getElementById('upiQrFile').value = '';
    }
  } finally {
    saveBtn.disabled = false;
  }
});

// ---------- Reports ----------
document.querySelectorAll('#view-reports [data-period]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#view-reports [data-period]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentReportPeriod = btn.dataset.period;
    loadReport();
  });
});

async function loadReport() {
  const { rows, totalSales, totalOrders } = await apiGet(`/api/orders/report?period=${currentReportPeriod}`);
  document.getElementById('reportSummary').innerHTML = `
    <div class="ring-card"><div><span class="n">₹${totalSales}</span><span class="l">Total Sales</span></div></div>
    <div class="ring-card"><div><span class="n">${totalOrders}</span><span class="l">Total Orders</span></div></div>
  `;
  document.getElementById('reportBody').innerHTML = rows.map((r) => `
    <tr><td>${r.date}</td><td>${r.orders}</td><td>₹${r.sales}</td></tr>
  `).join('') || `<tr><td colspan="3">No sales in this period yet.</td></tr>`;
}

// ---------- Helpers ----------
function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function paymentPill(status) {
  const cls = status === 'paid' ? 'confirmed' : (status === 'failed' || status === 'rejected') ? 'cancelled' : 'pending';
  const label = status === 'pending_verification' ? 'Pending Verification' : status === 'rejected' ? 'Rejected' : status;
  return `<span class="status-pill ${cls}">${label}</span>`;
}
function waLink(phone, message) {
  const digits = phone.replace(/\D/g, '');
  const num = digits.length === 10 ? `91${digits}` : digits;
  return `<a class="wa-btn" href="https://wa.me/${num}?text=${encodeURIComponent(message)}" target="_blank">WhatsApp</a>`;
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}
