// Renders the Founders/Owners section on about.html from the FOUNDERS array
// in founders-data.js. Supports any number of founders — just add entries
// to that array, no changes needed here.

document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('foundersGrid');
  if (!grid || typeof FOUNDERS === 'undefined') return;

  grid.innerHTML = FOUNDERS.map((f) => `
    <div class="founder-card">
      <div class="founder-card__photo">
        ${
          f.photo
            ? `<img src="${f.photo}" alt="${f.name}" loading="lazy">`
            : `<div class="founder-card__photo-placeholder" aria-hidden="true">🪔</div>`
        }
      </div>
      <h3>${f.name}</h3>
      <span class="founder-card__role">${f.role}</span>
      <p>${f.bio}</p>
    </div>
  `).join('');
});
