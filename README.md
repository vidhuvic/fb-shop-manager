# F&B Shop Manager

An offline point of sale and stock book for small food and drink shops. It runs as four static files in a browser, stores everything in that browser's IndexedDB, and never talks to a server. No build step, no dependencies, no accounts to create anywhere.

Built for counters with unreliable internet: a tea stall, a bakery, a canteen, a food truck.

---

## What it does

**Everyone**
- Sign in with a username and password held in the local database
- Ring up sales on a touch-friendly till: search or filter the menu, tap to add, adjust quantities, take payment by cash, card or UPI
- Print a receipt with the shop's name, the order lines, tax and a footer message

**Staff**
- See and report on their own orders only

**Owner**
- Dashboard: sales and order count for today, items on the menu, anything below its minimum stock level
- Menu: add, edit, retire and re-list items by category
- Stock: quantities, units, cost price and a reorder level per item
- Reports: any date range (or today / last 7 days / this month), broken down by category, by day and by best seller, exportable to CSV
- People: create staff and owner accounts, reset passwords, disable sign-in
- Settings: shop details, currency symbol, tax rate, receipt footer
- Backups: download the whole database as JSON and restore it later

## Getting started

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000     # then visit http://localhost:8000
npx http-server                  # or this
```

A local server is the safer option: a few browsers restrict storage for pages opened directly from `file://`.

**First sign-in:** `owner` / `owner123`, or `staff` / `staff123`. Change both under **People** before the shop opens. A fresh database also gets six sample menu items so the till isn't empty on the first run; delete them under **Menu**.

## Where the data lives

Everything sits in the IndexedDB database `FBShopDB` in the browser you are using. That means:

- Data is tied to one browser on one device. A different browser, a different device, or a private window each get their own empty copy.
- Clearing site data or "browsing data" erases the shop's records.
- Nothing is uploaded anywhere.

So take backups. **Settings → Download backup** writes a dated JSON file with every order, item, stock line, account and setting; **Restore from backup** puts it all back, ids included, on any device.

### Stores

| Store | Fields |
| --- | --- |
| `users` | id, username, passwordHash, passwordSalt, email, role, active, createdAt, updatedAt |
| `menuItems` | id, name, category, price, description, available, createdAt, updatedAt |
| `orders` | id, customerName, orderType, items[], subtotal, taxRate, taxAmount, totalAmount, notes, date, status, paymentMethod, createdBy |
| `inventory` | id, itemName, quantity, unit, costPrice, minLevel, lastRestockDate, createdAt |
| `settings` | key, value, updatedAt |

Each line inside `orders.items` keeps its own `name`, `category`, `price`, `quantity` and `lineTotal`, so reports stay correct after a menu item is renamed, repriced or deleted.

## About the passwords

Passwords are salted and hashed with SHA-256 through the Web Crypto API, and only the hash is stored. Hashes written by version 1 still work and are upgraded the next time that person signs in.

This protects a password from someone reading the database, and nothing more. Anyone with the unlocked device can open the app's data, and a JSON backup contains the hashes. Treat the device itself as the real lock: use a screen lock, and keep backups somewhere private.

## Files

```
index.html    page shell: app root, toast stack, dialog root, print area
styles.css    design tokens, layout, print styles
db.js         IndexedDB: schema, migrations, validation, CRUD, backups
app.js        screens, rendering, events, reports, receipts
```

`app.js` renders every screen into `#app`. Nothing else in the page is replaced, so an open dialog, a toast or a pending receipt survives navigation.

## Changes in this revision

Fixes:

- **Editing a menu or stock item created a duplicate instead of updating it.** Form fields return strings; the database keys are numbers, so `get('4')` matched nothing and `put()` inserted a fresh row. Ids are now converted before every lookup.
- **Editing then saving stored prices and quantities as text**, which crashed the list on the next render (`price.toFixed is not a function`). Create and update now run through the same normaliser, and existing damaged records are repaired during the upgrade to schema v2.
- **The edit forms opened blank**, because the fields were filled in before the form that contains them was written to the page.
- **Editing a user threw a `ReferenceError`** (`getUser(user.username)` used `user` before it existed) and saved new passwords in plain text, which made the account unable to sign in.
- **Date-range reports returned only the first and last day.** Full ISO timestamps were being compared against bare `YYYY-MM-DD` strings. Ranges are now inclusive and timezone-correct, via the `date` index.
- **Category totals in reports read `undefined`**, because cart lines never carried a category.
- **Staff sign-in threw on load**, since the dashboard loader ran for both roles but its elements only exist on the owner's dashboard.
- **The owner had no way to create an order** — the button led to an alert pointing at a till the owner couldn't reach. Both roles now share the till.
- **Item names containing `'`, `"` or `<` broke the page**, because ids and names were interpolated into inline `onclick` attributes and unescaped HTML. All output is escaped and every handler is delegated through `data-action`.
- **Restoring a backup could be interrupted by the page reload** that followed it; imports now wait for each transaction to commit, and preserve record ids.
- **Settings never loaded into their form**, so opening the page and saving wiped the shop's details.
- **Toasts stacked on top of each other** at the same fixed position.
- Fixed: the tax line was permanently `0%`; the currency symbol setting was ignored everywhere; `report-top-item` existed in the markup but was never filled; the sidebar's user block never reached the bottom of the rail; `index.html` carried a second, unused copy of the whole interface that `document.body.innerHTML` threw away at sign-in, taking the `<script>` tags with it.

Added:

- Tax rate, currency symbol, shop address and receipt footer in Settings, applied at the till and on receipts
- Printable receipts, from the till and from any past order
- Order detail dialog with the full line breakdown
- Item search and category filter at the till
- Best sellers and tax collected in reports; date presets; CSV export of real order lines, escaped, BOM-prefixed for spreadsheets, with leading `=`, `+`, `-` and `@` neutralised
- Guards: the last owner cannot be deleted or demoted, you cannot delete your own account, duplicate usernames are refused, blank and negative values are rejected with a plain-language message
- Session role is re-read from the database on load, so editing `sessionStorage` no longer grants owner access
- Accounts can be disabled without deleting them, keeping their order history intact
- Responsive drawer navigation, larger tap targets, visible focus rings, dark mode, reduced-motion support
- Double-tap protection on **Take payment**, and a memory fallback when the browser blocks session storage

## Ideas for later

- Link menu items to stock so selling deducts ingredients
- Held tickets / multiple open tables at once
- Discounts and promotions
- Charts on the dashboard
- Optional sync to a server when a connection is available

## Licence

MIT. Use it, change it, sell from it.

Created by **VIDHUVIC**.
