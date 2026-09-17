// Lightweight bottom-sheet drawer for reviewing the cart without leaving
// menu.html. It never creates or duplicates cart state — every read/write
// goes through the same getCart()/addToCart()/saveCart() helpers in main.js
// that order.html and the desktop cart bar already use.

let CART_DRAWER_MENU_DATA = null;
let cartDrawerLastFocused = null;

function initCartDrawer(menuData) {
  CART_DRAWER_MENU_DATA = menuData;
  const trigger = document.getElementById('mobileCartCta');
  const drawer = document.getElementById('cartDrawer');
  if (!trigger || !drawer) return;

  // Avoid double-binding if initCartDrawer is ever called more than once.
  if (trigger.dataset.cartDrawerBound === 'true') {
    renderCartDrawer();
    return;
  }
  trigger.dataset.cartDrawerBound = 'true';

  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    openCartDrawer();
  });

  const scrim = drawer.querySelector('.cart-drawer__scrim');
  const closeBtn = drawer.querySelector('.cart-drawer__close');
  if (scrim) scrim.addEventListener('click', closeCartDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeCartDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeCartDrawer();
  });

  drawer.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const focusable = drawer.querySelectorAll('button, a[href]');
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  document.addEventListener('cart:changed', () => {
    if (drawer.classList.contains('open')) renderCartDrawer();
  });

  renderCartDrawer();
}

function openCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  if (!drawer) return;
  cartDrawerLastFocused = document.activeElement;
  renderCartDrawer();
  drawer.classList.add('open');
  document.body.classList.add('drawer-open');
  const closeBtn = drawer.querySelector('.cart-drawer__close');
  if (closeBtn) closeBtn.focus();
}

function closeCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  if (!drawer) return;
  drawer.classList.remove('open');
  document.body.classList.remove('drawer-open');
  if (cartDrawerLastFocused && document.body.contains(cartDrawerLastFocused)) {
    cartDrawerLastFocused.focus();
  }
}

function renderCartDrawer() {
  const drawer = document.getElementById('cartDrawer');
  if (!drawer || !CART_DRAWER_MENU_DATA) return;
  const body = drawer.querySelector('.cart-drawer__body');
  const footer = drawer.querySelector('.cart-drawer__footer');
  const cart = getCart();
  const ids = Object.keys(cart);
  const allItems = Object.values(CART_DRAWER_MENU_DATA).flatMap((c) => c.items);

  if (ids.length === 0) {
    body.innerHTML = `<p class="cart-drawer__empty">Your cart is empty. Tap + on any dish to add it.</p>`;
    footer.innerHTML = '';
    return;
  }

  let total = 0;
  const rows = ids.map((id) => {
    const item = allItems.find((i) => i.id === id);
    if (!item) return '';
    const qty = cart[id];
    const lineTotal = item.price * qty;
    total += lineTotal;
    return `
      <div class="cart-drawer__row">
        <div class="cart-drawer__row-info">
          <span class="cart-drawer__row-name">${escapeDrawerText(item.name)}</span>
          <span class="cart-drawer__row-price">₹${item.price} each</span>
        </div>
        <div class="qty-stepper" role="group" aria-label="Quantity for ${escapeDrawerText(item.name)}">
          <button type="button" class="qty-stepper__btn" data-drawer-remove="${item.id}" aria-label="Decrease quantity of ${escapeDrawerText(item.name)}">−</button>
          <span class="qty-stepper__count">${qty}</span>
          <button type="button" class="qty-stepper__btn" data-drawer-add="${item.id}" aria-label="Increase quantity of ${escapeDrawerText(item.name)}">+</button>
        </div>
        <span class="cart-drawer__row-total">₹${lineTotal}</span>
      </div>
    `;
  }).join('');

  body.innerHTML = rows;
  footer.innerHTML = `
    <div class="cart-drawer__total">
      <span>Total</span>
      <strong>₹${total}</strong>
    </div>
    <a href="order.html" class="btn btn--primary btn--full">Checkout →</a>
  `;

  body.querySelectorAll('[data-drawer-add]').forEach((btn) => {
    btn.addEventListener('click', () => addToCart(btn.dataset.drawerAdd, 1));
  });
  body.querySelectorAll('[data-drawer-remove]').forEach((btn) => {
    btn.addEventListener('click', () => addToCart(btn.dataset.drawerRemove, -1));
  });
}

function escapeDrawerText(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

window.initCartDrawer = initCartDrawer;
