/* ============================================================
   F&B Shop Manager — application logic
   Rendering is escaped, events are delegated, and every id coming
   back from the DOM is converted before it touches the database.
   ============================================================ */
'use strict';

const SESSION_KEY = 'fbShopSession';

/**
 * Session storage throws outright in a few setups (Safari private mode,
 * some file:// configurations). Falling back to memory keeps the till
 * usable for the rest of the session instead of failing the sign-in.
 */
const session = {
    fallback: null,
    read() {
        try {
            return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
        } catch (_) {
            return this.fallback;
        }
    },
    write(value) {
        this.fallback = value;
        try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(value));
        } catch (_) { /* memory only */ }
    },
    clear() {
        this.fallback = null;
        try {
            sessionStorage.removeItem(SESSION_KEY);
        } catch (_) { /* memory only */ }
    }
};

const state = {
    user: null,
    settings: { ...DEFAULT_SETTINGS },
    page: null,
    cart: [],
    menu: [],
    posCategory: 'All',
    posSearch: '',
    editing: {},
    submitting: false
};

const PAGES = {
    dashboard: { label: 'Dashboard', icon: '📊', title: 'Dashboard', roles: ['owner'] },
    pos: { label: 'New sale', icon: '🧾', title: 'New sale', roles: ['owner', 'staff'] },
    orders: { label: 'Orders', icon: '📒', title: 'Orders', roles: ['owner', 'staff'] },
    menu: { label: 'Menu', icon: '🍲', title: 'Menu', roles: ['owner'] },
    inventory: { label: 'Stock', icon: '📦', title: 'Stock', roles: ['owner'] },
    reports: { label: 'Reports', icon: '📈', title: 'Reports', roles: ['owner', 'staff'] },
    users: { label: 'People', icon: '👥', title: 'People', roles: ['owner'] },
    settings: { label: 'Settings', icon: '⚙️', title: 'Settings', roles: ['owner'] }
};

const ORDER_TYPES = ['Dine-in', 'Takeaway', 'Delivery'];
const PAYMENT_METHODS = ['Cash', 'Card', 'UPI'];

/* ------------------------------------------------------------
   Boot
   ------------------------------------------------------------ */
let booted = false;

async function boot() {
    if (booted) return;
    booted = true;
    bindGlobalEvents();
    try {
        await initDB();
        await seedDefaults();
        state.settings = await getSettings();
        await restoreSession();
    } catch (error) {
        console.error(error);
        renderFatal(error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
    boot();
}

function renderFatal(error) {
    document.getElementById('app').innerHTML = `
        <div class="screen">
            <div class="card notice">
                <h1>The app could not start</h1>
                <p>${esc(error && error.message ? error.message : 'Unknown error.')}</p>
                <p class="muted">Private or incognito windows block local storage in some browsers. Try a normal window, or a different browser.</p>
            </div>
        </div>`;
}

/* ------------------------------------------------------------
   Session
   ------------------------------------------------------------ */
async function restoreSession() {
    const saved = session.read();

    if (saved && saved.id != null) {
        // Re-read from the database: the stored copy is only a hint, so a
        // hand-edited session can no longer grant itself the owner role.
        const user = await getUserById(saved.id).catch(() => null);
        if (user && user.active !== false) {
            state.user = { id: user.id, username: user.username, role: user.role };
            renderApp();
            return;
        }
        session.clear();
    }
    renderLogin();
}

async function handleLogin(form) {
    const username = form.querySelector('#username').value;
    const password = form.querySelector('#password').value;
    const errorEl = form.querySelector('#login-error');
    errorEl.textContent = '';

    try {
        const user = await authenticateUser(username, password);
        if (!user) {
            errorEl.textContent = 'That username and password do not match an account.';
            return;
        }
        state.user = { id: user.id, username: user.username, role: user.role };
        session.write(state.user);
        renderApp();
    } catch (error) {
        console.error(error);
        errorEl.textContent = 'Sign in failed. Reload the page and try again.';
    }
}

function logout() {
    if (!confirm('Sign out now?')) return;
    state.user = null;
    state.cart = [];
    session.clear();
    renderLogin();
}

/* ------------------------------------------------------------
   Screens
   ------------------------------------------------------------ */
function renderLogin() {
    document.body.classList.remove('nav-open');
    document.getElementById('app').innerHTML = `
        <div class="screen">
            <form class="card login" id="login-form" novalidate>
                <p class="brand-mark">${esc(state.settings.shopName || 'F&B Shop Manager')}</p>
                <h1>Sign in to the counter</h1>
                <label class="field">
                    <span>Username</span>
                    <input type="text" id="username" autocomplete="username" autocapitalize="none" spellcheck="false" required>
                </label>
                <label class="field">
                    <span>Password</span>
                    <input type="password" id="password" autocomplete="current-password" required>
                </label>
                <button type="submit" class="btn btn-primary btn-block">Sign in</button>
                <p class="error" id="login-error" role="alert"></p>
                <p class="hint">First run? Use <b>owner</b> / <b>owner123</b> or <b>staff</b> / <b>staff123</b>, then change both in People.</p>
            </form>
        </div>`;
    const field = document.getElementById('username');
    if (field) field.focus();
}

function allowedPages() {
    return Object.entries(PAGES).filter(([, page]) => page.roles.includes(state.user.role));
}

function renderApp() {
    const nav = allowedPages().map(([id, page]) => `
        <button type="button" class="nav-item" data-action="nav" data-page="${id}">
            <span class="nav-icon" aria-hidden="true">${page.icon}</span>
            <span class="nav-label">${esc(page.label)}</span>
        </button>`).join('');

    document.getElementById('app').innerHTML = `
        <div class="layout">
            <button type="button" class="nav-scrim" data-action="close-nav" tabindex="-1" aria-label="Close menu"></button>
            <aside class="sidebar" id="sidebar">
                <div class="brand">
                    <span class="brand-dot" aria-hidden="true"></span>
                    <span class="brand-name">${esc(state.settings.shopName || 'F&B Shop')}</span>
                </div>
                <nav class="nav" aria-label="Sections">${nav}</nav>
                <div class="who">
                    <p class="who-name">${esc(state.user.username)}</p>
                    <p class="who-role">${state.user.role === 'owner' ? 'Owner' : 'Staff'}</p>
                    <button type="button" class="btn btn-quiet btn-block" data-action="logout">Sign out</button>
                </div>
            </aside>
            <div class="main">
                <header class="topbar">
                    <button type="button" class="icon-btn" data-action="toggle-nav" aria-label="Open menu" aria-controls="sidebar">☰</button>
                    <h1 id="page-title">Dashboard</h1>
                    <span class="topbar-date">${esc(formatDate(new Date()))}</span>
                </header>
                <main class="page" id="page-body" tabindex="-1"></main>
            </div>
        </div>`;

    navigate(state.user.role === 'owner' ? 'dashboard' : 'pos');
}

async function navigate(pageId) {
    const page = PAGES[pageId];
    if (!page || !page.roles.includes(state.user.role)) return;

    state.page = pageId;
    document.body.classList.remove('nav-open');
    document.querySelectorAll('.nav-item').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.page === pageId);
    });
    document.getElementById('page-title').textContent = page.title;

    const body = document.getElementById('page-body');
    body.innerHTML = '<p class="muted pad">Loading…</p>';

    try {
        const renderers = {
            dashboard: renderDashboard,
            pos: renderPOS,
            orders: renderOrders,
            menu: renderMenu,
            inventory: renderInventory,
            reports: renderReports,
            users: renderUsers,
            settings: renderSettings
        };
        body.innerHTML = await renderers[pageId]();
        if (pageId === 'pos') updateCart();
        if (pageId === 'reports') await runReport();
    } catch (error) {
        console.error(error);
        body.innerHTML = `<div class="card notice"><h2>This section could not load</h2><p>${esc(error.message)}</p></div>`;
    }
}

