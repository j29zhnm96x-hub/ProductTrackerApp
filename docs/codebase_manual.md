# Stand Tracker — Codebase Manual

## Tech Stack
- **HTML5** — Single-page app shell s 5 viewoa
- **CSS3** — Custom properties (design tokens), iPhone PWA-first, nema frameworka
- **Vanilla JavaScript (ES6+)** — IIFE pattern, localStorage perzistencija
- **Service Worker** — Cache-first strategija, offline podrška
- **PWA Manifest** — iOS "Add to Home Screen" podrška

## Architecture
Single HTML file, sve logike u jednom JS fajlu, sav state u localStorage-u. Nema build stepa, nema dependency-ja. Statički site — deploya se direktno na CloudFlare Pages.

## Directory Structure
```
/
├── index.html          # App shell — svih 5 viewoa
├── styles.css          # Svi stilovi (875 linija)
├── app.js              # Sva logika (911 linija)
├── service-worker.js   # Offline caching
├── manifest.json       # PWA manifest
├── icons/              # PWA ikone (dodati naknadno)
│   └── README.md
└── docs/
    ├── todo.md
    ├── changes.md
    └── codebase_manual.md
```

## Systems & Ownership

| System | File(s) | Description |
|--------|---------|-------------|
| App Shell | `index.html` | HTML struktura, svih 5 viewoa, template elementi |
| Styling | `styles.css` | Design tokens (`:root`), svi layouti, responsive, dark theme |
| Data Layer | `app.js` (L55-L155) | loadData, saveData, CRUD za kategorije/varijante, session management |
| Navigation | `app.js` (L240-L297) | showView, goHome, goCategories, goVariants, goHistory, goAdmin |
| Rendering | `app.js` (L299-L530) | renderHome, renderCategories, renderVariants, renderHistory, renderAdmin |
| Counter Logic | `app.js` (L532-L687) | handleCounterClick, updateCategoryBadge, animacije |
| Share & Reset | `app.js` (L689-L750) | shareAndReset, buildReportText, Web Share API + clipboard fallback |
| Product Creation | `app.js` (L752-L820) | promptNewCategory, promptNewVariant |
| Init | `app.js` (L822-L911) | Event wiring, SW registration, cross-day detection |
| PWA/Offline | `service-worker.js` | Cache-first za statiku, network-first za HTML |
| PWA Config | `manifest.json` | Standalone display, dark theme, ikone |

## Data Model (localStorage key: `stand-tracker-data`)
```
{
  categories: [{ id, name, variants: [{ id, price }] }],
  currentSession: { date, items: [{ categoryId, variantId, type, quantity }] },
  history: [{ date, items, sentAt }]
}
```

## Views
1. **Home** — `#app-home` — dvije velike kartice (ULAZ/OTPIS), navigacija
2. **Categories** — `#app-categories` — grid kartica kategorija s badgevima
3. **Variants** — `#app-variants` — grid cjenovnih varijanti s counterima
4. **History** — `#app-history` — prošle sesije, expandable
5. **Admin** — `#app-admin` — upravljanje proizvodima (CRUD)

## Design Decisions
- **Bez frameworka** — jednostavnost, nula dependency-ja, instant load
- **localStorage samo** — nema servera, nema Supabasea (potpuno odvojeno od MuranoProductManagera)
- **Dark theme** — #0f1724 pozadina, #d4983c amber akcent (Murano staklo estetika)
- **IIFE pattern** — sve u jednom closureu, nema globalnog scopea
- **Event delegation** — counteri i admin akcije preko parent containera
