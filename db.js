// ============ DATABASE INITIALIZATION ============
const DB_NAME = 'FBShopDB';
const DB_VERSION = 1;

let db;

// Database initialization
async function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            db = event.target.result;

            // Users table
            if (!db.objectStoreNames.contains('users')) {
                const userStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
                userStore.createIndex('username', 'username', { unique: true });
                userStore.createIndex('email', 'email', { unique: false });
            }

            // Menu Items table
            if (!db.objectStoreNames.contains('menuItems')) {
                const menuStore = db.createObjectStore('menuItems', { keyPath: 'id', autoIncrement: true });
                menuStore.createIndex('category', 'category', { unique: false });
            }

            // Orders table
            if (!db.objectStoreNames.contains('orders')) {
                const orderStore = db.createObjectStore('orders', { keyPath: 'id', autoIncrement: true });
                orderStore.createIndex('date', 'date', { unique: false });
                orderStore.createIndex('customerId', 'customerId', { unique: false });
            }

            // Inventory table
            if (!db.objectStoreNames.contains('inventory')) {
                const invStore = db.createObjectStore('inventory', { keyPath: 'id', autoIncrement: true });
                invStore.createIndex('itemName', 'itemName', { unique: false });
            }

            // Settings table
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings', { keyPath: 'key' });
            }
        };
    });
}

// ============ USER MANAGEMENT ============
async function createUser(userData) {
    const tx = db.transaction(['users'], 'readwrite');
    const store = tx.objectStore('users');
    
    const user = {
        username: userData.username,
        password: hashPassword(userData.password),
        email: userData.email || '',
        role: userData.role || 'staff',
        createdAt: new Date().toISOString(),
        active: true
    };

    return new Promise((resolve, reject) => {
        const request = store.add(user);
        request.onsuccess = () => resolve({ id: request.result, ...user });
        request.onerror = () => reject(request.error);
    });
}

