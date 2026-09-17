let ALL_MENU_ITEMS = [];
let selectedPaymentMethod = 'razorpay';
let upiConfig = { enabled: false };

// Persists which UPI order is awaiting manual verification so a page
// refresh doesn't lose the "waiting for owner" state or, worse, let the
// browser fall back to a blank checkout form as if nothing happened. Only
// the small set of fields the checkout summary already showed the customer
// (their own order's id/total/items, from the /upi-order response) are
// kept here — the actual payment status is always re-checked against the
// server via GET /api/payment/order-status/:id, never assumed from this.
const PENDING_UPI_ORDER_KEY = 'varanasi_pending_upi_order';
let upiPollTimer = null;

function savePendingUpiOrder(order) {
  try {
    localStorage.setItem(PENDING_UPI_ORDER_KEY, JSON.stringify({
      id: order.id,
      total: order.total,
      items: order.items
    }));
  } catch {}
}
function clearPendingUpiOrder() {
  try { localStorage.removeItem(PENDING_UPI_ORDER_KEY); } catch {}
}
function getPendingUpiOrder() {
  try {
    const raw = localStorage.getItem(PENDING_UPI_ORDER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function initOrderPage() {
  const res = await fetch('/api/menu');
  const { menu } = await res.json();
  ALL_MENU_ITEMS = Object.values(menu).flatMap((c) => c.items);

  // If we're coming back to this page while a direct-UPI order is still
  // waiting on the owner (or has just been verified/rejected since we left),
  // resume that state instead of showing a fresh checkout form. The button
  // never gets to claim success on its own — only the order's real
  // paymentStatus, read fresh from the server, decides what's shown.
  const pendingOrder = getPendingUpiOrder();
  if (pendingOrder) {
    const resumed = await resumePendingUpiOrder(pendingOrder);
    if (resumed) return;
  }

  // UPI is an alternative to Razorpay, shown only if the admin has
  // configured and enabled it — never hardcoded here.
  try {
    const upiRes = await fetch('/api/upi/settings');
    upiConfig = await upiRes.json();
    if (upiConfig.enabled) {
      document.getElementById('upiMethodBtn').style.display = '';
    }
  } catch {
    upiConfig = { enabled: false };
  }

  document.querySelectorAll('.pm-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pm-option').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedPaymentMethod = btn.dataset.method;
      const payBtn = document.getElementById('payBtn');
      const note = document.getElementById('paymentNote');
      if (selectedPaymentMethod === 'upi') {
        payBtn.textContent = 'Continue to UPI Payment';
        note.textContent = 'You\'ll get a QR code and UPI ID to pay directly. We\'ll confirm your payment manually.';
      } else {
        payBtn.textContent = 'Pay & Place Order';
        note.textContent = 'Payments are processed securely via Razorpay. Your card/UPI details never touch our server.';
      }
    });
  });

  // Drop any cart items that went out of stock since they were added.
  let cart = getCart();
  let removedAny = false;
  Object.keys(cart).forEach((id) => {
    const item = ALL_MENU_ITEMS.find((i) => i.id === id);
    if (!item || item.available === false) {
      delete cart[id];
      removedAny = true;
    }
  });
  if (removedAny) saveCart(cart);

  const ids = Object.keys(cart);

  if (ids.length === 0) {
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('orderForm').style.display = 'none';
    if (removedAny) {
      document.getElementById('emptyState').innerHTML =
        '<p>One or more items in your cart went out of stock and were removed. <a href="menu.html" style="color:var(--gold); font-weight:700;">Browse the menu →</a></p>';
    }
    return;
  }

  if (removedAny) {
    const note = document.createElement('p');
    note.className = 'form-note';
    note.textContent = 'Note: one or more items in your cart went out of stock and were removed.';
    document.getElementById('orderForm').prepend(note);
  }

  renderSummary(cart, ids);
  document.getElementById('checkoutForm').addEventListener('submit', handleCheckout);
}