/* ------------------------------------------------------------
   Dashboard
   ------------------------------------------------------------ */
async function renderDashboard() {
    const today = isoDate(new Date());
    const [orders, menu, lowStock] = await Promise.all([
        getOrdersByDateRange(today, today),
        getAllMenuItems(),
        getLowStockItems()
    ]);

    const sales = orders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0);
    const recent = [...orders].sort(byNewest).slice(0, 8);

    return `
        <div class="stats">
            ${statCard('Sales today', money(sales))}
            ${statCard('Orders today', String(orders.length))}
            ${statCard('Items on the menu', String(menu.filter((m) => m.available !== false).length))}
            ${statCard('Below minimum stock', String(lowStock.length), lowStock.length ? 'warn' : '')}
        </div>

        <section class="card">
            <div class="card-head"><h2>Today's orders</h2></div>
            ${recent.length ? table(
                ['Order', 'Customer', 'Type', 'Taken by', 'Total', 'Time'],
                recent.map((o) => [
                    `#${o.id}`,
                    esc(o.customerName),
                    esc(o.orderType),
                    esc(o.createdBy),
                    `<span class="num">${money(o.totalAmount)}</span>`,
                    esc(formatTime(o.date))
                ])
            ) : empty('No sales yet today. Open New sale to ring one up.')}
        </section>

        <section class="card">
            <div class="card-head"><h2>Stock to reorder</h2></div>
            ${lowStock.length ? table(
                ['Item', 'In stock', 'Minimum'],
                lowStock.map((item) => [
                    esc(item.itemName),
                    `<span class="num">${num(item.quantity)} ${esc(item.unit)}</span>`,
                    `<span class="num">${num(item.minLevel)} ${esc(item.unit)}</span>`
                ])
            ) : empty('Every tracked item is above its minimum level.')}
        </section>`;
}

function statCard(label, value, tone = '') {
    return `<div class="stat ${tone}"><p class="stat-label">${esc(label)}</p><p class="stat-value num">${value}</p></div>`;
}

/* ------------------------------------------------------------
   Point of sale
   ------------------------------------------------------------ */
async function renderPOS() {
    state.menu = (await getAllMenuItems()).filter((item) => item.available !== false);
    const categories = ['All', ...new Set(state.menu.map((item) => item.category))];
    if (!categories.includes(state.posCategory)) state.posCategory = 'All';

    return `
        <div class="pos">
            <section class="card pos-catalogue">
                <div class="card-head">
                    <h2>Menu</h2>
                    <input type="search" id="pos-search" class="search" placeholder="Search items" value="${esc(state.posSearch)}" autocomplete="off">
                </div>
                <div class="chips" id="pos-categories">
                    ${categories.map((cat) => `
                        <button type="button" class="chip ${cat === state.posCategory ? 'is-active' : ''}" data-action="pos-category" data-category="${esc(cat)}">${esc(cat)}</button>
                    `).join('')}
                </div>
                <div class="tiles" id="pos-items">${posItemsHTML()}</div>
            </section>

            <section class="card pos-ticket">
                <div class="card-head"><h2>Ticket</h2></div>
                <div class="ticket-fields">
                    <label class="field">
                        <span>Customer</span>
                        <input type="text" id="pos-customer" placeholder="Walk-in" autocomplete="off">
                    </label>
                    <label class="field">
                        <span>Order type</span>
                        <select id="pos-order-type">${options(ORDER_TYPES)}</select>
                    </label>
                </div>
                <div class="ticket-lines" id="cart-items"></div>
                <dl class="totals">
                    <div><dt>Subtotal</dt><dd class="num" id="cart-subtotal">${money(0)}</dd></div>
                    <div><dt>Tax (${num(state.settings.taxRate)}%)</dt><dd class="num" id="cart-tax">${money(0)}</dd></div>
                    <div class="totals-grand"><dt>Total</dt><dd class="num" id="cart-total">${money(0)}</dd></div>
                </dl>
                <label class="field">
                    <span>Payment</span>
                    <select id="pos-payment">${options(PAYMENT_METHODS)}</select>
                </label>
                <label class="field">
                    <span>Note</span>
                    <input type="text" id="pos-notes" placeholder="Optional" autocomplete="off">
                </label>
                <div class="ticket-actions">
                    <button type="button" class="btn btn-primary" data-action="order-complete" id="complete-order">Take payment</button>
                    <button type="button" class="btn btn-quiet" data-action="cart-clear">Clear</button>
                </div>
            </section>
        </div>`;
}

function posItemsHTML() {
    const search = state.posSearch.trim().toLowerCase();
    const items = state.menu.filter((item) => {
        const inCategory = state.posCategory === 'All' || item.category === state.posCategory;
        const matches = !search || item.name.toLowerCase().includes(search) || item.category.toLowerCase().includes(search);
        return inCategory && matches;
    });

    if (!items.length) {
        if (state.menu.length) return empty('Nothing matches that search.');
        return empty(state.user.role === 'owner'
            ? 'No items are available yet. Add them under Menu.'
            : 'No items are available yet. Ask an owner to add them.');
    }

    return items.map((item) => `
        <button type="button" class="tile" data-action="pos-add" data-id="${item.id}">
            <span class="tile-name">${esc(item.name)}</span>
            <span class="tile-meta">${esc(item.category)}</span>
            <span class="tile-price num">${money(item.price)}</span>
        </button>`).join('');
}

function refreshPOSItems() {
    const container = document.getElementById('pos-items');
    if (container) container.innerHTML = posItemsHTML();
}

function addToCart(id) {
    const item = state.menu.find((menuItem) => menuItem.id === id);
    if (!item) return;
    const line = state.cart.find((entry) => entry.itemId === item.id);
    if (line) {
        line.quantity += 1;
    } else {
        state.cart.push({
            itemId: item.id,
            name: item.name,
            category: item.category,
            price: Number(item.price),
            quantity: 1
        });
    }
    updateCart();
}

function updateCart() {
    const container = document.getElementById('cart-items');
    if (!container) return;

    container.innerHTML = state.cart.length ? state.cart.map((line, index) => `
        <div class="ticket-line">
            <div class="ticket-line-main">
                <p class="ticket-line-name">${esc(line.name)}</p>
                <p class="ticket-line-price num">${money(line.price)} each</p>
            </div>
            <div class="stepper">
                <button type="button" data-action="cart-dec" data-index="${index}" aria-label="One less ${esc(line.name)}">−</button>
                <span class="num">${line.quantity}</span>
                <button type="button" data-action="cart-inc" data-index="${index}" aria-label="One more ${esc(line.name)}">+</button>
            </div>
            <p class="ticket-line-total num">${money(line.price * line.quantity)}</p>
            <button type="button" class="link-danger" data-action="cart-remove" data-index="${index}">Remove</button>
        </div>`).join('') : empty('Tap an item to start the ticket.');

    const subtotal = state.cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
    const tax = subtotal * Number(state.settings.taxRate || 0) / 100;
    setText('cart-subtotal', money(subtotal));
    setText('cart-tax', money(tax));
    setText('cart-total', money(subtotal + tax));
}

async function completeOrder() {
    if (!state.cart.length) {
        toast('Add at least one item before taking payment.', 'warning');
        return;
    }
    const button = document.getElementById('complete-order');
    if (state.submitting) return;
    state.submitting = true;
    if (button) button.disabled = true;

    try {
        const order = await createOrder({
            customerName: value('pos-customer'),
            orderType: value('pos-order-type'),
            items: state.cart,
            taxRate: state.settings.taxRate,
            notes: value('pos-notes'),
            paymentMethod: value('pos-payment'),
            createdBy: state.user.username
        });

        state.cart = [];
        setValue('pos-customer', '');
        setValue('pos-notes', '');
        updateCart();
        toast(`Order #${order.id} saved — ${money(order.totalAmount)}`, 'success');
        showReceipt(order);
    } catch (error) {
        console.error(error);
        toast(error.message || 'The order could not be saved.', 'error');
    } finally {
        state.submitting = false;
        if (button) button.disabled = false;
    }
}

