// Shared cart utilities used across menu.html, order.html and the nav badge.
// Cart lives in localStorage — this is a real website (not a sandboxed
// artifact), so browser storage works fine and persists a visitor's cart
// between pages.

const CART_KEY = 'tvs_cart_v1';

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || {};
  } catch {
    return {};
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
  // Lets any other UI reading the same cart (e.g. the mobile cart drawer)
  // stay in sync without keeping a second copy of the cart state.
  document.dispatchEvent(new CustomEvent('cart:changed'));
}

function addToCart(id, qty = 1) {
  const cart = getCart();
  cart[id] = (cart[id] || 0) + qty;
  if (cart[id] <= 0) delete cart[id];
  saveCart(cart);
}

function setQty(id, qty) {
  const cart = getCart();
  if (qty <= 0) delete cart[id];
  else cart[id] = qty;
  saveCart(cart);
}

function clearCart() {
  localStorage.removeItem(CART_KEY);
  updateCartBadge();
}

function cartItemCount() {
  return Object.values(getCart()).reduce((sum, q) => sum + q, 0);
}

function updateCartBadge() {
  const count = cartItemCount();
  ['navCartBadge', 'navCartBadgeMobile'].forEach((id) => {
    const badge = document.getElementById(id);
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
  });
}

document.addEventListener('DOMContentLoaded', updateCartBadge);