function renderSummary(cart, ids) {
  const wrap = document.getElementById('orderSummary');
  let total = 0;
  const rows = ids.map((id) => {
    const item = ALL_MENU_ITEMS.find((i) => i.id === id);
    if (!item) return '';
    const lineTotal = item.price * cart[id];
    total += lineTotal;
    return `<div class="order-summary__row"><span>${item.name} × ${cart[id]}</span><span>₹${lineTotal}</span></div>`;
  }).join('');
  wrap.innerHTML = rows + `<div class="order-summary__row order-summary__total"><span>Total</span><span>₹${total}</span></div>`;
}

function setStatus(message, type) {
  const el = document.getElementById('formStatus');
  el.textContent = message;
  el.className = `form-status ${type}`;
}

async function handleCheckout(e) {
  e.preventDefault();
  const payBtn = document.getElementById('payBtn');
  const customerName = document.getElementById('customerName').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const orderType = document.getElementById('orderType').value;
  const notes = document.getElementById('notes').value.trim();

  const cart = getCart();
  const items = Object.entries(cart).map(([id, qty]) => ({ id, qty }));

  if (items.length === 0) {
    setStatus('Your cart is empty.', 'err');
    return;
  }

  if (selectedPaymentMethod === 'upi') {
    return handleUpiCheckout({ customerName, phone, orderType, notes, items });
  }

  payBtn.disabled = true;
  payBtn.textContent = 'Processing…';
  setStatus('', '');

  try {
    // Step 1: ask our server to create a Razorpay order (amount computed server-side)
    const createRes = await fetch('/api/payment/create-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, customerName, phone, orderType, notes })
    });
    const createData = await createRes.json();

    if (!createRes.ok) {
      throw new Error(createData.error || 'Could not start payment.');
    }

    const { order, keyId } = createData;

    // Step 2: open Razorpay's hosted checkout
    const rzp = new Razorpay({
      key: keyId,
      amount: order.amount,
      currency: order.currency,
      name: 'The Varanasi Story',
      description: 'Order payment',
      order_id: order.id,
      prefill: { name: customerName, contact: phone },
      theme: { color: '#8c3b2e' },
      handler: async function (response) {
        await finalizeOrder(response, { customerName, phone, orderType, notes, items });
      },
      modal: {
        ondismiss: function () {
          payBtn.disabled = false;
          payBtn.textContent = 'Pay & Place Order';
          setStatus('Payment cancelled. You can try again.', 'err');
        }
      }
    });
    rzp.open();
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Something went wrong. Please try again.', 'err');
    payBtn.disabled = false;
    payBtn.textContent = 'Pay & Place Order';
  }
}

async function finalizeOrder(razorpayResponse, orderDetails) {
  try {
    // Step 3: server verifies the signature AND cross-checks the payment
    // against our own locked payment record (order ID, amount, currency,
    // captured status) — then creates the restaurant order itself, using
    // only the prices that were locked in at checkout. Nothing the browser
    // sends here can change what gets charged or ordered.
    const verifyRes = await fetch('/api/payment/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        razorpay_order_id: razorpayResponse.razorpay_order_id,
        razorpay_payment_id: razorpayResponse.razorpay_payment_id,
        razorpay_signature: razorpayResponse.razorpay_signature
      })
    });
    const verifyData = await verifyRes.json();

    if (!verifyRes.ok || !verifyData.verified) {
      throw new Error(verifyData.error || ('Payment could not be verified. Please contact us with your payment ID: ' + razorpayResponse.razorpay_payment_id));
    }

    let order = verifyData.order;

    // Fallback: verify() normally returns the created order directly. If
    // for some reason it didn't, ask /api/orders to fetch/create it from
    // the now-verified payment record — still nothing trusted from here
    // except which payment we mean.
    if (!order) {
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: razorpayResponse.razorpay_payment_id })
      });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error || 'Payment succeeded but order could not be confirmed. Please contact us.');
      order = orderData.order;
    }

    clearCart();
    renderConfirmation(order);
    document.getElementById('checkoutForm').style.display = 'none';
  } catch (err) {
    console.error(err);
    setStatus(err.message, 'err');
  }
}

