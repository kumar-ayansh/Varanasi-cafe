// Shared UI behaviour: mobile nav drawer + scroll-reveal micro-interactions.
// Pure progressive enhancement — no effect on menu/cart/order/booking logic.

function initMobileDrawer() {
  const toggle = document.querySelector('.nav-toggle');
  const drawer = document.querySelector('.mobile-drawer');
  if (!toggle || !drawer) return;

  const closeBtn = drawer.querySelector('.mobile-drawer__close');
  const scrim = drawer.querySelector('.mobile-drawer__scrim');
  const links = drawer.querySelectorAll('a');

  function openDrawer() {
    drawer.classList.add('open');
    document.body.classList.add('drawer-open');
    toggle.setAttribute('aria-expanded', 'true');
    const firstLink = drawer.querySelector('a');
    if (firstLink) firstLink.focus();
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    document.body.classList.remove('drawer-open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }

  toggle.addEventListener('click', () => {
    if (drawer.classList.contains('open')) closeDrawer();
    else openDrawer();
  });
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (scrim) scrim.addEventListener('click', closeDrawer);
  links.forEach((a) => a.addEventListener('click', closeDrawer));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });
}

function initScrollReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    items.forEach((el) => el.classList.add('is-visible'));
    return;
  }

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  items.forEach((el) => io.observe(el));
}

document.addEventListener('DOMContentLoaded', () => {
  initMobileDrawer();
  initScrollReveal();
});