/* ------------------------------------------------------------
   Orders
   ------------------------------------------------------------ */
async function visibleOrders() {
    const orders = await getAllOrders();
    const mine = state.user.role === 'owner' ? orders : orders.filter((o) => o.createdBy === state.user.username);
    return mine.sort(byNewest);
}

async function renderOrders() {
    const orders = await visibleOrders();
    const isOwner = state.user.role === 'owner';

    return `
        <section class="card">
            <div class="card-head">
                <h2>${isOwner ? 'All orders' : 'My orders'}</h2>
                <span class="muted">${orders.length} total</span>
            </div>
            ${orders.length ? table(
                ['Order', 'Customer', 'Type', 'Items', 'Payment', isOwner ? 'Taken by' : 'Date', 'Total', ''],
                orders.slice(0, 200).map((o) => [
                    `#${o.id}`,
                    esc(o.customerName),
                    esc(o.orderType),
                    String(o.items ? o.items.length : 0),
                    esc(o.paymentMethod || 'Cash'),
                    isOwner ? esc(o.createdBy) : esc(formatDate(o.date)),
                    `<span class="num">${money(o.totalAmount)}</span>`,
                    `<div class="row-actions">
                        <button type="button" class="btn btn-tiny" data-action="order-view" data-id="${o.id}">Open</button>
                        ${isOwner ? `<button type="button" class="btn btn-tiny btn-danger" data-action="order-delete" data-id="${o.id}">Delete</button>` : ''}
                     </div>`
                ])
            ) : empty(isOwner ? 'No orders have been rung up yet.' : 'You have not taken any orders yet.')}
            ${orders.length > 200 ? '<p class="muted pad">Showing the 200 most recent. Use Reports for older sales.</p>' : ''}
        </section>`;
}

async function viewOrder(id) {
    const order = await getOrder(id);
    if (!order) {
        toast('That order no longer exists.', 'error');
        return;
    }
    openModal(`Order #${order.id}`, `
        <dl class="detail">
            <div><dt>Customer</dt><dd>${esc(order.customerName)}</dd></div>
            <div><dt>Type</dt><dd>${esc(order.orderType)}</dd></div>
            <div><dt>Payment</dt><dd>${esc(order.paymentMethod || 'Cash')}</dd></div>
            <div><dt>Taken by</dt><dd>${esc(order.createdBy)}</dd></div>
            <div><dt>Date</dt><dd>${esc(formatDateTime(order.date))}</dd></div>
        </dl>
        ${table(['Item', 'Qty', 'Price', 'Line total'], (order.items || []).map((item) => [
            esc(item.name),
            `<span class="num">${item.quantity}</span>`,
            `<span class="num">${money(item.price)}</span>`,
            `<span class="num">${money(item.lineTotal != null ? item.lineTotal : item.price * item.quantity)}</span>`
        ]))}
        <dl class="totals">
            <div><dt>Subtotal</dt><dd class="num">${money(order.subtotal != null ? order.subtotal : order.totalAmount)}</dd></div>
            <div><dt>Tax</dt><dd class="num">${money(order.taxAmount || 0)}</dd></div>
            <div class="totals-grand"><dt>Total</dt><dd class="num">${money(order.totalAmount)}</dd></div>
        </dl>
        ${order.notes ? `<p class="muted">Note: ${esc(order.notes)}</p>` : ''}`,
        `<button type="button" class="btn btn-quiet" data-action="order-print" data-id="${order.id}">Print receipt</button>`);
}

async function deleteOrderAction(id) {
    if (!confirm('Delete this order? Sales reports will no longer include it.')) return;
    try {
        await deleteOrder(id);
        toast('Order deleted.', 'success');
        navigate('orders');
    } catch (error) {
        toast(error.message, 'error');
    }
}

/* ------------------------------------------------------------
   Menu
   ------------------------------------------------------------ */
async function renderMenu() {
    const items = (await getAllMenuItems()).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    state.menu = items;
    const editing = state.editing.menu;

    return `
        <div class="card-head page-head">
            <h2>Menu</h2>
            <button type="button" class="btn btn-primary" data-action="menu-new">Add item</button>
        </div>
        ${editing !== undefined ? menuForm(editing) : ''}
        ${items.length ? `<div class="cards">${items.map(menuCard).join('')}</div>` : empty('Add your first item to start selling.')}`;
}

function menuCard(item) {
    return `
        <article class="card item-card ${item.available === false ? 'is-off' : ''}">
            <p class="item-tag">${esc(item.category)}</p>
            <h3>${esc(item.name)}</h3>
            <p class="item-desc">${esc(item.description) || '<span class="muted">No description</span>'}</p>
            <p class="item-price num">${money(item.price)}</p>
            <p class="badge ${item.available === false ? 'badge-off' : 'badge-on'}">${item.available === false ? 'Not selling' : 'Selling'}</p>
            <div class="row-actions">
                <button type="button" class="btn btn-tiny" data-action="menu-edit" data-id="${item.id}">Edit</button>
                <button type="button" class="btn btn-tiny btn-danger" data-action="menu-delete" data-id="${item.id}">Delete</button>
            </div>
        </article>`;
}

function menuForm(item) {
    const data = item || { name: '', category: '', price: '', description: '', available: true };
    return `
        <form class="card form" id="menu-form" novalidate>
            <h3>${item ? `Edit ${esc(item.name)}` : 'New menu item'}</h3>
            <input type="hidden" id="menu-id" value="${item ? item.id : ''}">
            <div class="form-grid">
                <label class="field"><span>Item name</span><input type="text" id="item-name" value="${esc(data.name)}" required></label>
                <label class="field"><span>Category</span><input type="text" id="item-category" list="category-list" value="${esc(data.category)}" placeholder="Beverages, Snacks…" required></label>
                <label class="field"><span>Price</span><input type="number" id="item-price" min="0" step="0.01" value="${esc(data.price)}" required></label>
            </div>
            <label class="field"><span>Description</span><textarea id="item-description" rows="2">${esc(data.description)}</textarea></label>
            <label class="check"><input type="checkbox" id="item-available" ${data.available === false ? '' : 'checked'}> Available to sell</label>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">${item ? 'Save changes' : 'Add item'}</button>
                <button type="button" class="btn btn-quiet" data-action="menu-cancel">Cancel</button>
            </div>
            <datalist id="category-list">${[...new Set(state.menu.map((m) => m.category))].map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
        </form>`;
}

async function submitMenuForm(form) {
    const id = form.querySelector('#menu-id').value;
    const payload = {
        name: value('item-name'),
        category: value('item-category'),
        price: value('item-price'),
        description: value('item-description'),
        available: document.getElementById('item-available').checked
    };
    try {
        if (id) {
            await updateMenuItem(id, payload);
            toast('Item updated.', 'success');
        } else {
            await createMenuItem(payload);
            toast('Item added.', 'success');
        }
        state.editing = {};
        await navigate('menu');
    } catch (error) {
        toast(error.message, 'error');
    }
}

/* ------------------------------------------------------------
   Stock
   ------------------------------------------------------------ */
async function renderInventory() {
    const items = (await getAllInventory()).sort((a, b) => a.itemName.localeCompare(b.itemName));
    const editing = state.editing.inventory;

    return `
        <div class="card-head page-head">
            <h2>Stock</h2>
            <button type="button" class="btn btn-primary" data-action="inv-new">Add stock item</button>
        </div>
        ${editing !== undefined ? inventoryForm(editing) : ''}
        <section class="card">
            ${items.length ? table(
                ['Item', 'In stock', 'Minimum', 'Cost', 'Last restocked', 'Status', ''],
                items.map((item) => {
                    const low = Number(item.quantity) <= Number(item.minLevel);
                    return [
                        esc(item.itemName),
                        `<span class="num">${num(item.quantity)} ${esc(item.unit)}</span>`,
                        `<span class="num">${num(item.minLevel)} ${esc(item.unit)}</span>`,
                        `<span class="num">${money(item.costPrice)}</span>`,
                        esc(formatDate(item.lastRestockDate || item.createdAt)),
                        `<span class="badge ${low ? 'badge-off' : 'badge-on'}">${low ? 'Reorder' : 'OK'}</span>`,
                        `<div class="row-actions">
                            <button type="button" class="btn btn-tiny" data-action="inv-edit" data-id="${item.id}">Edit</button>
                            <button type="button" class="btn btn-tiny btn-danger" data-action="inv-delete" data-id="${item.id}">Delete</button>
                         </div>`
                    ];
                })
            ) : empty('Track ingredients here to get reorder alerts on the dashboard.')}
        </section>`;
}

function inventoryForm(item) {
    const data = item || { itemName: '', quantity: '', unit: '', costPrice: '', minLevel: '' };
    return `
        <form class="card form" id="inventory-form" novalidate>
            <h3>${item ? `Edit ${esc(item.itemName)}` : 'New stock item'}</h3>
            <input type="hidden" id="inventory-id" value="${item ? item.id : ''}">
            <div class="form-grid">
                <label class="field"><span>Item name</span><input type="text" id="inv-item-name" value="${esc(data.itemName)}" required></label>
                <label class="field"><span>Quantity in stock</span><input type="number" id="inv-quantity" min="0" step="0.01" value="${esc(data.quantity)}" required></label>
                <label class="field"><span>Unit</span><input type="text" id="inv-unit" value="${esc(data.unit)}" placeholder="kg, litre, pieces" required></label>
                <label class="field"><span>Cost price</span><input type="number" id="inv-cost-price" min="0" step="0.01" value="${esc(data.costPrice)}" required></label>
                <label class="field"><span>Reorder below</span><input type="number" id="inv-min-level" min="0" step="0.01" value="${esc(data.minLevel)}" required></label>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">${item ? 'Save changes' : 'Add stock item'}</button>
                <button type="button" class="btn btn-quiet" data-action="inv-cancel">Cancel</button>
            </div>
        </form>`;
}

async function submitInventoryForm(form) {
    const id = form.querySelector('#inventory-id').value;
    const payload = {
        itemName: value('inv-item-name'),
        quantity: value('inv-quantity'),
        unit: value('inv-unit'),
        costPrice: value('inv-cost-price'),
        minLevel: value('inv-min-level')
    };
    try {
        if (id) {
            await updateInventoryItem(id, payload);
            toast('Stock updated.', 'success');
        } else {
            await createInventoryItem(payload);
            toast('Stock item added.', 'success');
        }
        state.editing = {};
        await navigate('inventory');
    } catch (error) {
        toast(error.message, 'error');
    }
}

/* ------------------------------------------------------------
   People
   ------------------------------------------------------------ */
async function renderUsers() {
    const users = (await getAllUsers()).sort((a, b) => a.username.localeCompare(b.username));
    const editing = state.editing.user;

    return `
        <div class="card-head page-head">
            <h2>People</h2>
            <button type="button" class="btn btn-primary" data-action="user-new">Add person</button>
        </div>
        ${editing !== undefined ? userForm(editing) : ''}
        <section class="card">
            ${table(
                ['Username', 'Email', 'Role', 'Status', 'Added', ''],
                users.map((user) => [
                    esc(user.username) + (user.id === state.user.id ? ' <span class="muted">(you)</span>' : ''),
                    esc(user.email) || '<span class="muted">—</span>',
                    user.role === 'owner' ? 'Owner' : 'Staff',
                    `<span class="badge ${user.active === false ? 'badge-off' : 'badge-on'}">${user.active === false ? 'Disabled' : 'Active'}</span>`,
                    esc(formatDate(user.createdAt)),
                    `<div class="row-actions">
                        <button type="button" class="btn btn-tiny" data-action="user-edit" data-id="${user.id}">Edit</button>
                        ${user.id === state.user.id ? '' : `<button type="button" class="btn btn-tiny btn-danger" data-action="user-delete" data-id="${user.id}">Delete</button>`}
                     </div>`
                ])
            )}
        </section>`;
}

function userForm(user) {
    const data = user || { username: '', email: '', role: 'staff', active: true };
    return `
        <form class="card form" id="user-form" novalidate>
            <h3>${user ? `Edit ${esc(user.username)}` : 'New person'}</h3>
            <input type="hidden" id="user-id" value="${user ? user.id : ''}">
            <div class="form-grid">
                <label class="field"><span>Username</span><input type="text" id="user-username" value="${esc(data.username)}" autocapitalize="none" spellcheck="false" required></label>
                <label class="field"><span>Email</span><input type="email" id="user-email" value="${esc(data.email)}"></label>
                <label class="field"><span>Role</span>
                    <select id="user-role">
                        <option value="staff" ${data.role === 'staff' ? 'selected' : ''}>Staff — sells and sees their own sales</option>
                        <option value="owner" ${data.role === 'owner' ? 'selected' : ''}>Owner — full access</option>
                    </select>
                </label>
                <label class="field">
                    <span>${user ? 'New password (leave blank to keep)' : 'Password'}</span>
                    <input type="password" id="user-password" autocomplete="new-password" ${user ? '' : 'required'}>
                </label>
            </div>
            <label class="check"><input type="checkbox" id="user-active" ${data.active === false ? '' : 'checked'}> Can sign in</label>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">${user ? 'Save changes' : 'Add person'}</button>
                <button type="button" class="btn btn-quiet" data-action="user-cancel">Cancel</button>
            </div>
        </form>`;
}

async function submitUserForm(form) {
    const id = form.querySelector('#user-id').value;
    const payload = {
        username: value('user-username'),
        email: value('user-email'),
        role: value('user-role'),
        active: document.getElementById('user-active').checked,
        password: value('user-password')
    };
    try {
        if (id) {
            await updateUser(id, payload);
            toast('Account updated.', 'success');
            if (Number(id) === state.user.id) {
                state.user.username = payload.username.toLowerCase();
                state.user.role = payload.role;
                session.write(state.user);
            }
        } else {
            await createUser(payload);
            toast('Account created.', 'success');
        }
        state.editing = {};
        await navigate('users');
    } catch (error) {
        toast(error.message, 'error');
    }
}

async function deleteUserAction(id) {
    if (!confirm('Delete this account? Their past orders stay in the reports.')) return;
    try {
        await deleteUser(id);
        toast('Account deleted.', 'success');
        await navigate('users');
    } catch (error) {
        toast(error.message, 'error');
    }
}

/* ------------------------------------------------------------
   Reports
   ------------------------------------------------------------ */
function renderReports() {
    const today = isoDate(new Date());
    const mine = state.user.role !== 'owner';
    return `
        <section class="card">
            <div class="card-head">
                <h2>${mine ? 'My sales' : 'Sales'}</h2>
                <div class="chips">
                    <button type="button" class="chip" data-action="report-preset" data-range="today">Today</button>
                    <button type="button" class="chip" data-action="report-preset" data-range="week">Last 7 days</button>
                    <button type="button" class="chip" data-action="report-preset" data-range="month">This month</button>
                </div>
            </div>
            <div class="filters">
                <label class="field"><span>From</span><input type="date" id="report-start" value="${today}" max="${today}"></label>
                <label class="field"><span>To</span><input type="date" id="report-end" value="${today}" max="${today}"></label>
                <button type="button" class="btn btn-primary" data-action="report-run">Show</button>
                <button type="button" class="btn btn-quiet" data-action="report-csv">Download CSV</button>
            </div>
        </section>
        <div class="stats" id="report-stats"></div>
        <section class="card"><div class="card-head"><h2>By category</h2></div><div id="report-categories"></div></section>
        <section class="card"><div class="card-head"><h2>By day</h2></div><div id="report-days"></div></section>
        <section class="card"><div class="card-head"><h2>Best sellers</h2></div><div id="report-items"></div></section>`;
}

async function reportOrders() {
    const start = value('report-start') || isoDate(new Date());
    const end = value('report-end') || start;
    if (start > end) throw new Error('The start date is after the end date.');
    const orders = await getOrdersByDateRange(start, end);
    return {
        start,
        end,
        orders: state.user.role === 'owner' ? orders : orders.filter((o) => o.createdBy === state.user.username)
    };
}

async function runReport() {
    try {
        const { orders } = await reportOrders();
        const total = orders.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
        const tax = orders.reduce((sum, o) => sum + Number(o.taxAmount || 0), 0);
        const average = orders.length ? total / orders.length : 0;

        const byCategory = new Map();
        const byItem = new Map();
        const byDay = new Map();

        orders.forEach((order) => {
            const day = isoDate(new Date(order.date));
            byDay.set(day, (byDay.get(day) || 0) + Number(order.totalAmount || 0));
            (order.items || []).forEach((item) => {
                const lineTotal = Number(item.lineTotal != null ? item.lineTotal : item.price * item.quantity) || 0;
                const category = item.category || 'Uncategorised';
                const cat = byCategory.get(category) || { qty: 0, total: 0 };
                cat.qty += Number(item.quantity) || 0;
                cat.total += lineTotal;
                byCategory.set(category, cat);

                const entry = byItem.get(item.name) || { qty: 0, total: 0 };
                entry.qty += Number(item.quantity) || 0;
                entry.total += lineTotal;
                byItem.set(item.name, entry);
            });
        });

        const bestSellers = [...byItem.entries()].sort((a, b) => b[1].qty - a[1].qty);

        document.getElementById('report-stats').innerHTML = [
            statCard('Sales', money(total)),
            statCard('Orders', String(orders.length)),
            statCard('Average order', money(average)),
            statCard('Tax collected', money(tax)),
            statCard('Best seller', bestSellers.length ? esc(bestSellers[0][0]) : '—')
        ].join('');

        document.getElementById('report-categories').innerHTML = byCategory.size ? table(
            ['Category', 'Items sold', 'Sales'],
            [...byCategory.entries()].sort((a, b) => b[1].total - a[1].total).map(([name, data]) => [
                esc(name), `<span class="num">${num(data.qty)}</span>`, `<span class="num">${money(data.total)}</span>`
            ])
        ) : empty('No sales in this range.');

        document.getElementById('report-days').innerHTML = byDay.size ? table(
            ['Date', 'Sales'],
            [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, amount]) => [
                esc(formatDate(`${day}T12:00:00`)), `<span class="num">${money(amount)}</span>`
            ])
        ) : empty('No sales in this range.');

        document.getElementById('report-items').innerHTML = bestSellers.length ? table(
            ['Item', 'Sold', 'Sales'],
            bestSellers.slice(0, 15).map(([name, data]) => [
                esc(name), `<span class="num">${num(data.qty)}</span>`, `<span class="num">${money(data.total)}</span>`
            ])
        ) : empty('No sales in this range.');
    } catch (error) {
        toast(error.message, 'error');
    }
}

function setReportPreset(range) {
    const now = new Date();
    let start = new Date(now);
    if (range === 'week') start.setDate(now.getDate() - 6);
    if (range === 'month') start = new Date(now.getFullYear(), now.getMonth(), 1);
    setValue('report-start', isoDate(start));
    setValue('report-end', isoDate(now));
    runReport();
}

async function exportReportCSV() {
    try {
        const { start, end, orders } = await reportOrders();
        if (!orders.length) {
            toast('There are no orders in that range to export.', 'warning');
            return;
        }
        const rows = [['Order', 'Date', 'Customer', 'Type', 'Payment', 'Taken by', 'Item', 'Category', 'Quantity', 'Unit price', 'Line total', 'Order total']];
        orders.sort(byNewest).forEach((order) => {
            (order.items || []).forEach((item) => {
                rows.push([
                    order.id,
                    formatDateTime(order.date),
                    order.customerName,
                    order.orderType,
                    order.paymentMethod || 'Cash',
                    order.createdBy,
                    item.name,
                    item.category || '',
                    item.quantity,
                    Number(item.price).toFixed(2),
                    Number(item.lineTotal != null ? item.lineTotal : item.price * item.quantity).toFixed(2),
                    Number(order.totalAmount).toFixed(2)
                ]);
            });
        });
        const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
        downloadFile('\uFEFF' + csv, `sales-${start}-to-${end}.csv`, 'text/csv;charset=utf-8');
        toast('CSV downloaded.', 'success');
    } catch (error) {
        toast(error.message, 'error');
    }
}

function csvCell(value) {
    const text = String(value == null ? '' : value);
    // Stop spreadsheet apps treating a leading =, +, - or @ as a formula.
    const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/* ------------------------------------------------------------
   Settings and backups
   ------------------------------------------------------------ */
async function renderSettings() {
    const settings = await getSettings();
    state.settings = settings;
    return `
        <form class="card form" id="settings-form" novalidate>
            <h2>Shop details</h2>
            <p class="muted">These appear on receipts and on the sign-in screen.</p>
            <div class="form-grid">
                <label class="field"><span>Shop name</span><input type="text" id="shop-name" value="${esc(settings.shopName)}" required></label>
                <label class="field"><span>Owner name</span><input type="text" id="owner-name" value="${esc(settings.ownerName)}"></label>
                <label class="field"><span>Phone</span><input type="tel" id="shop-phone" value="${esc(settings.shopPhone)}"></label>
                <label class="field"><span>Currency symbol</span><input type="text" id="currency-symbol" maxlength="3" value="${esc(settings.currencySymbol)}" required></label>
                <label class="field"><span>Tax rate (%)</span><input type="number" id="tax-rate" min="0" max="100" step="0.01" value="${esc(settings.taxRate)}"></label>
            </div>
            <label class="field"><span>Address</span><input type="text" id="shop-address" value="${esc(settings.shopAddress)}"></label>
            <label class="field"><span>Receipt footer</span><input type="text" id="receipt-footer" value="${esc(settings.receiptFooter)}"></label>
            <div class="form-actions"><button type="submit" class="btn btn-primary">Save details</button></div>
        </form>

        <section class="card">
            <h2>Backups</h2>
            <p class="muted">Everything lives in this browser only. Clearing site data or switching devices loses it, so download a backup regularly and keep it somewhere safe.</p>
            <div class="row-actions">
                <button type="button" class="btn btn-quiet" data-action="data-export">Download backup</button>
                <button type="button" class="btn btn-quiet" data-action="data-import">Restore from backup</button>
                <input type="file" id="import-file" accept="application/json,.json" hidden>
            </div>
        </section>

        <section class="card danger-zone">
            <h2>Erase everything</h2>
            <p class="muted">Deletes all orders, menu items, stock and accounts in this browser, then restores the default owner login.</p>
            <button type="button" class="btn btn-danger" data-action="data-clear">Erase all data</button>
        </section>`;
}

async function submitSettingsForm() {
    try {
        state.settings = await saveSettings({
            shopName: value('shop-name'),
            ownerName: value('owner-name'),
            shopPhone: value('shop-phone'),
            shopAddress: value('shop-address'),
            currencySymbol: value('currency-symbol') || '₹',
            taxRate: Number(value('tax-rate')) || 0,
            receiptFooter: value('receipt-footer')
        });
        const brand = document.querySelector('.brand-name');
        if (brand) brand.textContent = state.settings.shopName;
        toast('Details saved.', 'success');
    } catch (error) {
        toast(error.message, 'error');
    }
}

async function exportData() {
    try {
        const data = await exportAllData();
        downloadFile(JSON.stringify(data, null, 2), `fb-shop-backup-${isoDate(new Date())}.json`, 'application/json');
        toast('Backup downloaded.', 'success');
    } catch (error) {
        toast(error.message, 'error');
    }
}

async function importFromFile(file) {
    if (!file) return;
    if (!confirm('Restoring replaces everything currently stored in this browser. Continue?')) return;
    try {
        const text = await file.text();
        await importData(JSON.parse(text));
        toast('Backup restored. Reloading…', 'success');
        setTimeout(() => window.location.reload(), 600);
    } catch (error) {
        console.error(error);
        toast(error instanceof SyntaxError ? 'That file is not valid JSON.' : error.message, 'error');
    }
}

async function clearData() {
    if (!confirm('Erase all data in this browser?')) return;
    if (!confirm('Last check: orders, menu, stock and accounts will be gone. Erase?')) return;
    try {
        await clearAllData();
        await seedDefaults({ withSamples: false });
        toast('All data erased. Reloading…', 'success');
        setTimeout(() => window.location.reload(), 600);
    } catch (error) {
        toast(error.message, 'error');
    }
}

/* ------------------------------------------------------------
   Receipt
   ------------------------------------------------------------ */
function receiptHTML(order) {
    const s = state.settings;
    return `
        <div class="receipt">
            <h2>${esc(s.shopName)}</h2>
            ${s.shopAddress ? `<p>${esc(s.shopAddress)}</p>` : ''}
            ${s.shopPhone ? `<p>${esc(s.shopPhone)}</p>` : ''}
            <hr>
            <p>Order #${order.id} · ${esc(formatDateTime(order.date))}</p>
            <p>${esc(order.orderType)} · ${esc(order.customerName)}</p>
            <hr>
            <table>
                <tbody>
                    ${(order.items || []).map((item) => `
                        <tr>
                            <td>${esc(item.name)}</td>
                            <td class="num">${item.quantity} × ${money(item.price)}</td>
                            <td class="num">${money(item.lineTotal != null ? item.lineTotal : item.price * item.quantity)}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
            <hr>
            <p class="line"><span>Subtotal</span><span class="num">${money(order.subtotal != null ? order.subtotal : order.totalAmount)}</span></p>
            ${Number(order.taxAmount) ? `<p class="line"><span>Tax ${num(order.taxRate)}%</span><span class="num">${money(order.taxAmount)}</span></p>` : ''}
            <p class="line total"><span>Total</span><span class="num">${money(order.totalAmount)}</span></p>
            <p class="line"><span>Paid by</span><span>${esc(order.paymentMethod)}</span></p>
            ${order.notes ? `<p>Note: ${esc(order.notes)}</p>` : ''}
            <hr>
            <p class="center">${esc(s.receiptFooter || '')}</p>
            <p class="center muted">Served by ${esc(order.createdBy)}</p>
        </div>`;
}

function showReceipt(order) {
    openModal(`Order #${order.id} saved`, receiptHTML(order),
        `<button type="button" class="btn btn-quiet" data-action="order-print" data-id="${order.id}">Print receipt</button>`);
}

async function printOrder(id) {
    const order = await getOrder(id);
    if (!order) return;
    document.getElementById('print-area').innerHTML = receiptHTML(order);
    window.print();
}

/* ------------------------------------------------------------
   Modal, toasts, helpers
   ------------------------------------------------------------ */
function openModal(title, bodyHTML, extraActions = '') {
    document.getElementById('modal-root').innerHTML = `
        <div class="modal-backdrop" data-action="modal-close">
            <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
                <div class="modal-head">
                    <h2>${esc(title)}</h2>
                    <button type="button" class="icon-btn" data-action="modal-close" aria-label="Close">✕</button>
                </div>
                <div class="modal-body">${bodyHTML}</div>
                <div class="modal-foot">
                    ${extraActions}
                    <button type="button" class="btn btn-primary" data-action="modal-close">Done</button>
                </div>
            </div>
        </div>`;
    const button = document.querySelector('.modal-foot .btn-primary');
    if (button) button.focus();
}

function closeModal() {
    document.getElementById('modal-root').innerHTML = '';
}

function toast(message, type = 'info') {
    const node = document.createElement('div');
    node.className = `toast toast-${type}`;
    node.textContent = message;
    document.getElementById('toasts').appendChild(node);
    setTimeout(() => {
        node.classList.add('is-leaving');
        setTimeout(() => node.remove(), 250);
    }, 3200);
}

function esc(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function money(amount) {
    const n = Number(amount) || 0;
    const symbol = String(state.settings.currencySymbol || '₹').replace(/[<>&"']/g, '');
    // "₹120.00" reads fine; "MVR120.00" does not.
    return `${symbol}${symbol.length > 1 ? ' ' : ''}${n.toFixed(2)}`;
}

function num(value) {
    const n = Number(value) || 0;
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function isoDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(date) {
    if (!date) return '—';
    return new Date(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(date) {
    return new Date(date).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDateTime(date) {
    return `${formatDate(date)}, ${formatTime(date)}`;
}

function byNewest(a, b) {
    return String(b.date).localeCompare(String(a.date));
}

function table(headers, rows) {
    if (!rows.length) return empty('Nothing here yet.');
    return `
        <div class="table-wrap">
            <table>
                <thead><tr>${headers.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
                <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
            </table>
        </div>`;
}

function empty(message) {
    return `<p class="empty">${esc(message)}</p>`;
}

function options(values) {
    return values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
}

function value(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------------
   Event wiring — one listener each, delegated by data-action.
   Inline onclick handlers are gone, so item names with quotes or
   angle brackets can no longer break (or hijack) the page.
   ------------------------------------------------------------ */
function bindGlobalEvents() {
    document.addEventListener('click', onClick);
    document.addEventListener('submit', onSubmit);
    document.addEventListener('input', onInput);
    document.addEventListener('change', onChange);
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            closeModal();
            document.body.classList.remove('nav-open');
        }
    });
    window.addEventListener('afterprint', () => {
        const area = document.getElementById('print-area');
        if (area) area.innerHTML = '';
    });
}

async function onClick(event) {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    const { action, id, index, page, category, range } = trigger.dataset;

    // Only the backdrop itself should close the modal, not clicks inside it.
    if (action === 'modal-close' && trigger.classList.contains('modal-backdrop') && event.target !== trigger) return;

    const actions = {
        nav: () => navigate(page),
        'toggle-nav': () => document.body.classList.toggle('nav-open'),
        'close-nav': () => document.body.classList.remove('nav-open'),
        logout,
        'modal-close': closeModal,

        'pos-category': () => {
            state.posCategory = category;
            document.querySelectorAll('#pos-categories .chip').forEach((chip) => {
                chip.classList.toggle('is-active', chip.dataset.category === category);
            });
            refreshPOSItems();
        },
        'pos-add': () => addToCart(Number(id)),
        'cart-inc': () => { state.cart[Number(index)].quantity += 1; updateCart(); },
        'cart-dec': () => {
            const line = state.cart[Number(index)];
            if (line.quantity > 1) line.quantity -= 1;
            else state.cart.splice(Number(index), 1);
            updateCart();
        },
        'cart-remove': () => { state.cart.splice(Number(index), 1); updateCart(); },
        'cart-clear': () => {
            if (!state.cart.length || confirm('Clear the ticket?')) {
                state.cart = [];
                updateCart();
            }
        },
        'order-complete': completeOrder,
        'order-view': () => viewOrder(Number(id)),
        'order-print': () => printOrder(Number(id)),
        'order-delete': () => deleteOrderAction(Number(id)),

        'menu-new': async () => { state.editing = { menu: null }; await navigate('menu'); },
        'menu-edit': async () => { state.editing = { menu: await getMenuItem(Number(id)) }; await navigate('menu'); },
        'menu-cancel': async () => { state.editing = {}; await navigate('menu'); },
        'menu-delete': async () => {
            if (!confirm('Delete this menu item? Past orders keep their own copy of it.')) return;
            await deleteMenuItem(Number(id));
            toast('Item deleted.', 'success');
            await navigate('menu');
        },

        'inv-new': async () => { state.editing = { inventory: null }; await navigate('inventory'); },
        'inv-edit': async () => { state.editing = { inventory: await getInventoryItem(Number(id)) }; await navigate('inventory'); },
        'inv-cancel': async () => { state.editing = {}; await navigate('inventory'); },
        'inv-delete': async () => {
            if (!confirm('Delete this stock item?')) return;
            await deleteInventoryItem(Number(id));
            toast('Stock item deleted.', 'success');
            await navigate('inventory');
        },

        'user-new': async () => { state.editing = { user: null }; await navigate('users'); },
        'user-edit': async () => { state.editing = { user: await getUserById(Number(id)) }; await navigate('users'); },
        'user-cancel': async () => { state.editing = {}; await navigate('users'); },
        'user-delete': () => deleteUserAction(Number(id)),

        'report-run': runReport,
        'report-preset': () => setReportPreset(range),
        'report-csv': exportReportCSV,

        'data-export': exportData,
        'data-import': () => document.getElementById('import-file').click(),
        'data-clear': clearData
    };

    const handler = actions[action];
    if (!handler) return;
    event.preventDefault();
    try {
        await handler();
    } catch (error) {
        console.error(error);
        toast(error.message || 'Something went wrong.', 'error');
    }
}

function onSubmit(event) {
    const form = event.target;
    const handlers = {
        'login-form': handleLogin,
        'menu-form': submitMenuForm,
        'inventory-form': submitInventoryForm,
        'user-form': submitUserForm,
        'settings-form': submitSettingsForm
    };
    const handler = handlers[form.id];
    if (!handler) return;
    event.preventDefault();
    handler(form);
}

function onInput(event) {
    if (event.target.id === 'pos-search') {
        state.posSearch = event.target.value;
        refreshPOSItems();
    }
}

function onChange(event) {
    if (event.target.id === 'import-file') {
        const file = event.target.files[0];
        event.target.value = '';
        importFromFile(file);
    }
}
