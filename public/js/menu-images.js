// Maps a menu item to real photography when we actually have a matching
// photo, and to an elegant category placeholder otherwise.
//
// We only have ONE real dish photograph in the project (images/dish-pasta.webp,
// an actual photo taken at the cafe). It is only ever used for items that are
// genuinely pasta — every other item gets a tasteful icon placeholder rather
// than a mismatched stock/fake photo. If real per-item photography is added
// later (an `image` field on a menu item, or a new file under images/dishes/),
// this is the only place that needs to change.

const CATEGORY_PLACEHOLDER = {
  chaiCoffee: { icon: '☕', label: 'Chai & Coffee' },
  shakes: { icon: '🥤', label: 'Shakes' },
  maggie: { icon: '🍜', label: 'Maggie' },
  biteFrie: { icon: '🥖', label: 'Bite & Frie' },
  pizza: { icon: '🍕', label: 'Pizza' },
  sandwich: { icon: '🥪', label: 'Sandwich' },
  noodlesPasta: { icon: '🍝', label: 'Noodles & Pasta' },
  momosRoll: { icon: '🥟', label: 'Momos & Roll' },
  burgerWrap: { icon: '🌯', label: 'Burger & Wrap' },
  chinese: { icon: '🥢', label: 'Chinese' },
  friedRice: { icon: '🍚', label: 'Fried Rice' },
  extraTopping: { icon: '🧄', label: 'Extra Topping' },
  combos: { icon: '🎁', label: 'Special Combos' },
  groupCombos: { icon: '🎉', label: 'Group Combos' }
};

const REAL_PHOTOS = [
  { test: /pasta/i, src: 'images/dish-pasta.webp' }
];

/**
 * Returns either { type: 'photo', src, alt } or { type: 'icon', icon, label }
 * for a given menu item + its category key.
 */
function getMenuItemImage(item, categoryKey) {
  // Future-proofing: if menu data ever gains a real `image` field, prefer it.
  if (item && item.image) {
    return { type: 'photo', src: item.image, alt: item.name };
  }
  if (item && item.name) {
    const match = REAL_PHOTOS.find((p) => p.test.test(item.name));
    if (match) return { type: 'photo', src: match.src, alt: item.name };
  }
  const cat = CATEGORY_PLACEHOLDER[categoryKey];
  return { type: 'icon', icon: cat ? cat.icon : '🍽️', label: cat ? cat.label : 'Dish' };
}

/**
 * Best-effort match for the homepage "Today's Special" banner, which is set
 * by the admin as free text (title/description) with no linked item id or
 * image. We try to find a menu item whose name appears in the special's
 * title so a real dish photo can be used when we genuinely have one;
 * otherwise we fall back to a tasteful placeholder instead of showing an
 * unrelated dish photo.
 */
function getSpecialImage(special, allMenuCategories) {
  if (!special || !special.title) return { type: 'icon', icon: '🌟', label: "Today's Special" };
  const titleLower = special.title.toLowerCase();
  for (const [key, cat] of Object.entries(allMenuCategories || {})) {
    for (const item of cat.items) {
      if (titleLower.includes(item.name.toLowerCase())) {
        return getMenuItemImage(item, key);
      }
    }
  }
  return { type: 'icon', icon: '🌟', label: "Today's Special" };
}