// Direct UPI checkout: creates the order server-side right away (price
// locked the same way as the Razorpay path), then shows the QR/UPI-ID
// panel using the order's own server-computed total — never anything
// typed or held in the browser — for the payment deep link.
async function handleUpiCheckout({ customerName, phone, orderType, notes, items }) {
  const payBtn = document.getElementById('payBtn');
  payBtn.disabled = true;
  payBtn.textContent = 'Processing…';
  setStatus('', '');

  try {
    const res = await fetch('/api/payment/upi-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, customerName, phone, orderType, notes })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not start UPI payment.');

    const { order, upi } = data;
    showUpiPanel(order, upi);
  } catch (err) {
    console.error(err);
    setStatus(err.message || 'Something went wrong. Please try again.', 'err');
    payBtn.disabled = false;
    payBtn.textContent = 'Continue to UPI Payment';
  }
}

let currentUpiState = 'initial'; // 'initial' | 'waiting' | 'verified' | 'rejected'

function showUpiPanel(order, upi) {
  document.getElementById('checkoutForm').style.display = 'none';

  populateUpiPanel(order, upi);
  renderUpiButtonArea('initial', order.id);

  // The click here is only the customer's CLAIM that they paid — it never
  // marks the order as successful by itself. The order stays in
  // pending_verification (set server-side when it was created) until the
  // owner verifies it in the admin panel. This only flips the SAME button/
  // status area into a waiting state and starts checking the existing
  // order-status mechanism for the real outcome; nothing here or below is
  // ever hidden away and replaced with a separate confirmation screen.
  document.getElementById('upiCompletedBtn').onclick = () => {
    if (currentUpiState !== 'initial') return;
    savePendingUpiOrder(order);
    renderUpiButtonArea('waiting', order.id);
    pollUpiOrderStatus(order.id);
  };
}

// Fills in the QR/UPI-ID/pay-link parts of the panel. Called both right
// after the order is created and when resuming a pending order after a
// refresh — the panel itself is never torn down, only repopulated.
function populateUpiPanel(order, upi) {
  const panel = document.getElementById('upiPanel');
  panel.style.display = 'block';
  document.getElementById('upiBusinessName').textContent = upi.businessName;
  document.getElementById('upiIdText').textContent = upi.upiId;
  document.getElementById('upiQr').src = upi.qrImage ? `/${upi.qrImage}` : '';

  const upiUri = `upi://pay?pa=${encodeURIComponent(upi.upiId)}&pn=${encodeURIComponent(upi.businessName)}&am=${encodeURIComponent(order.total)}&cu=INR`;
  document.getElementById('payViaUpiAppBtn').href = upiUri;

  document.getElementById('copyUpiBtn').onclick = () => {
    navigator.clipboard.writeText(upi.upiId).then(() => {
      const btn = document.getElementById('copyUpiBtn');
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = original; }, 1500);
    }).catch(() => {});
  };
}

