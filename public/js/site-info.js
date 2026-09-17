// Shared across every page. Reads the real business contact info from
// /api/config (server/seo.js#getPublicContactInfo — sourced from .env,
// never invented) and:
//   1. Reveals the header's social icons + footer social/contact blocks,
//      but only for links that are actually configured.
//   2. On contact.html, fills in the full contact list, showing a clearly
//      marked "not set up yet" placeholder for anything still missing.
//
// Pure progressive enhancement — no effect on menu/cart/order/booking logic.

function socialIconLinks(social) {
  return { instagram: social.instagram, facebook: social.facebook, youtube: social.youtube, twitter: social.twitter };
}

// Reveals every [data-social="instagram|facebook|youtube|twitter|whatsapp"]
// link found anywhere on the page (nav icon cluster + footer) if — and
// only if — that link is actually configured. Left hidden otherwise, so
// no dead/fake social icons ever show up.
function applySocialLinks(contact) {
  const links = {
    instagram: contact.social.instagram,
    facebook: contact.social.facebook,
    youtube: contact.social.youtube,
    twitter: contact.social.twitter,
    whatsapp: contact.whatsapp ? `https://wa.me/${contact.whatsapp}` : ''
  };

  Object.keys(links).forEach((key) => {
    const url = links[key];
    document.querySelectorAll(`[data-social="${key}"]`).forEach((el) => {
      if (url) {
        el.href = url;
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });
  });
}

function formatHours(hours) {
  if (!hours) return '';
  const to12h = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
  };
  return `${to12h(hours.opens)} – ${to12h(hours.closes)}`;
}

// Renders one contact-page row: either the real linked value, or a
// dashed, clearly-labelled placeholder — never a fake number/address
// dressed up as real.
function renderContactRow({ container, icon, label, value, href }) {
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'contact-item';
  const valueHtml = value
    ? (href ? `<a href="${href}">${value}</a>` : `<span>${value}</span>`)
    : `<span class="contact-placeholder">Not added yet</span>`;
  row.innerHTML = `
    <span class="contact-item__icon" aria-hidden="true">${icon}</span>
    <div>
      <div class="contact-item__label">${label}</div>
      <div class="contact-item__value">${valueHtml}</div>
    </div>
  `;
  container.appendChild(row);
}

function renderContactPage(contact) {
  const list = document.getElementById('contactList');
  if (!list) return; // not on contact.html

  list.innerHTML = '';

  renderContactRow({
    container: list, icon: '📞', label: 'Phone',
    value: contact.phone, href: contact.phone ? `tel:${contact.phone}` : ''
  });
  renderContactRow({
    container: list, icon: '💬', label: 'WhatsApp',
    value: contact.whatsapp ? contact.whatsapp : '', href: contact.whatsapp ? `https://wa.me/${contact.whatsapp}` : ''
  });
  renderContactRow({
    container: list, icon: '✉️', label: 'Email',
    value: contact.email, href: contact.email ? `mailto:${contact.email}` : ''
  });
  renderContactRow({
    container: list, icon: '📍', label: 'Address',
    value: contact.address, href: contact.mapsUrl || ''
  });
  renderContactRow({
    container: list, icon: '🕚', label: 'Opening Hours',
    value: formatHours(contact.hours)
  });

  const mapWrap = document.getElementById('contactMap');
  if (mapWrap) {
    if (contact.mapsUrl) {
      mapWrap.innerHTML = `<a class="btn btn--outline" href="${contact.mapsUrl}" target="_blank" rel="noopener">Get Directions →</a>`;
    } else {
      mapWrap.innerHTML = `<p class="contact-placeholder">Google Maps link not added yet.</p>`;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/config')
    .then((r) => r.json())
    .then(({ contact }) => {
      if (!contact) return;
      applySocialLinks(contact);
      renderContactPage(contact);
    })
    .catch(() => {});
});
