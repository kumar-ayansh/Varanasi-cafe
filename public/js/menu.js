let MENU_DATA = null;

async function loadMenu() {
  const res = await fetch('/api/menu');
  const data = await res.json();
  MENU_DATA = data.menu;
  renderTabs();
  renderCategories();
  renderCartBar();
  if (window.initCartDrawer) window.initCartDrawer(MENU_DATA);
  highlightFromQueryString();
}

// Supports the homepage NEW/SPECIAL ticker: a click there links to
// menu.html?highlight=<itemId>, and once the menu has rendered we scroll to
// that card, give it a brief highlight, and draw attention to Add to Order.
function highlightFromQueryString() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('highlight');
  if (!id) return;
  const card = document.querySelector(`[data-item-id="${CSS.escape(id)}"]`);
  if (!card) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  card.classList.add('menu-card--highlight');
  setTimeout(() => card.classList.remove('menu-card--highlight'), 2600);
  // Draw the eye straight to the action, not just the card.
  const addControl = card.querySelector('.menu-card__add, .qty-stepper__btn');
  if (addControl) {
    setTimeout(() => addControl.focus({ preventScroll: true }), 500);
  }
}

function renderTabs() {
  const tabs = document.getElementById('menuTabs');
  tabs.innerHTML = Object.entries(MENU_DATA).map(([key, cat], i) => `
    <button class="menu-tab ${i === 0 ? 'active' : ''}" data-target="cat-${key}">${cat.label}</button>
  `).join('');

  tabs.querySelectorAll('.menu-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      tabs.querySelectorAll('.menu-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.target).scrollIntoView({ behavior: 'smooth' });
    });
  });
}

function renderCategories() {
  const wrap = document.getElementById('menuCategories');
  wrap.innerHTML = Object.entries(MENU_DATA).map(([key, cat]) => `
    <div class="menu-category" id="cat-${key}">
      <h2>${cat.label}</h2>
      <div class="menu-grid">
        ${cat.items.map((item) => renderItemCard(item, key)).join('')}
      </div>
    </div>
  `).join('');

  wrap.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => {
      addToCart(btn.dataset.add, 1);
      renderCategories();
      renderCartBar();
    });
  });
  wrap.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      addToCart(btn.dataset.remove, -1);
      renderCategories();
      renderCartBar();
    });
  });
}

function renderMedia(item, categoryKey, statusBadges) {
  const media = getMenuItemImage(item, categoryKey);
  const vegBadge = item.veg === true
    ? `<span class="veg-badge veg" role="img" aria-label="Vegetarian"><span class="veg-badge__dot"></span></span>`
    : item.veg === false
      ? `<span class="veg-badge nonveg" role="img" aria-label="Non-vegetarian"><span class="veg-badge__dot"></span></span>`
      : '';
  const statusWrap = statusBadges ? `<div class="status-badge-row">${statusBadges}</div>` : '';

  if (media.type === 'photo') {
    return `
      <div class="menu-card__media">
        <img src="${media.src}" alt="${escapeAttr(media.alt || item.name)}" loading="lazy" width="400" height="300">
        ${vegBadge}
        ${statusWrap}
      </div>
    `;
  }
  return `
    <div class="menu-card__media menu-card__media--placeholder">
      <div class="menu-card__placeholder" aria-hidden="true"><span>${media.icon}</span></div>
      ${vegBadge}
      ${statusWrap}
    </div>
  `;
}

function renderItemCard(item, categoryKey) {
  const cart = getCart();
  const qty = cart[item.id] || 0;
  const outOfStock = item.available === false;

  const priceLabel = item.halfPrice
    ? `₹${item.halfPrice} <span class="menu-card__price-half">half</span> · ₹${item.price} <span class="menu-card__price-half">full</span>`
    : `₹${item.price}`;

  const statusBadges = [
    item.isNew ? `<span class="status-badge status-badge--new">New</span>` : '',
    item.isSpecial ? `<span class="status-badge status-badge--special">Special</span>` : ''
  ].filter(Boolean).join('');

  const controls = outOfStock
    ? `<span class="menu-card__oos">Out of Stock</span>`
    : qty > 0
      ? `
        <div class="qty-stepper" role="group" aria-label="Quantity for ${escapeAttr(item.name)}">
          <button type="button" class="qty-stepper__btn" data-remove="${item.id}" aria-label="Decrease quantity of ${escapeAttr(item.name)}">−</button>
          <span class="qty-stepper__count">${qty}</span>
          <button type="button" class="qty-stepper__btn" data-add="${item.id}" aria-label="Increase quantity of ${escapeAttr(item.name)}">+</button>
        </div>
      `
      : `<button type="button" class="btn btn--gold menu-card__add" data-add="${item.id}">Add to Order</button>`;

  return `
    <article class="menu-card ${outOfStock ? 'menu-card--oos' : ''}" id="menu-item-${item.id}" data-item-id="${item.id}">
      ${renderMedia(item, categoryKey, statusBadges)}
      <div class="menu-card__body">
        <div class="menu-card__top">
          <h3 class="menu-card__name">${escapeAttr(item.name)}</h3>
          <span class="menu-card__price">${priceLabel}</span>
        </div>
        ${item.description ? `<p class="menu-card__desc">${escapeAttr(item.description)}</p>` : ''}
        ${item.approx ? '<p class="menu-card__approx">Price to be confirmed in-cafe</p>' : ''}
        <div class="menu-card__footer">
          ${controls}
        </div>
      </div>
    </article>
  `;
}

function escapeAttr(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderCartBar() {
  const cart = getCart();
  const ids = Object.keys(cart);
  const bar = document.getElementById('cartBar');
  if (ids.length === 0) {
    bar.classList.remove('visible');
    const mobileCta = document.getElementById('mobileCartCta');
    if (mobileCta) mobileCta.classList.remove('visible');
    return;
  }
  bar.classList.add('visible');
  const allItems = Object.values(MENU_DATA).flatMap((c) => c.items);
  let count = 0, total = 0;
  ids.forEach((id) => {
    const item = allItems.find((i) => i.id === id);
    if (!item) return;
    count += cart[id];
    total += item.price * cart[id];
  });
  document.getElementById('cartCount').textContent = count;
  document.getElementById('cartTotal').textContent = `₹${total}`;

  const mobileCta = document.getElementById('mobileCartCta');
  if (mobileCta) {
    mobileCta.classList.toggle('visible', ids.length > 0);
    const itemsLabel = document.getElementById('mobileCartItemsLabel');
    const totalLabel = document.getElementById('mobileCartTotalLabel');
    if (itemsLabel) itemsLabel.textContent = `${count} item${count === 1 ? '' : 's'}`;
    if (totalLabel) totalLabel.textContent = `₹${total}`;
  }
}

// Re-render whenever the cart drawer changes quantities, so the grid stays
// in sync without maintaining a second copy of cart state.
document.addEventListener('cart:changed', () => {
  if (MENU_DATA) {
    renderCategories();
    renderCartBar();
  }
});

document.addEventListener('DOMContentLoaded', loadMenu);