async function getUser(username) {
    const tx = db.transaction(['users'], 'readonly');
    const index = tx.objectStore('users').index('username');

    return new Promise((resolve, reject) => {
        const request = index.get(username);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllUsers() {
    const tx = db.transaction(['users'], 'readonly');
    const store = tx.objectStore('users');

    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function updateUser(userId, updates) {
    const tx = db.transaction(['users'], 'readwrite');
    const store = tx.objectStore('users');

    return new Promise(async (resolve, reject) => {
        const getRequest = store.get(userId);
        getRequest.onsuccess = () => {
            const user = getRequest.result;
            const updatedUser = { ...user, ...updates };
            const updateRequest = store.put(updatedUser);
            updateRequest.onsuccess = () => resolve(updatedUser);
            updateRequest.onerror = () => reject(updateRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}

async function deleteUser(userId) {
    const tx = db.transaction(['users'], 'readwrite');
    const store = tx.objectStore('users');

    return new Promise((resolve, reject) => {
        const request = store.delete(userId);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ============ AUTHENTICATION ============
function hashPassword(password) {
    // Simple hash function for demo (in production, use proper bcrypt or similar)
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
}

async function authenticateUser(username, password) {
    const user = await getUser(username);
    if (!user || user.password !== hashPassword(password)) {
        return null;
    }
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
}

// ============ MENU ITEMS ============
async function createMenuItem(itemData) {
    const tx = db.transaction(['menuItems'], 'readwrite');
    const store = tx.objectStore('menuItems');

    const item = {
        name: itemData.name,
        category: itemData.category,
        price: parseFloat(itemData.price),
        description: itemData.description || '',
        available: itemData.available !== false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
        const request = store.add(item);
        request.onsuccess = () => resolve({ id: request.result, ...item });
        request.onerror = () => reject(request.error);
    });
}

async function getMenuItem(id) {
    const tx = db.transaction(['menuItems'], 'readonly');
    const store = tx.objectStore('menuItems');

    return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllMenuItems() {
    const tx = db.transaction(['menuItems'], 'readonly');
    const store = tx.objectStore('menuItems');

    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function updateMenuItem(id, updates) {
    const tx = db.transaction(['menuItems'], 'readwrite');
    const store = tx.objectStore('menuItems');

    return new Promise((resolve, reject) => {
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
            const item = getRequest.result;
            const updatedItem = { ...item, ...updates, updatedAt: new Date().toISOString() };
            const updateRequest = store.put(updatedItem);
            updateRequest.onsuccess = () => resolve(updatedItem);
            updateRequest.onerror = () => reject(updateRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}

async function deleteMenuItem(id) {
    const tx = db.transaction(['menuItems'], 'readwrite');
    const store = tx.objectStore('menuItems');

    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ============ ORDERS ============
async function createOrder(orderData) {
    const tx = db.transaction(['orders'], 'readwrite');
    const store = tx.objectStore('orders');

    const order = {
        customerName: orderData.customerName,
        orderType: orderData.orderType,
        items: orderData.items || [],
        totalAmount: orderData.totalAmount || 0,
        notes: orderData.notes || '',
        date: new Date().toISOString(),
        status: 'completed',
        paymentMethod: orderData.paymentMethod || 'cash',
        createdBy: orderData.createdBy || 'staff'
    };

    return new Promise((resolve, reject) => {
        const request = store.add(order);
        request.onsuccess = () => resolve({ id: request.result, ...order });
        request.onerror = () => reject(request.error);
    });
}

async function getOrder(id) {
    const tx = db.transaction(['orders'], 'readonly');
    const store = tx.objectStore('orders');

    return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllOrders() {
    const tx = db.transaction(['orders'], 'readonly');
    const store = tx.objectStore('orders');

    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getOrdersByDateRange(startDate, endDate) {
    const tx = db.transaction(['orders'], 'readonly');
    const index = tx.objectStore('orders').index('date');
    const range = IDBKeyRange.bound(startDate, endDate);

    return new Promise((resolve, reject) => {
        const request = index.getAll(range);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function updateOrder(id, updates) {
    const tx = db.transaction(['orders'], 'readwrite');
    const store = tx.objectStore('orders');

    return new Promise((resolve, reject) => {
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
            const order = getRequest.result;
            const updatedOrder = { ...order, ...updates };
            const updateRequest = store.put(updatedOrder);
            updateRequest.onsuccess = () => resolve(updatedOrder);
            updateRequest.onerror = () => reject(updateRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}

async function deleteOrder(id) {
    const tx = db.transaction(['orders'], 'readwrite');
    const store = tx.objectStore('orders');

    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ============ INVENTORY ============
async function createInventoryItem(itemData) {
    const tx = db.transaction(['inventory'], 'readwrite');
    const store = tx.objectStore('inventory');

    const item = {
        itemName: itemData.itemName,
        quantity: parseFloat(itemData.quantity),
        unit: itemData.unit,
        costPrice: parseFloat(itemData.costPrice),
        minLevel: parseFloat(itemData.minLevel),
        lastRestockDate: new Date().toISOString(),
        createdAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
        const request = store.add(item);
        request.onsuccess = () => resolve({ id: request.result, ...item });
        request.onerror = () => reject(request.error);
    });
}

async function getInventoryItem(id) {
    const tx = db.transaction(['inventory'], 'readonly');
    const store = tx.objectStore('inventory');

    return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getAllInventory() {
    const tx = db.transaction(['inventory'], 'readonly');
    const store = tx.objectStore('inventory');

    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function updateInventoryItem(id, updates) {
    const tx = db.transaction(['inventory'], 'readwrite');
    const store = tx.objectStore('inventory');

    return new Promise((resolve, reject) => {
        const getRequest = store.get(id);
        getRequest.onsuccess = () => {
            const item = getRequest.result;
            const updatedItem = { ...item, ...updates };
            const updateRequest = store.put(updatedItem);
            updateRequest.onsuccess = () => resolve(updatedItem);
            updateRequest.onerror = () => reject(updateRequest.error);
        };
        getRequest.onerror = () => reject(getRequest.error);
    });
}

async function deleteInventoryItem(id) {
    const tx = db.transaction(['inventory'], 'readwrite');
    const store = tx.objectStore('inventory');

    return new Promise((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

async function getLowStockItems(threshold = null) {
    const allItems = await getAllInventory();
    return allItems.filter(item => item.quantity <= (threshold || item.minLevel));
}

// ============ SETTINGS ============
async function saveSetting(key, value) {
    const tx = db.transaction(['settings'], 'readwrite');
    const store = tx.objectStore('settings');

    const setting = {
        key: key,
        value: value,
        updatedAt: new Date().toISOString()
    };

    return new Promise((resolve, reject) => {
        const request = store.put(setting);
        request.onsuccess = () => resolve(setting);
        request.onerror = () => reject(request.error);
    });
}

async function getSetting(key) {
    const tx = db.transaction(['settings'], 'readonly');
    const store = tx.objectStore('settings');

    return new Promise((resolve, reject) => {
        const request = store.get(key);
        request.onsuccess = () => {
            resolve(request.result ? request.result.value : null);
        };
        request.onerror = () => reject(request.error);
    });
}

async function getAllSettings() {
    const tx = db.transaction(['settings'], 'readonly');
    const store = tx.objectStore('settings');

    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// ============ DATA EXPORT/IMPORT ============
async function exportAllData() {
    const data = {
        users: await getAllUsers(),
        menuItems: await getAllMenuItems(),
        orders: await getAllOrders(),
        inventory: await getAllInventory(),
        settings: await getAllSettings(),
        exportDate: new Date().toISOString()
    };
    return data;
}

async function importData(data) {
    try {
        // Clear existing data
        const stores = ['users', 'menuItems', 'orders', 'inventory', 'settings'];
        for (const storeName of stores) {
            const tx = db.transaction([storeName], 'readwrite');
            tx.objectStore(storeName).clear();
        }

        // Import users
        if (data.users && Array.isArray(data.users)) {
            const userTx = db.transaction(['users'], 'readwrite');
            const userStore = userTx.objectStore('users');
            for (const user of data.users) {
                userStore.add(user);
            }
        }

        // Import menu items
        if (data.menuItems && Array.isArray(data.menuItems)) {
            const menuTx = db.transaction(['menuItems'], 'readwrite');
            const menuStore = menuTx.objectStore('menuItems');
            for (const item of data.menuItems) {
                menuStore.add(item);
            }
        }

        // Import orders
        if (data.orders && Array.isArray(data.orders)) {
            const orderTx = db.transaction(['orders'], 'readwrite');
            const orderStore = orderTx.objectStore('orders');
            for (const order of data.orders) {
                orderStore.add(order);
            }
        }

        // Import inventory
        if (data.inventory && Array.isArray(data.inventory)) {
            const invTx = db.transaction(['inventory'], 'readwrite');
            const invStore = invTx.objectStore('inventory');
            for (const item of data.inventory) {
                invStore.add(item);
            }
        }

        // Import settings
        if (data.settings && Array.isArray(data.settings)) {
            const settingTx = db.transaction(['settings'], 'readwrite');
            const settingStore = settingTx.objectStore('settings');
            for (const setting of data.settings) {
                settingStore.put(setting);
            }
        }

        return true;
    } catch (error) {
        console.error('Import error:', error);
        return false;
    }
}

async function clearAllData() {
    const stores = ['users', 'menuItems', 'orders', 'inventory', 'settings'];
    for (const storeName of stores) {
        const tx = db.transaction([storeName], 'readwrite');
        await new Promise((resolve, reject) => {
            const request = tx.objectStore(storeName).clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

// ============ INITIALIZE DEFAULT DATA ============
async function initializeDefaultData() {
    const usersCount = (await getAllUsers()).length;
    
    if (usersCount === 0) {
        // Create default owner and staff accounts
        await createUser({
            username: 'owner',
            password: 'owner123',
            email: 'owner@shop.local',
            role: 'owner'
        });

        await createUser({
            username: 'staff',
            password: 'staff123',
            email: 'staff@shop.local',
            role: 'staff'
        });

        // Default settings
        await saveSetting('shopName', 'My F&B Shop');
        await saveSetting('ownerName', 'Shop Owner');
        await saveSetting('shopPhone', '+91-XXXXXXXXXX');
        await saveSetting('currencySymbol', '₹');
    }
}
