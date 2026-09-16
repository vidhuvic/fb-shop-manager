/* ============================================================
   F&B Shop Manager — data layer (IndexedDB)
   No network, no dependencies. Every function returns a Promise.
   ============================================================ */
'use strict';

const DB_NAME = 'FBShopDB';
const DB_VERSION = 2;
const STORE_NAMES = ['users', 'menuItems', 'orders', 'inventory', 'settings'];

const DEFAULT_SETTINGS = {
    shopName: 'My F&B Shop',
    ownerName: 'Shop Owner',
    shopPhone: '',
    shopAddress: '',
    currencySymbol: '₹',
    taxRate: 0,
    receiptFooter: 'Thank you. Please come again.'
};

let db = null;

/* ------------------------------------------------------------
   Small promise helpers.
   Requests are always issued in the same tick the transaction is
   created, so the transaction can never auto-commit underneath us.
   ------------------------------------------------------------ */
function assertDb() {
    if (!db) throw new Error('Database is not open yet.');
    return db;
}

function storeOf(name, mode = 'readonly') {
    return assertDb().transaction(name, mode).objectStore(name);
}

function reqDone(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function txDone(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted.'));
        tx.onerror = () => reject(tx.error || new Error('Transaction failed.'));
    });
}

/**
 * Read-modify-write inside a single transaction.
 * `mutate` receives the stored record and returns the record to save.
 */
function updateRecord(storeName, key, mutate) {
    return new Promise((resolve, reject) => {
        const store = storeOf(storeName, 'readwrite');
        const getReq = store.get(key);
        getReq.onerror = () => reject(getReq.error);
        getReq.onsuccess = () => {
            const current = getReq.result;
            if (!current) {
                reject(new Error('That record no longer exists.'));
                return;
            }
            let next;
            try {
                next = mutate(current);
            } catch (err) {
                reject(err);
                return;
            }
            const putReq = store.put(next);
            putReq.onsuccess = () => resolve(next);
            putReq.onerror = () => reject(putReq.error);
        };
    });
}

/* ------------------------------------------------------------
   Value coercion / validation
   The old code stored form values as strings on edit and as numbers
   on create, which crashed every `.toFixed()` call afterwards.
   Everything is normalised here, in one place.
   ------------------------------------------------------------ */
function toNumber(value, fallback = 0) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
    return Math.round((toNumber(n) + Number.EPSILON) * 100) / 100;
}

function toText(value) {
    return String(value == null ? '' : value).trim();
}

function requireText(value, label) {
    const text = toText(value);
    if (!text) throw new Error(`${label} is required.`);
    return text;
}

function requirePositive(value, label, { allowZero = true } = {}) {
    const n = toNumber(value, NaN);
    if (!Number.isFinite(n)) throw new Error(`${label} must be a number.`);
    if (n < 0 || (!allowZero && n === 0)) throw new Error(`${label} must be ${allowZero ? '0 or more' : 'greater than 0'}.`);
    return n;
}

function toId(value) {
    const n = Number(value);
    if (!Number.isInteger(n)) throw new Error('Invalid record id.');
    return n;
}

const nowISO = () => new Date().toISOString();

/* ------------------------------------------------------------
   Open / upgrade
   ------------------------------------------------------------ */