// Single place that renders the SAME payment button/status area for every
// state. Nothing else in the panel (QR, UPI ID, pay-via-app, copy button)
// is ever hidden by this — only the button text/style and the status
// message/WhatsApp link beneath it change.
//
//   initial  -> "I Have Completed Payment" (clickable)
//   waiting  -> "Waiting for Owner Confirmation" + screenshot instructions
//   verified -> "Payment Successfully Verified ✓"
//   rejected -> "Payment Not Verified" + contact instructions
function renderUpiButtonArea(state, orderId) {
  currentUpiState = state;
  const btn = document.getElementById('upiCompletedBtn');
  const statusEl = document.getElementById('upiFormStatus');
  const waBtn = document.getElementById('upiWhatsappBtn');

  if (state === 'initial') {
    btn.disabled = false;
    btn.className = 'btn btn--primary btn--full';
    btn.textContent = 'I Have Completed Payment';
    statusEl.className = 'form-status';
    statusEl.textContent = '';
    waBtn.style.display = 'none';
    return;
  }

  if (state === 'waiting') {
    btn.disabled = true;
    btn.className = 'btn btn--outline btn--full';
    btn.textContent = 'Waiting for Owner Confirmation';
    statusEl.className = 'form-status ok';
    statusEl.textContent = 'Please send your payment screenshot to the owner on WhatsApp and wait for confirmation from the owner. This page will update automatically once the owner verifies your payment.';
    showWhatsappButton(waBtn, orderId, 'Send Screenshot on WhatsApp',
      `Hi, here is my payment screenshot for order ${orderId} at The Varanasi Story.`);
    return;
  }

  if (state === 'verified') {
    btn.disabled = true;
    btn.className = 'btn btn--primary btn--full';
    btn.textContent = 'Payment Successfully Verified ✓';
    statusEl.className = 'form-status ok';
    statusEl.textContent = `Order ${orderId} is confirmed. See you soon!`;
    waBtn.style.display = 'none';
    return;
  }

  if (state === 'rejected') {
    btn.disabled = true;
    btn.className = 'btn btn--outline btn--full';
    btn.textContent = 'Payment Not Verified';
    statusEl.className = 'form-status err';
    statusEl.textContent = 'The owner could not verify this payment. Please contact the owner on WhatsApp.';
    showWhatsappButton(waBtn, orderId, 'Contact Owner on WhatsApp',
      `Hi, I need help with my payment for order ${orderId} at The Varanasi Story.`);
  }
}

// Reuses the project's existing owner WhatsApp configuration (GET
// /api/config -> ownerWhatsapp) — never a new/hardcoded number.
function showWhatsappButton(waBtn, orderId, label, message) {
  fetch('/api/config').then((r) => r.json()).then(({ ownerWhatsapp }) => {
    if (!ownerWhatsapp) { waBtn.style.display = 'none'; return; }
    waBtn.textContent = label;
    waBtn.href = `https://wa.me/${ownerWhatsapp}?text=${encodeURIComponent(message)}`;
    waBtn.style.display = 'block';
  }).catch(() => { waBtn.style.display = 'none'; });
}

