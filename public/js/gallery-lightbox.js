// Fullscreen lightbox for the homepage gallery. Pure vanilla JS/CSS, no
// dependency — built to sit alongside the existing gallery grid without
// changing how it's populated.

function initGalleryLightbox() {
  const frames = Array.from(document.querySelectorAll('.gallery-card__frame img'));
  if (!frames.length) return;

  const lightbox = document.getElementById('galleryLightbox');
  if (!lightbox) return;

  const imgEl = lightbox.querySelector('.gallery-lightbox__img');
  const captionEl = lightbox.querySelector('.gallery-lightbox__caption');
  const closeBtn = lightbox.querySelector('.gallery-lightbox__close');
  const prevBtn = lightbox.querySelector('.gallery-lightbox__prev');
  const nextBtn = lightbox.querySelector('.gallery-lightbox__next');
  const scrim = lightbox.querySelector('.gallery-lightbox__scrim');

  let currentIndex = 0;
  let lastFocused = null;

  function open(index) {
    currentIndex = index;
    lastFocused = document.activeElement;
    updateImage();
    lightbox.classList.add('open');
    document.body.classList.add('drawer-open');
    lightbox.setAttribute('aria-hidden', 'false');
    closeBtn.focus();
  }

  function close() {
    lightbox.classList.remove('open');
    document.body.classList.remove('drawer-open');
    lightbox.setAttribute('aria-hidden', 'true');
    if (lastFocused && document.body.contains(lastFocused)) lastFocused.focus();
  }

  function updateImage() {
    const frame = frames[currentIndex];
    imgEl.src = frame.currentSrc || frame.src;
    imgEl.alt = frame.alt || '';
    const caption = frame.closest('.gallery-card')?.querySelector('h3')?.textContent || '';
    captionEl.textContent = caption;
    const multi = frames.length > 1;
    prevBtn.style.display = multi ? '' : 'none';
    nextBtn.style.display = multi ? '' : 'none';
  }

  function showPrev() {
    currentIndex = (currentIndex - 1 + frames.length) % frames.length;
    updateImage();
  }
  function showNext() {
    currentIndex = (currentIndex + 1) % frames.length;
    updateImage();
  }

  frames.forEach((img, i) => {
    const frame = img.closest('.gallery-card__frame');
    frame.setAttribute('tabindex', '0');
    frame.setAttribute('role', 'button');
    frame.setAttribute('aria-label', `View larger image: ${img.alt || 'gallery photo'}`);
    frame.addEventListener('click', () => open(i));
    frame.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(i);
      }
    });
  });

  closeBtn.addEventListener('click', close);
  scrim.addEventListener('click', close);
  prevBtn.addEventListener('click', showPrev);
  nextBtn.addEventListener('click', showNext);

  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') showPrev();
    else if (e.key === 'ArrowRight') showNext();
    else if (e.key === 'Tab') {
      const focusable = [closeBtn, prevBtn, nextBtn].filter((el) => el.offsetParent !== null);
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
    }
  });
}

document.addEventListener('DOMContentLoaded', initGalleryLightbox);
