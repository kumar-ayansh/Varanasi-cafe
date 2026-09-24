# The Varanasi Story ☕

[![Live Website](https://img.shields.io/badge/Live%20Website-varanasi--cafe.onrender.com-C68A35?style=for-the-badge&logo=google-chrome&logoColor=white)](https://varanasi-cafe.onrender.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-62.5%25-F7DF1E?style=flat-square&logo=javascript&logoColor=000)](https://github.com/kumar-ayansh/Varanasi-cafe)
[![HTML](https://img.shields.io/badge/HTML-25.8%25-E34F26?style=flat-square&logo=html5&logoColor=fff)](https://github.com/kumar-ayansh/Varanasi-cafe)
[![CSS](https://img.shields.io/badge/CSS-11.7%25-1572B6?style=flat-square&logo=css3&logoColor=fff)](https://github.com/kumar-ayansh/Varanasi-cafe)
[![License: Unlicense](https://img.shields.io/badge/license-Unlicense-blue.svg?style=flat-square)](LICENSE)

> A warm, story-driven café and restaurant website inspired by Varanasi — with online ordering, table booking, menu management, payments, and search-engine-friendly public pages.

**The Varanasi Story** is a full-stack restaurant experience for customers and café owners. Visitors can explore the café, browse a live menu, order ahead, select a payment method, book a table, and contact the business. Owners can manage menu items, availability, specials, UPI settings, orders, and bookings through the protected admin dashboard.

## ✨ Live Project

- **Production website:** [varanasi-cafe.onrender.com](https://varanasi-cafe.onrender.com/)
- **Repository:** [kumar-ayansh/Varanasi-cafe](https://github.com/kumar-ayansh/Varanasi-cafe)

## 🚀 Features

### Customer experience

- Editorial café homepage with Varanasi-inspired visual design
- Responsive layout for mobile, tablet, and desktop
- Menu browsing with categories, images, descriptions, prices, dietary indicators, stock state, new-item badges, and special-item badges
- Client-side cart with quantity controls and persistent order flow
- Order-ahead checkout for pickup or dine-in
- Table booking with availability and time-slot selection
- Today's Special and Happy Hours content loaded from the live menu/configuration API
- Razorpay checkout integration
- Optional direct UPI payment flow with QR code support
- WhatsApp and social-link configuration support
- Gallery lightbox and reduced-motion-friendly animations
- Custom 404 page

### Admin experience

- Protected admin dashboard with signed, expiring bearer tokens
- Password hashing and password-strength validation
- Menu creation and editing
- Menu image uploads with file-type and size validation
- Item availability controls
- Today's Special management
- Happy Hours and site settings management
- Order and booking administration
- UPI ID, business-name, and QR-image configuration
- Secure separation between public read endpoints and admin write endpoints

### SEO and performance

- Semantic HTML pages with descriptive titles and meta descriptions
- Canonical URL support through the server-side renderer
- Open Graph and Twitter Card metadata injection
- Restaurant structured data on the homepage
- Dynamic `robots.txt` and `sitemap.xml` generation
- Crawl protection for admin and API routes
- `X-Robots-Tag: noindex, nofollow` for private/admin surfaces
- HTTPS and canonical-host redirect support in production
- Image dimensions, lazy loading, responsive layouts, and `fetchpriority` for important hero content
- Accessible focus states and `prefers-reduced-motion` support
- Security headers including CSP, frame protection, MIME sniffing protection, and a strict referrer policy

## 🧱 Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Backend | Node.js, Express |
| Payments | Razorpay and optional UPI checkout |
| Data | Local JSON by default, PostgreSQL when `DATABASE_URL` is configured |
| Optional infrastructure | Redis-backed rate limiting through `REDIS_URL` |
| Fonts | Cormorant Garamond and Karla via Google Fonts |
| Deployment | Compatible with Render and other Node.js hosting platforms |

## 📁 Project Structure

```text
.
├── data/                    # Runtime JSON data and local application state
├── public/
│   ├── css/                 # Shared visual system and responsive styles
│   ├── images/              # Café, menu, logo, and uploaded media assets
│   ├── js/                  # Frontend modules and shared browser logic
│   ├── index.html           # SEO-focused homepage
│   ├── menu.html            # Live menu and cart interface
│   ├── order.html           # Checkout and payment flow
│   ├── booking.html         # Table reservation interface
│   ├── about.html           # About page
│   ├── contact.html         # Contact page
│   ├── admin.html           # Protected admin interface
│   ├── 404.html             # Custom not-found page
│   ├── robots.txt           # Crawler directives
│   └── sitemap.xml          # Public page sitemap fallback
├── server/
│   ├── index.js             # Express app, middleware, static serving, SEO routes
│   ├── routes/               # Menu, order, booking, payment, and UPI APIs
│   ├── render.js             # Server-side SEO metadata injection
│   ├── seo.js                # Canonical URLs, page metadata, and contact data
│   ├── auth.js               # Signed admin-token authentication
│   ├── settings.js           # Admin settings and UPI configuration
│   ├── menu-store.js         # Menu persistence and image handling
│   ├── db.js                 # JSON/PostgreSQL backend selector
│   ├── db-json.js            # Local JSON database adapter
│   ├── db-pg.js              # PostgreSQL database adapter
│   ├── rateLimit.js          # Redis/in-memory rate limiting
│   └── whatsapp.js            # WhatsApp notification helpers
├── package.json
└── README.md
```

## 🛠️ Local Development

### Prerequisites

- Node.js 18 or newer
- npm
- A Razorpay account if online payments are enabled
- PostgreSQL and/or Redis only if you choose those production backends

### Install and run

```bash
git clone https://github.com/kumar-ayansh/Varanasi-cafe.git
cd Varanasi-cafe
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

For a normal production-style start:

```bash
npm start
```

## 🔐 Environment Configuration

Create a `.env` file in the project root. Never commit real credentials.

```env
# Server
PORT=3000
NODE_ENV=development
SITE_URL=http://localhost:3000
ALLOWED_ORIGIN=http://localhost:3000

# Admin authentication
ADMIN_PASSWORD=replace-with-a-strong-password
ADMIN_TOKEN_SECRET=replace-with-a-long-random-secret

# Optional PostgreSQL backend
# DATABASE_URL=postgresql://user:password@host:5432/database

# Optional shared rate limiting
# REDIS_URL=redis://localhost:6379

# Optional customer contact/notifications
# OWNER_WHATSAPP=919999999999

# Razorpay - use the exact variable names expected by the payment routes
# RAZORPAY_KEY_ID=your-key-id
# RAZORPAY_KEY_SECRET=your-key-secret
# RAZORPAY_WEBHOOK_SECRET=your-webhook-secret
```

Generate a strong token secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

> **Production security:** set `NODE_ENV=production`, use a unique `ADMIN_TOKEN_SECRET`, restrict `ALLOWED_ORIGIN` to the real website origin, use HTTPS, and keep payment/database credentials outside the repository.

## 🗄️ Data Backends

The application selects its primary order/booking/menu backend automatically:

- If `DATABASE_URL` is not set, it uses the local JSON backend. This is convenient for local development and small deployments.
- If `DATABASE_URL` is set, it uses PostgreSQL through the database adapter.
- When the JSON backend is active, the server creates daily backups and keeps the latest 14 backup files.
- The settings store remains local JSON for small admin-managed settings such as the admin password hash, item availability, Today's Special, and UPI configuration.

To migrate JSON data to PostgreSQL:

```bash
npm run migrate:json-to-pg
```

Review the migration script and database credentials before running it against production data.

## 🔌 Public Pages and API Areas

### Public pages

| Page | Purpose |
| --- | --- |
| `/` | Homepage, café story, gallery, specials, and conversion CTAs |
| `/menu.html` | Menu browsing and cart management |
| `/order.html` | Order review and payment |
| `/booking.html` | Table booking |
| `/about.html` | Café story and brand information |
| `/contact.html` | Contact and visit information |

### Main API areas

| Area | Purpose |
| --- | --- |
| `/api/menu` | Public menu reads and protected menu administration |
| `/api/orders` | Customer order creation and admin order management |
| `/api/bookings` | Availability, booking creation, and admin booking management |
| `/api/payment` | Razorpay order/payment operations |
| `/api/upi` | UPI configuration and customer checkout data |
| `/api/admin` | Admin login and password management |
| `/api/config` | Public-safe contact and WhatsApp configuration |
| `/robots.txt` | Runtime crawler directives and sitemap location |
| `/sitemap.xml` | Runtime sitemap for public pages |

> API and admin routes are intentionally excluded from search indexing. Do not expose private credentials or internal API responses in public metadata.

## 🔎 SEO Implementation Notes

This project is designed around local restaurant discovery and conversion-oriented search intent, including:

- Café and restaurant searches in Varanasi
- Chai, pizza, Maggie, and comfort-food discovery
- Online food ordering and order-ahead searches
- Table reservation and dining-intent searches
- Local business, opening-hours, and contact queries

When deploying to a new domain:

1. Set `SITE_URL` to the canonical HTTPS origin without a trailing slash.
2. Verify that canonical links, Open Graph URLs, `robots.txt`, and `sitemap.xml` use the production domain.
3. Add the domain to Google Search Console and submit `/sitemap.xml`.
4. Keep public page titles and descriptions unique and aligned with the actual page content.
5. Replace placeholder contact/social configuration with real business information.
6. Add high-quality, compressed images with descriptive `alt` text.
7. Keep `/admin.html` and `/api/` non-indexable.
8. Validate structured data with Google's Rich Results Test before launch.

## 🚢 Deployment Checklist

- [ ] Set `NODE_ENV=production`.
- [ ] Set a strong `ADMIN_TOKEN_SECRET`.
- [ ] Set a strong `ADMIN_PASSWORD`, then change it from the admin dashboard.
- [ ] Configure `SITE_URL` with the canonical HTTPS domain.
- [ ] Restrict `ALLOWED_ORIGIN` to the production frontend origin.
- [ ] Configure Razorpay keys and webhook verification if online payments are enabled.
- [ ] Choose JSON or PostgreSQL persistence and verify backups.
- [ ] Configure Redis for shared rate limiting when running multiple instances.
- [ ] Confirm the production domain, sitemap, robots rules, and canonical metadata.
- [ ] Test menu browsing, cart updates, order creation, booking availability, payment callbacks, and admin authentication.
- [ ] Confirm that secrets, runtime data, uploads, and backups are excluded from version control.

## 🧪 Available Scripts

| Command | Description |
| --- | --- |
| `npm install` | Install dependencies |
| `npm run dev` | Start the server with Node.js watch mode |
| `npm start` | Start the application |
| `npm run migrate:json-to-pg` | Migrate JSON data to PostgreSQL |

## 🤝 Contributing

1. Fork the repository.
2. Create a feature branch:

   ```bash
   git checkout -b feat/your-change
   ```

3. Make focused changes and test the affected customer/admin flows.
4. Keep secrets and production data out of commits.
5. Open a pull request with a clear explanation and screenshots for UI changes.

## 📄 License

This project is released under the [Unlicense](LICENSE), meaning it is dedicated to the public domain where legally possible.

## 👤 Author

Built by [Ayansh Kumar Yadav](https://ayansh.me).

---

<p align="center">
  Made with ❤️ for Varanasi, chai, stories, and slow evenings.
</p>