// Polls the dedicated customer-facing Direct UPI status endpoint — public,
// minimal (orderId/paymentMethod/paymentStatus only), and never the
// admin-only GET /api/orders/:id (which a customer browser has no token
// for). Stops itself the moment the backend reports anything other than
// pending_verification.
function pollUpiOrderStatus(orderId) {
  if (upiPollTimer) clearInterval(upiPollTimer);
  upiPollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/payment/order-status/${orderId}`);
      if (!res.ok) return;
      const status = await res.json();
      applyUpiOrderStatus(status);
    } catch (err) {
      console.error(err);
    }
  }, 5000);
}

// Single place that decides what the SAME button/status area shows, based
// on the order's real paymentStatus (from GET /api/payment/order-status/:id).
// Called both by the poller and when resuming after a refresh, so the two
// paths can never disagree. The button click is never treated as proof of
// anything — only this.
function applyUpiOrderStatus(status) {
  if (status.paymentStatus === 'paid') {
    if (upiPollTimer) clearInterval(upiPollTimer);
    clearPendingUpiOrder();
    clearCart();
    renderUpiButtonArea('verified', status.orderId);
  } else if (status.paymentStatus === 'rejected') {
    if (upiPollTimer) clearInterval(upiPollTimer);
    clearPendingUpiOrder();
    renderUpiButtonArea('rejected', status.orderId);
  } else if (currentUpiState !== 'waiting') {
    // still pending_verification
    renderUpiButtonArea('waiting', status.orderId);
  }
}

// Runs on page load when a UPI order is still saved as pending. The
// item/total summary comes from what was already shown to this customer at
// checkout (saved locally); the actual payment status is always re-checked
// fresh against GET /api/payment/order-status/:id — never assumed from
// localStorage — and the SAME panel/button area is rebuilt to match,
// including after a page refresh while verification is still pending, or
// after the admin has verified/rejected it since the tab was last open.
async function resumePendingUpiOrder(pendingOrder) {
  try {
    const statusRes = await fetch(`/api/payment/order-status/${pendingOrder.id}`);
    if (!statusRes.ok) { clearPendingUpiOrder(); return false; }
    const status = await statusRes.json();
    if (status.paymentMethod !== 'upi') { clearPendingUpiOrder(); return false; }

    // Repopulate the panel (QR/UPI ID/pay link) from the project's existing
    // public UPI settings endpoint — nothing here is trusted from
    // localStorage except the customer's own previously-shown order summary.
    let upi = { upiId: '', businessName: 'The Varanasi Story', qrImage: null };
    try {
      const upiRes = await fetch('/api/upi/settings');
      const upiData = await upiRes.json();
      if (upiData.enabled) upi = upiData;
    } catch {}

    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('checkoutForm').style.display = 'none';
    document.getElementById('orderForm').style.display = 'block';

    const itemLines = (pendingOrder.items || [])
      .map((i) => `<div class="order-summary__row"><span>${i.name} × ${i.qty}</span><span>₹${i.price * i.qty}</span></div>`)
      .join('');
    document.getElementById('orderSummary').innerHTML = itemLines +
      `<div class="order-summary__row order-summary__total"><span>Total</span><span>₹${pendingOrder.total}</span></div>`;

    populateUpiPanel({ id: pendingOrder.id, total: pendingOrder.total }, upi);

    if (status.paymentStatus === 'paid') {
      clearPendingUpiOrder();
      clearCart();
      renderUpiButtonArea('verified', pendingOrder.id);
    } else if (status.paymentStatus === 'rejected') {
      clearPendingUpiOrder();
      renderUpiButtonArea('rejected', pendingOrder.id);
    } else {
      renderUpiButtonArea('waiting', pendingOrder.id);
      pollUpiOrderStatus(pendingOrder.id);
    }
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

function renderConfirmation(order) {
  const wrap = document.getElementById('orderSummary');
  const itemLines = order.items.map((i) => `<div class="order-summary__row"><span>${i.name} × ${i.qty}</span><span>₹${i.price * i.qty}</span></div>`).join('');
  const isUpi = order.paymentMethod === 'upi';
  const statusLabel = order.paymentStatus === 'paid'
    ? '✅ Paid'
    : order.paymentStatus === 'pending_verification'
      ? 'Payment verification pending'
      : order.paymentStatus;
  const paymentIdRow = isUpi
    ? ''
    : `<div class="order-summary__row"><span>Razorpay Payment ID</span><span style="font-size:0.8rem;">${order.paymentId}</span></div>`;
  const upiNote = isUpi
    ? `<p class="form-note">We'll confirm your UPI payment shortly. If you have questions, message us on WhatsApp with your order number.</p>`
    : '';
  wrap.innerHTML = `
    <div class="form-status ok" style="display:block; margin-bottom:16px;">
      ✅ Order Confirmed — <strong>${order.id}</strong>
    </div>
    ${itemLines}
    <div class="order-summary__row order-summary__total"><span>Total</span><span>₹${order.total}</span></div>
    <div class="order-summary__row"><span>Payment Method</span><span>${isUpi ? 'UPI' : 'Razorpay'}</span></div>
    <div class="order-summary__row"><span>Payment Status</span><span>${statusLabel}</span></div>
    ${paymentIdRow}
    <div class="order-summary__row"><span>Estimated Preparation Time</span><span>20–30 minutes</span></div>
    ${upiNote}
  `;
  fetch('/api/config').then((r) => r.json()).then(({ ownerWhatsapp }) => {
    if (!ownerWhatsapp) return;
    const msg = encodeURIComponent(`Hi, I'd like to check on my order ${order.id} at The Varanasi Story.`);
    const note = document.createElement('p');
    note.className = 'form-note';
    note.innerHTML = `Questions about your order? <a href="https://wa.me/${ownerWhatsapp}?text=${msg}" target="_blank" style="color:var(--gold); font-weight:700;">Message us on WhatsApp →</a>`;
    wrap.after(note);
  }).catch(() => {});
}

document.addEventListener('DOMContentLoaded', initOrderPage);