function initDB() {
    return new Promise((resolve, reject) => {
        if (!('indexedDB' in window) || !window.indexedDB) {
            reject(new Error('This browser has no IndexedDB support, so data cannot be saved.'));
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const database = request.result;
            const tx = request.transaction;
            const getStore = (name, options) => (
                database.objectStoreNames.contains(name)
                    ? tx.objectStore(name)
                    : database.createObjectStore(name, options)
            );

            const users = getStore('users', { keyPath: 'id', autoIncrement: true });
            if (!users.indexNames.contains('username')) users.createIndex('username', 'username', { unique: true });
            if (users.indexNames.contains('email')) users.deleteIndex('email'); // never queried

            const menuItems = getStore('menuItems', { keyPath: 'id', autoIncrement: true });
            if (!menuItems.indexNames.contains('category')) menuItems.createIndex('category', 'category', { unique: false });

            const orders = getStore('orders', { keyPath: 'id', autoIncrement: true });
            if (!orders.indexNames.contains('date')) orders.createIndex('date', 'date', { unique: false });
            if (!orders.indexNames.contains('createdBy')) orders.createIndex('createdBy', 'createdBy', { unique: false });
            if (orders.indexNames.contains('customerId')) orders.deleteIndex('customerId'); // field never existed

            const inventory = getStore('inventory', { keyPath: 'id', autoIncrement: true });
            if (!inventory.indexNames.contains('itemName')) inventory.createIndex('itemName', 'itemName', { unique: false });

            getStore('settings', { keyPath: 'key' });

            // Repair records written by earlier versions, where prices and
            // quantities could be saved as strings.
            repairNumericFields(menuItems, ['price']);
            repairNumericFields(inventory, ['quantity', 'costPrice', 'minLevel']);
        };

        request.onblocked = () => reject(new Error('Another tab is using an older version of this app. Close it and reload.'));
        request.onerror = () => reject(request.error || new Error('Could not open the database.'));
        request.onsuccess = () => {
            db = request.result;
            db.onversionchange = () => db.close();
            resolve(db);
        };
    });
}

function repairNumericFields(store, fields) {
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (!cursor) return;
        const record = cursor.value;
        let changed = false;
        fields.forEach((field) => {
            if (typeof record[field] !== 'number') {
                record[field] = toNumber(record[field]);
                changed = true;
            }
        });
        if (changed) cursor.update(record);
        cursor.continue();
    };
}

/* ------------------------------------------------------------
   Password hashing
   Salted SHA-256 via Web Crypto when available (works offline).
   Legacy 32-bit hashes from v1 are still accepted at login and are
   transparently upgraded on the next successful sign-in.
   ------------------------------------------------------------ */
function legacyHash(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        hash = ((hash << 5) - hash) + password.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(16);
}

