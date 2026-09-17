// Menu data for The Varanasi Story Cafe & Restaurant.
// Transcribed from the physical menu photos. Prices marked "approx: true"
// were hard to read precisely in the photo — PLEASE double check these
// against your printed menu and correct in this file before going live.
// Prices are in INR (paise not used — Razorpay conversion handled in payment.js).
// `veg: true` on every item reflects that the entire printed menu is
// vegetarian (no meat/egg/fish items appear anywhere in the source photos).
// If non-veg items are ever added, mark them `veg: false` explicitly.

const menu = {
  chaiCoffee: {
    label: 'Chai & Coffee',
    items: [
      { id: 'cc-1', name: 'Adrak Chai', veg: true, price: 15 },
      { id: 'cc-2', name: 'Elaichi Chai', veg: true, price: 19 },
      { id: 'cc-3', name: 'Lemon Chai', veg: true, price: 19 },
      { id: 'cc-4', name: 'Hot Coffee', veg: true, price: 29 },
      { id: 'cc-5', name: 'Black Coffee', veg: true, price: 29 },
      { id: 'cc-6', name: 'Strong Choco Coffee', veg: true, price: 59, approx: true },
      { id: 'cc-7', name: 'Cold Coffee', veg: true, price: 69, approx: true },
      { id: 'cc-8', name: 'Cold Coffee with Ice Cream', veg: true, price: 49, approx: true },
      { id: 'cc-9', name: 'Special Cold Coffee', veg: true, price: 79 }
    ]
  },
  shakes: {
    label: 'Shakes',
    items: [
      { id: 'sh-1', name: 'Rose Shake', veg: true, price: 69, approx: true },
      { id: 'sh-2', name: 'Mango Shake', veg: true, price: 69, approx: true },
      { id: 'sh-3', name: 'Vanilla Shake', veg: true, price: 69, approx: true },
      { id: 'sh-4', name: 'Oreo Shake', veg: true, price: 69, approx: true },
      { id: 'sh-5', name: 'KitKat Shake', veg: true, price: 79, approx: true }
    ]
  },
  maggie: {
    label: 'Maggie',
    items: [
      { id: 'mg-1', name: 'Plain Maggie', veg: true, price: 49, approx: true },
      { id: 'mg-2', name: 'Veg Maggie', veg: true, price: 89, approx: true },
      { id: 'mg-3', name: 'Cheese Maggie', veg: true, price: 69, approx: true },
      { id: 'mg-4', name: 'Sichuan Maggie', veg: true, price: 59, approx: true },
      { id: 'mg-5', name: 'Bucket Maggie', veg: true, price: 99, approx: true }
    ]
  },
  biteFrie: {
    label: 'Bite & Frie',
    items: [
      { id: 'bf-1', name: 'Maska Bun', veg: true, price: 20, approx: true },
      { id: 'bf-2', name: 'Garlic Bun', veg: true, price: 45, approx: true },
      { id: 'bf-3', name: 'Veg Bun', veg: true, price: 55, approx: true },
      { id: 'bf-4', name: 'Cheese Garlic Bun', veg: true, price: 65, approx: true },
      { id: 'bf-5', name: 'French Fries', veg: true, price: 75, approx: true },
      { id: 'bf-6', name: 'Peri Peri Fries', veg: true, price: 89, approx: true }
    ]
  },
  pizza: {
    label: 'Pizza',
    items: [
      { id: 'pz-1', name: 'Veg Pizza', veg: true, price: 99, approx: true },
      { id: 'pz-2', name: 'Margherita Pizza', veg: true, price: 110, approx: true },
      { id: 'pz-3', name: 'Corn Pizza', veg: true, price: 139, approx: true },
      { id: 'pz-4', name: 'Mix Veg Pizza', veg: true, price: 159, approx: true },
      { id: 'pz-5', name: 'Paneer Pizza', veg: true, price: 179, approx: true },
      { id: 'pz-6', name: 'Tandoori Paneer Pizza', veg: true, price: 219, approx: true },
      { id: 'pz-7', name: 'Paneer Tikka Pizza', veg: true, price: 229, approx: true },
      { id: 'pz-8', name: "TVS Special Topping Pizza", veg: true, price: 300, approx: true }
    ]
  },
  sandwich: {
    label: 'Sandwich',
    items: [
      { id: 'sw-1', name: 'Veg Grill Sandwich', veg: true, price: 45, approx: true },
      { id: 'sw-2', name: 'Veg Cheese Sandwich', veg: true, price: 89, approx: true },
      { id: 'sw-3', name: 'Veg Paneer Sandwich', veg: true, price: 89, approx: true },
      { id: 'sw-4', name: 'Veg Crispy Potato Sandwich', veg: true, price: 99, approx: true },
      { id: 'sw-5', name: 'Veg Crispy Paneer Sandwich', veg: true, price: 99, approx: true },
      { id: 'sw-6', name: 'TVS Special Sandwich', veg: true, price: 109, approx: true }
    ]
  },
  noodlesPasta: {
    label: 'Noodles & Pasta',
    items: [
      { id: 'np-1', name: 'Veg Noodles', veg: true, price: 69, halfPrice: 99, approx: true },
      { id: 'np-2', name: 'Paneer Noodles', veg: true, price: 99, halfPrice: 139, approx: true },
      { id: 'np-3', name: 'Mushroom Noodles', veg: true, price: 99, halfPrice: 139, approx: true },
      { id: 'np-4', name: 'Hakka Noodles', veg: true, price: 99, halfPrice: 179, approx: true },
      { id: 'np-5', name: 'Schezwan Noodles', veg: true, price: 99, halfPrice: 180, approx: true },
      { id: 'np-6', name: 'Veg Pasta', veg: true, price: 159, approx: true },
      { id: 'np-7', name: 'White Sauce Pasta', veg: true, price: 179, approx: true },
      { id: 'np-8', name: 'Red Sauce Pasta', veg: true, price: 179, approx: true }
    ]
  },
  momosRoll: {
    label: 'Momos & Roll',
    items: [
      { id: 'mr-1', name: 'Veg Soya Momos', veg: true, price: 110, approx: true },
      { id: 'mr-2', name: 'Veg Paneer Momos', veg: true, price: 130, approx: true },
      { id: 'mr-3', name: 'Veg Kurkure Momos', veg: true, price: 150, approx: true },
      { id: 'mr-4', name: 'Veg Roll', veg: true, price: 59, approx: true },
      { id: 'mr-5', name: 'Spring Roll', veg: true, price: 69, approx: true },
      { id: 'mr-6', name: 'Paneer Roll', veg: true, price: 79, approx: true }
    ]
  },
  burgerWrap: {
    label: 'Burger & Wrap',
    items: [
      { id: 'bw-1', name: 'Veg Burger', veg: true, price: 45, approx: true },
      { id: 'bw-2', name: 'Veg Cheese Burger', veg: true, price: 59, approx: true },
      { id: 'bw-3', name: 'Veg Paneer Burger', veg: true, price: 69, approx: true },
      { id: 'bw-4', name: 'Veg Paneer Cheese Burger', veg: true, price: 79, approx: true },
      { id: 'bw-5', name: 'TVS Special Burger', veg: true, price: 99, approx: true },
      { id: 'bw-6', name: 'Mix Vegetable Wrap', veg: true, price: 119, approx: true },
      { id: 'bw-7', name: 'Paneer Wrap', veg: true, price: 139, approx: true },
      { id: 'bw-8', name: 'Cheese Corn Wrap', veg: true, price: 139, approx: true }
    ]
  },
  chinese: {
    label: 'Chinese',
    items: [
      { id: 'ch-1', name: 'Baby Corn', veg: true, price: 199, halfPrice: 110, approx: true },
      { id: 'ch-2', name: 'Crispy Baby Corn', veg: true, price: 199, halfPrice: 110, approx: true },
      { id: 'ch-3', name: 'Honey Chilli Potato', veg: true, price: 179, halfPrice: 99, approx: true },
      { id: 'ch-4', name: 'Chilli Potato', veg: true, price: 179, halfPrice: 99, approx: true },
      { id: 'ch-5', name: 'Manchurian Dry', veg: true, price: 199, halfPrice: 110, approx: true },
      { id: 'ch-6', name: 'Chilli Paneer Gravy', veg: true, price: 199, halfPrice: 110, approx: true },
      { id: 'ch-7', name: 'Manchurian Gravy', veg: true, price: 179, halfPrice: 99, approx: true },
      { id: 'ch-8', name: 'Sweet Corn', veg: true, price: 79, halfPrice: 55, approx: true },
      { id: 'ch-9', name: 'Peri Peri Corn', veg: true, price: 79, halfPrice: 55, approx: true }
    ]
  },
  friedRice: {
    label: 'Fried Rice',
    items: [
      { id: 'fr-1', name: 'Veg Fried Rice', veg: true, price: 139, halfPrice: 79, approx: true },
      { id: 'fr-2', name: 'Paneer Fried Rice', veg: true, price: 179, halfPrice: 99, approx: true },
      { id: 'fr-3', name: 'Mushroom Fried Rice', veg: true, price: 189, halfPrice: 99, approx: true },
      { id: 'fr-4', name: 'Manchurian Fried Rice', veg: true, price: 189, halfPrice: 99, approx: true },
      { id: 'fr-5', name: 'Schezwan Fried Rice', veg: true, price: 199, halfPrice: 109, approx: true },
      { id: 'fr-6', name: 'Veg Biryani', veg: true, price: 149, halfPrice: 79, approx: true },
      { id: 'fr-7', name: 'Paneer Biryani', veg: true, price: 249, halfPrice: 150, approx: true }
    ]
  },
  extraTopping: {
    label: 'Extra Topping',
    items: [
      { id: 'et-1', name: 'Onion', veg: true, price: 20, approx: true },
      { id: 'et-2', name: 'Tomato', veg: true, price: 20, approx: true },
      { id: 'et-3', name: 'Capsicum', veg: true, price: 20, approx: true }
    ]
  },
  combos: {
    label: 'Special Combos',
    items: [
      { id: 'cb-1', name: 'Maska Bun + Adrak Chai', veg: true, price: 35 },
      { id: 'cb-2', name: 'Veg Maggi + Cold Coffee', veg: true, price: 89 },
      { id: 'cb-3', name: 'Veg Burger + Fries + Cold Coffee', veg: true, price: 150 },
      { id: 'cb-4', name: 'Manchurian + Veg Noodles', veg: true, price: 140 }
    ]
  },
  groupCombos: {
    label: 'Group Combos',
    items: [
      { id: 'gc-1', name: 'Buddy Combo (2 People) — 2 Veg Burgers + 2 Cold Coffees', veg: true, price: 189 },
      { id: 'gc-2', name: 'Friends Combo (3 People) — 1 Medium Veg Pizza + 3 Adrak Chai', veg: true, price: 209 },
      { id: 'gc-3', name: 'Friends Group Combo (4 People) — 1 Medium Mix Veg Pizza + French Fries + 4 Adrak Chai', veg: true, price: 339 }
    ]
  }
};

// Happy Hours: Mon–Fri, 2:00 PM – 5:00 PM
const happyHours = {
  days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  start: '14:00',
  end: '17:00',
  deals: [
    { name: 'Any Tea + Plain Maggi', price: 49 },
    { name: 'Veg Burger + Tea', price: 59 },
    { name: 'Cold Coffee + French Fries', price: 99 },
    { name: 'Buy 2 Shakes, Get 1 Plain Maggie FREE', price: null }
  ]
};

const loyalty = {
  chaiStamp: 'Buy 9 Chai, Get the 10th Chai FREE',
  spendReward: 'Spend ₹500 and Get ₹50 OFF on Your Next Visit'
};

module.exports = { menu, happyHours, loyalty };