function randomSalt() {
    const bytes = new Uint8Array(16);
    if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password, salt) {
    const subtle = window.crypto && window.crypto.subtle;
    if (!subtle) return 'legacy$' + legacyHash(salt + '|' + password);
    const data = new TextEncoder().encode(salt + '|' + password);
    const digest = await subtle.digest('SHA-256', data);
    return 'sha256$' + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function stripPassword(user) {
    if (!user) return null;
    const { password, passwordHash, passwordSalt, ...safe } = user;
    return safe;
}

async function verifyPassword(user, password) {
    if (user.passwordHash && user.passwordSalt) {
        return await hashPassword(password, user.passwordSalt) === user.passwordHash;
    }
    return typeof user.password === 'string' && legacyHash(password) === user.password;
}

/* ------------------------------------------------------------
   Users
   ------------------------------------------------------------ */
async function createUser(userData) {
    const username = requireText(userData.username, 'Username').toLowerCase();
    const password = toText(userData.password);
    if (password.length < 4) throw new Error('Password must be at least 4 characters.');

    const existing = await getUserByUsername(username);
    if (existing) throw new Error(`The username "${username}" is already taken.`);

    const salt = randomSalt();
    const user = {
        username,
        passwordHash: await hashPassword(password, salt),
        passwordSalt: salt,
        email: toText(userData.email),
        role: userData.role === 'owner' ? 'owner' : 'staff',
        active: userData.active !== false,
        createdAt: nowISO(),
        updatedAt: nowISO()
    };

    const id = await reqDone(storeOf('users', 'readwrite').add(user));
    return { id, ...stripPassword(user) };
}

function getUserByUsername(username) {
    return reqDone(storeOf('users').index('username').get(toText(username).toLowerCase()));
}

function getUserById(id) {
    return reqDone(storeOf('users').get(toId(id)));
}

function getAllUsers() {
    return reqDone(storeOf('users').getAll());
}

async function updateUser(id, updates) {
    const userId = toId(id);
    const patch = {};

    if (updates.username !== undefined) {
        const username = requireText(updates.username, 'Username').toLowerCase();
        const clash = await getUserByUsername(username);
        if (clash && clash.id !== userId) throw new Error(`The username "${username}" is already taken.`);
        patch.username = username;
    }
    if (updates.email !== undefined) patch.email = toText(updates.email);
    if (updates.active !== undefined) patch.active = updates.active !== false;

    if (updates.role !== undefined) {
        const role = updates.role === 'owner' ? 'owner' : 'staff';
        if (role === 'staff') await assertNotLastOwner(userId, 'change the role of');
        patch.role = role;
    }

    if (toText(updates.password)) {
        const password = toText(updates.password);
        if (password.length < 4) throw new Error('Password must be at least 4 characters.');
        patch.passwordSalt = randomSalt();
        patch.passwordHash = await hashPassword(password, patch.passwordSalt);
    }

    const saved = await updateRecord('users', userId, (current) => {
        const next = { ...current, ...patch, id: current.id, updatedAt: nowISO() };
        if (patch.passwordHash) delete next.password; // drop any legacy hash
        return next;
    });
    return stripPassword(saved);
}

async function assertNotLastOwner(userId, action = 'delete') {
    const users = await getAllUsers();
    const owners = users.filter((u) => u.role === 'owner' && u.active !== false);
    if (owners.length <= 1 && owners.some((u) => u.id === userId)) {
        throw new Error(`You cannot ${action} the only owner account.`);
    }
}

async function deleteUser(id) {
    const userId = toId(id);
    await assertNotLastOwner(userId, 'delete');
    await reqDone(storeOf('users', 'readwrite').delete(userId));
}

async function authenticateUser(username, password) {
    const user = await getUserByUsername(username);
    if (!user || user.active === false) return null;
    if (!(await verifyPassword(user, password))) return null;

    // Upgrade legacy hashes in place.
    if (!user.passwordHash) {
        const salt = randomSalt();
        const passwordHash = await hashPassword(password, salt);
        await updateRecord('users', user.id, (current) => {
            const next = { ...current, passwordSalt: salt, passwordHash, updatedAt: nowISO() };
            delete next.password;
            return next;
        });
    }
    return stripPassword(user);
}

/* ------------------------------------------------------------
   Menu items
   ------------------------------------------------------------ */
function normalizeMenuItem(data) {
    return {
        name: requireText(data.name, 'Item name'),
        category: requireText(data.category, 'Category'),
        price: requirePositive(data.price, 'Price'),
        description: toText(data.description),
        available: data.available !== false
    };
}

async function createMenuItem(itemData) {
    const item = { ...normalizeMenuItem(itemData), createdAt: nowISO(), updatedAt: nowISO() };
    const id = await reqDone(storeOf('menuItems', 'readwrite').add(item));
    return { id, ...item };
}

function getMenuItem(id) {
    return reqDone(storeOf('menuItems').get(toId(id)));
}

function getAllMenuItems() {
    return reqDone(storeOf('menuItems').getAll());
}

function updateMenuItem(id, updates) {
    const normalized = normalizeMenuItem(updates);
    return updateRecord('menuItems', toId(id), (current) => ({
        ...current, ...normalized, id: current.id, updatedAt: nowISO()
    }));
}

function deleteMenuItem(id) {
    return reqDone(storeOf('menuItems', 'readwrite').delete(toId(id)));
}

/* ------------------------------------------------------------
   Orders
   Totals are always recomputed from the line items — never read
   back out of the DOM.
   ------------------------------------------------------------ */
function normalizeOrderItems(items) {
    if (!Array.isArray(items) || items.length === 0) throw new Error('An order needs at least one item.');
    return items.map((raw) => {
        const price = requirePositive(raw.price, 'Item price');
        const quantity = Math.max(1, Math.round(requirePositive(raw.quantity, 'Quantity', { allowZero: false })));
        return {
            itemId: raw.itemId == null ? null : Number(raw.itemId),
            name: requireText(raw.name, 'Item name'),
            category: toText(raw.category) || 'Uncategorised',
            price,
            quantity,
            lineTotal: round2(price * quantity)
        };
    });
}

async function createOrder(orderData) {
    const items = normalizeOrderItems(orderData.items);
    const subtotal = round2(items.reduce((sum, item) => sum + item.lineTotal, 0));
    const taxRate = Math.min(100, Math.max(0, toNumber(orderData.taxRate)));
    const taxAmount = round2(subtotal * taxRate / 100);

    const order = {
        customerName: toText(orderData.customerName) || 'Walk-in',
        orderType: toText(orderData.orderType) || 'Dine-in',
        items,
        subtotal,
        taxRate,
        taxAmount,
        totalAmount: round2(subtotal + taxAmount),
        notes: toText(orderData.notes),
        date: nowISO(),
        status: 'completed',
        paymentMethod: toText(orderData.paymentMethod) || 'Cash',
        createdBy: toText(orderData.createdBy) || 'unknown'
    };

    const id = await reqDone(storeOf('orders', 'readwrite').add(order));
    return { id, ...order };
}

function getOrder(id) {
    return reqDone(storeOf('orders').get(toId(id)));
}

function getAllOrders() {
    return reqDone(storeOf('orders').getAll());
}

/**
 * Inclusive date range over plain YYYY-MM-DD strings.
 * The old version compared full ISO timestamps against bare dates,
 * which silently dropped every order except those on the two edges.
 */
function dayBounds(startDate, endDate) {
    // Local midnight to local end-of-day, expressed in UTC to match stored dates.
    const from = new Date(`${String(startDate).slice(0, 10)}T00:00:00`);
    const to = new Date(`${String(endDate).slice(0, 10)}T23:59:59.999`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new Error('Enter a valid date range.');
    return { from: from.toISOString(), to: to.toISOString() };
}

function getOrdersByDateRange(startDate, endDate) {
    const { from, to } = dayBounds(startDate, endDate);
    const range = IDBKeyRange.bound(from, to);
    return reqDone(storeOf('orders').index('date').getAll(range));
}

function updateOrder(id, updates) {
    return updateRecord('orders', toId(id), (current) => ({ ...current, ...updates, id: current.id }));
}

function deleteOrder(id) {
    return reqDone(storeOf('orders', 'readwrite').delete(toId(id)));
}

/* ------------------------------------------------------------
   Inventory
   ------------------------------------------------------------ */
function normalizeInventoryItem(data) {
    return {
        itemName: requireText(data.itemName, 'Item name'),
        quantity: requirePositive(data.quantity, 'Quantity'),
        unit: requireText(data.unit, 'Unit'),
        costPrice: requirePositive(data.costPrice, 'Cost price'),
        minLevel: requirePositive(data.minLevel, 'Minimum stock level')
    };
}

async function createInventoryItem(itemData) {
    const item = { ...normalizeInventoryItem(itemData), lastRestockDate: nowISO(), createdAt: nowISO() };
    const id = await reqDone(storeOf('inventory', 'readwrite').add(item));
    return { id, ...item };
}

function getInventoryItem(id) {
    return reqDone(storeOf('inventory').get(toId(id)));
}

function getAllInventory() {
    return reqDone(storeOf('inventory').getAll());
}

function updateInventoryItem(id, updates) {
    const normalized = normalizeInventoryItem(updates);
    return updateRecord('inventory', toId(id), (current) => ({
        ...current,
        ...normalized,
        id: current.id,
        lastRestockDate: normalized.quantity > toNumber(current.quantity) ? nowISO() : current.lastRestockDate
    }));
}

function deleteInventoryItem(id) {
    return reqDone(storeOf('inventory', 'readwrite').delete(toId(id)));
}

async function getLowStockItems() {
    const items = await getAllInventory();
    return items.filter((item) => toNumber(item.quantity) <= toNumber(item.minLevel));
}

/* ------------------------------------------------------------
   Settings
   ------------------------------------------------------------ */
function saveSetting(key, value) {
    return reqDone(storeOf('settings', 'readwrite').put({ key, value, updatedAt: nowISO() }));
}

async function saveSettings(values) {
    const tx = assertDb().transaction('settings', 'readwrite');
    const store = tx.objectStore('settings');
    Object.entries(values).forEach(([key, value]) => store.put({ key, value, updatedAt: nowISO() }));
    await txDone(tx);
    return getSettings();
}

async function getSetting(key) {
    const row = await reqDone(storeOf('settings').get(key));
    return row ? row.value : null;
}

function getAllSettings() {
    return reqDone(storeOf('settings').getAll());
}

/** Settings as a plain object, with defaults filled in. */
async function getSettings() {
    const rows = await getAllSettings();
    const settings = { ...DEFAULT_SETTINGS };
    rows.forEach((row) => { settings[row.key] = row.value; });
    settings.taxRate = Math.min(100, Math.max(0, toNumber(settings.taxRate)));
    settings.currencySymbol = toText(settings.currencySymbol) || DEFAULT_SETTINGS.currencySymbol;
    return settings;
}

/* ------------------------------------------------------------
   Backup / restore
   ------------------------------------------------------------ */
async function exportAllData() {
    return {
        format: 'fb-shop-manager',
        version: DB_VERSION,
        exportDate: nowISO(),
        users: await getAllUsers(),
        menuItems: await getAllMenuItems(),
        orders: await getAllOrders(),
        inventory: await getAllInventory(),
        settings: await getAllSettings()
    };
}

/**
 * Replaces everything. Waits for each transaction to commit, so a
 * reload straight afterwards can no longer abort a half-written import.
 * Existing ids are preserved, which keeps order history intact.
 */
async function importData(data) {
    if (!data || typeof data !== 'object') throw new Error('That file is not a valid backup.');
    const known = STORE_NAMES.filter((name) => Array.isArray(data[name]));
    if (known.length === 0) throw new Error('That file contains no F&B Shop Manager data.');

    await clearAllData();

    for (const name of known) {
        const tx = assertDb().transaction(name, 'readwrite');
        const store = tx.objectStore(name);
        data[name].forEach((record) => {
            if (record && typeof record === 'object') store.put(record);
        });
        await txDone(tx);
    }

    await seedDefaults({ withSamples: false });
    return true;
}

async function clearAllData() {
    const tx = assertDb().transaction(STORE_NAMES, 'readwrite');
    STORE_NAMES.forEach((name) => tx.objectStore(name).clear());
    await txDone(tx);
}

/* ------------------------------------------------------------
   First run
   ------------------------------------------------------------ */
const SAMPLE_MENU = [
    { name: 'Masala Chai', category: 'Beverages', price: 20, description: 'Cardamom and ginger, brewed to order.' },
    { name: 'Filter Coffee', category: 'Beverages', price: 30, description: 'Strong decoction, hot milk.' },
    { name: 'Veg Sandwich', category: 'Snacks', price: 60, description: 'Grilled, with mint chutney.' },
    { name: 'Samosa', category: 'Snacks', price: 15, description: 'Two pieces, served hot.' },
    { name: 'Chicken Biryani', category: 'Main Course', price: 180, description: 'Seeraga samba rice, raita on the side.' },
    { name: 'Gulab Jamun', category: 'Desserts', price: 40, description: 'Two pieces in warm syrup.' }
];

async function seedDefaults(options = {}) {
    const withSamples = options.withSamples !== false;
    const users = await getAllUsers();

    if (!users.some((u) => u.role === 'owner' && u.active !== false)) {
        await createUser({ username: 'owner', password: 'owner123', email: 'owner@shop.local', role: 'owner' });
    }
    if (users.length === 0) {
        await createUser({ username: 'staff', password: 'staff123', email: 'staff@shop.local', role: 'staff' });
    }

    const rows = await getAllSettings();
    const missing = Object.entries(DEFAULT_SETTINGS)
        .filter(([key]) => !rows.some((row) => row.key === key));
    if (missing.length) await saveSettings(Object.fromEntries(missing));

    if ((await getSetting('sampleMenuSeeded')) !== true) {
        if (withSamples && (await getAllMenuItems()).length === 0) {
            for (const item of SAMPLE_MENU) await createMenuItem(item);
        }
        await saveSetting('sampleMenuSeeded', true);
    }
}

// Kept for compatibility with the previous file name.
const initializeDefaultData = seedDefaults;
