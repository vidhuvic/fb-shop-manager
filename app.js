// ============ APPLICATION STATE ============
let currentUser = null;
let cart = [];
let selectedCategory = 'All';

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initDB();
        await initializeDefaultData();
        checkLogin();
        setupEventListeners();
    } catch (error) {
        console.error('Initialization error:', error);
        showNotification('Failed to initialize app', 'error');
    }
});

// ============ LOGIN MANAGEMENT ============
function checkLogin() {
    const storedUser = sessionStorage.getItem('currentUser');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        showApp();
    } else {
        showLoginPage();
    }
}

function showLoginPage() {
    document.body.innerHTML = `
        <div class="login-container">
            <div class="login-card">
                <h1>🍽️ F&B Shop Manager</h1>
                <p class="subtitle">Offline & Local Management System</p>
                <form id="login-form" class="login-form">
                    <div class="form-group">
                        <label>Username</label>
                        <input type="text" id="username" required>
                    </div>
                    <div class="form-group">
                        <label>Password</label>
                        <input type="password" id="password" required>
                    </div>
                    <button type="submit" class="btn">Login</button>
                    <div id="login-error" class="error"></div>
                </form>
                <div class="demo-credentials">
                    <strong>Demo Credentials:</strong>
                    <p><strong>Owner:</strong> owner / owner123</p>
                    <p><strong>Staff:</strong> staff / staff123</p>
                </div>
            </div>
        </div>
    `;

    document.getElementById('login-form').addEventListener('submit', handleLogin);
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        const user = await authenticateUser(username, password);
        if (user) {
            currentUser = user;
            sessionStorage.setItem('currentUser', JSON.stringify(user));
            showApp();
        } else {
            document.getElementById('login-error').textContent = 'Invalid credentials';
        }
    } catch (error) {
        document.getElementById('login-error').textContent = 'Login failed';
        console.error('Login error:', error);
    }
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        currentUser = null;
        sessionStorage.removeItem('currentUser');
        cart = [];
        checkLogin();
    }
}

// ============ APP DISPLAY ============
async function showApp() {
    const htmlContent = await generateAppHTML();
    document.body.innerHTML = htmlContent;
    setupEventListeners();
    updateUserInfo();
    
    // Show appropriate interface based on role
    if (currentUser.role === 'owner') {
        showPage('dashboard');
    } else {
        showPage('pos');
    }
    
    await loadDashboardData();
}

async function generateAppHTML() {
    return `
        <div class="app-wrapper">
            <aside class="sidebar">
                <div class="logo">
                    <h1>🍽️ F&B</h1>
                </div>
                <nav class="menu" id="main-menu">
                    ${currentUser.role === 'owner' ? `
                        <button class="menu-btn active" data-page="dashboard">📊 Dashboard</button>
                        <button class="menu-btn" data-page="orders">🛒 Orders</button>
                        <button class="menu-btn" data-page="menu">📋 Menu</button>
                        <button class="menu-btn" data-page="inventory">📦 Inventory</button>
                        <button class="menu-btn" data-page="reports">📈 Reports</button>
                        <button class="menu-btn" data-page="users">👥 Users</button>
                        <button class="menu-btn" data-page="settings">⚙️ Settings</button>
                    ` : `
                        <button class="menu-btn active" data-page="pos">🛍️ POS</button>
                        <button class="menu-btn" data-page="staff-orders">📋 Orders</button>
                        <button class="menu-btn" data-page="staff-reports">📊 Reports</button>
                    `}
                </nav>
                <div class="user-info">
                    <p><strong id="user-name">User</strong></p>
                    <p id="user-role">Role</p>
                    <div class="role">
                        ${currentUser.role === 'owner' ? '👑 Owner' : '👨‍💼 Staff'}
                    </div>
                    <button class="logout-btn" onclick="logout()">Logout</button>
                </div>
            </aside>

            <main class="main-content">
                <header class="header">
                    <h2 id="page-title">Dashboard</h2>
                    <div class="header-right" id="current-date"></div>
                </header>

                ${currentUser.role === 'owner' ? await generateOwnerPages() : await generateStaffPages()}
            </main>
        </div>
    `;
}

async function generateOwnerPages() {
    return `
        <!-- Dashboard Page -->
        <section id="dashboard" class="page active">
            <div class="dashboard-grid">
                <div class="stat-card">
                    <h3>Today's Sales</h3>
                    <p class="stat-value" id="today-sales">₹0</p>
                </div>
                <div class="stat-card">
                    <h3>Total Orders</h3>
                    <p class="stat-value" id="today-orders">0</p>
                </div>
                <div class="stat-card">
                    <h3>Menu Items</h3>
                    <p class="stat-value" id="menu-count">0</p>
                </div>
                <div class="stat-card">
                    <h3>Low Stock</h3>
                    <p class="stat-value warning" id="low-stock">0</p>
                </div>
            </div>
            <div class="dashboard-content">
                <h3>Recent Orders</h3>
                <div id="recent-orders-list" class="orders-table"></div>
            </div>
        </section>

        <!-- Orders Page -->
        <section id="orders" class="page">
            <div class="page-header">
                <h2>All Orders</h2>
                <button class="btn btn-primary" onclick="showNewOrderForm()">+ New Order</button>
            </div>
            <div id="orders-list" class="orders-table"></div>
        </section>

        <!-- Menu Items Page -->
        <section id="menu" class="page">
            <div class="page-header">
                <h2>Menu Management</h2>
                <button class="btn btn-primary" onclick="showNewMenuForm()">+ Add Item</button>
            </div>
            <div id="menu-form" class="form-container" style="display: none;"></div>
            <div id="menu-list" class="menu-grid"></div>
        </section>

        <!-- Inventory Page -->
        <section id="inventory" class="page">
            <div class="page-header">
                <h2>Inventory</h2>
                <button class="btn btn-primary" onclick="showNewInventoryForm()">+ Add Stock</button>
            </div>
            <div id="inventory-form" class="form-container" style="display: none;"></div>
            <div id="inventory-list" class="inventory-table"></div>
        </section>

        <!-- Reports Page -->
        <section id="reports" class="page">
            <div class="page-header">
                <h2>Sales Reports</h2>
            </div>
            <div class="report-filters">
                <div class="filter-group">
                    <label>Start Date</label>
                    <input type="date" id="report-start-date">
                    <label>End Date</label>
                    <input type="date" id="report-end-date">
                    <button class="btn btn-primary" onclick="generateReport()">Filter</button>
                </div>
            </div>
            <div class="report-cards">
                <div class="stat-card">
                    <h3>Total Sales</h3>
                    <p class="stat-value" id="report-total-sales">₹0</p>
                </div>
                <div class="stat-card">
                    <h3>Total Orders</h3>
                    <p class="stat-value" id="report-total-orders">0</p>
                </div>
                <div class="stat-card">
                    <h3>Average Order Value</h3>
                    <p class="stat-value" id="report-avg-order">₹0</p>
                </div>
            </div>
            <div class="report-section">
                <h3>Category-wise Sales</h3>
                <div id="category-sales" class="table-container"></div>
            </div>
            <div class="report-section">
                <h3>Daily Sales</h3>
                <div id="daily-sales" class="table-container"></div>
            </div>
            <button class="btn btn-secondary" onclick="exportReportCSV()">📥 Export CSV</button>
        </section>

        <!-- Users Management Page -->
        <section id="users" class="page">
            <div class="page-header">
                <h2>User Management</h2>
                <button class="btn btn-primary" onclick="showNewUserForm()">+ Add User</button>
            </div>
            <div id="user-form" class="form-container" style="display: none;"></div>
            <div id="users-list" class="orders-table"></div>
        </section>

        <!-- Settings Page -->
        <section id="settings" class="page">
            <div class="settings-section">
                <h3>Shop Information</h3>
                <form id="settings-form">
                    <div class="form-group">
                        <label>Shop Name</label>
                        <input type="text" id="shop-name" required>
                    </div>
                    <div class="form-group">
                        <label>Owner Name</label>
                        <input type="text" id="owner-name" required>
                    </div>
                    <div class="form-group">
                        <label>Phone</label>
                        <input type="tel" id="shop-phone" required>
                    </div>
                    <div class="form-group">
                        <label>Currency Symbol</label>
                        <input type="text" id="currency-symbol" value="₹" required>
                    </div>
                    <button type="submit" class="btn btn-primary">Save Settings</button>
                </form>
            </div>
            <div class="settings-section danger">
                <h3>Data Management</h3>
                <button class="btn btn-warning" onclick="exportData()">📤 Export Data</button>
                <button class="btn btn-warning" onclick="importDataFile()">📥 Import Data</button>
                <input type="file" id="import-file" accept=".json" style="display: none;">
                <button class="btn btn-danger" onclick="resetAllData()">🗑️ Clear All</button>
            </div>
        </section>
    `;
}

async function generateStaffPages() {
    return `
        <!-- POS Page -->
        <section id="pos" class="page active">
            <div class="pos-container">
                <div class="pos-menu-section">
                    <h3>Menu Items</h3>
                    <div class="pos-categories" id="pos-categories"></div>
                    <div class="pos-items" id="pos-items"></div>
                </div>
                <div class="pos-cart-section">
                    <h3>Order</h3>
                    <div class="form-group">
                        <label>Customer Name</label>
                        <input type="text" id="pos-customer" placeholder="Enter name">
                    </div>
                    <div class="form-group">
                        <label>Order Type</label>
                        <select id="pos-order-type">
                            <option>Dine-in</option>
                            <option>Takeaway</option>
                            <option>Delivery</option>
                        </select>
                    </div>
                    <div class="cart-items" id="cart-items"></div>
                    <div class="cart-summary">
                        <div class="cart-row">
                            <span>Subtotal:</span>
                            <span>₹<span id="subtotal">0</span></span>
                        </div>
                        <div class="cart-row">
                            <span>Tax (0%):</span>
                            <span>₹<span id="tax">0</span></span>
                        </div>
                        <div class="cart-row total">
                            <span>Total:</span>
                            <span>₹<span id="cart-total">0</span></span>
                        </div>
                    </div>
                    <div class="checkout-section">
                        <div class="form-group">
                            <label>Payment Method</label>
                            <select id="pos-payment" required>
                                <option>Cash</option>
                                <option>Card</option>
                                <option>UPI</option>
                            </select>
                        </div>
                        <div class="checkout-buttons">
                            <button class="checkout-buttons btn btn-checkout" onclick="completeOrder()">Complete Order</button>
                            <button class="checkout-buttons btn btn-clear" onclick="clearCart()">Clear Cart</button>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Staff Orders Page -->
        <section id="staff-orders" class="page">
            <div class="page-header">
                <h2>My Orders</h2>
            </div>
            <div id="staff-orders-list" class="orders-table"></div>
        </section>

        <!-- Staff Reports Page -->
        <section id="staff-reports" class="page">
            <div class="page-header">
                <h2>My Sales Report</h2>
            </div>
            <div class="report-filters">
                <div class="filter-group">
                    <label>Start Date</label>
                    <input type="date" id="staff-report-start-date">
                    <label>End Date</label>
                    <input type="date" id="staff-report-end-date">
                    <button class="btn btn-primary" onclick="generateStaffReport()">Filter</button>
                </div>
            </div>
            <div class="report-cards">
                <div class="stat-card">
                    <h3>My Sales</h3>
                    <p class="stat-value" id="staff-total-sales">₹0</p>
                </div>
                <div class="stat-card">
                    <h3>My Orders</h3>
                    <p class="stat-value" id="staff-total-orders">0</p>
                </div>
                <div class="stat-card">
                    <h3>Average Order Value</h3>
                    <p class="stat-value" id="staff-avg-order">₹0</p>
                </div>
            </div>
        </section>
    `;
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {
    // Menu buttons
    document.querySelectorAll('.menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            showPage(e.target.dataset.page);
        });
    });

    // Settings form
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', handleSettingsSave);
    }
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(pageId);
    if (page) {
        page.classList.add('active');
        document.getElementById('page-title').textContent = 
            pageId.charAt(0).toUpperCase() + pageId.slice(1).replace('-', ' ');
        
        // Load page-specific data
        if (pageId === 'dashboard') loadDashboardData();
        else if (pageId === 'orders') loadOrders();
        else if (pageId === 'menu') loadMenuItems();
        else if (pageId === 'inventory') loadInventory();
        else if (pageId === 'users') loadUsers();
        else if (pageId === 'reports') generateReport();
        else if (pageId === 'pos') loadPOSMenu();
        else if (pageId === 'staff-orders') loadStaffOrders();
        else if (pageId === 'staff-reports') generateStaffReport();
    }
}

function updateUserInfo() {
    const nameEl = document.getElementById('user-name');
    const roleEl = document.getElementById('user-role');
    if (nameEl) nameEl.textContent = currentUser.username || 'User';
    if (roleEl) roleEl.textContent = currentUser.role || 'User';
    updateCurrentDate();
}

function updateCurrentDate() {
    const dateEl = document.getElementById('current-date');
    if (dateEl) {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateEl.textContent = new Date().toLocaleDateString('en-IN', options);
    }
}

// ============ DASHBOARD ============
async function loadDashboardData() {
    const today = new Date().toISOString().split('T')[0];
    const allOrders = await getAllOrders();
    const todayOrders = allOrders.filter(o => o.date.startsWith(today));
    const menuItems = await getAllMenuItems();
    const lowStock = await getLowStockItems();

    const todaySales = todayOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    document.getElementById('today-sales').textContent = '₹' + todaySales.toFixed(2);
    document.getElementById('today-orders').textContent = todayOrders.length;
    document.getElementById('menu-count').textContent = menuItems.length;
    document.getElementById('low-stock').textContent = lowStock.length;

    // Recent orders
    const recentHtml = todayOrders.slice(-5).reverse().map(o => `
        <tr>
            <td>${o.customerName}</td>
            <td>${o.orderType}</td>
            <td>₹${o.totalAmount.toFixed(2)}</td>
            <td>${new Date(o.date).toLocaleTimeString()}</td>
        </tr>
    `).join('');

    document.getElementById('recent-orders-list').innerHTML = recentHtml ? 
        `<table><thead><tr><th>Customer</th><th>Type</th><th>Amount</th><th>Time</th></tr></thead><tbody>${recentHtml}</tbody></table>` :
        '<p class="empty-state">No orders today</p>';
}

// ============ ORDERS MANAGEMENT ============
async function loadOrders() {
    const orders = await getAllOrders();
    const html = orders.reverse().map(o => `
        <tr>
            <td>${o.customerName}</td>
            <td>${o.orderType}</td>
            <td>${o.items.length} items</td>
            <td>₹${o.totalAmount.toFixed(2)}</td>
            <td>${new Date(o.date).toLocaleDateString()}</td>
            <td>
                <div class="action-buttons">
                    <button class="view-btn" onclick="viewOrder(${o.id})">View</button>
                    <button class="delete-btn" onclick="deleteOrderAction(${o.id})">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');

    document.getElementById('orders-list').innerHTML = html ? 
        `<table><thead><tr><th>Customer</th><th>Type</th><th>Items</th><th>Amount</th><th>Date</th><th>Action</th></tr></thead><tbody>${html}</tbody></table>` :
        '<p class="empty-state">No orders</p>';
}

async function deleteOrderAction(id) {
    if (confirm('Delete this order?')) {
        await deleteOrder(id);
        loadOrders();
        showNotification('Order deleted', 'success');
    }
}

function showNewOrderForm() {
    alert('Use POS interface for creating orders');
}

// ============ MENU MANAGEMENT ============
async function loadMenuItems() {
    const items = await getAllMenuItems();
    const html = items.map(item => `
        <div class="menu-item">
            <h4>${item.name}</h4>
            <span class="category">${item.category}</span>
            <p class="description">${item.description}</p>
            <p class="price">₹${item.price.toFixed(2)}</p>
            <span class="status ${item.available ? 'available' : 'unavailable'}">
                ${item.available ? '✓ Available' : '✗ Unavailable'}
            </span>
            <div class="actions">
                <button class="edit-btn" onclick="editMenuItem(${item.id})">Edit</button>
                <button class="delete-btn" onclick="deleteMenuAction(${item.id})">Delete</button>
            </div>
        </div>
    `).join('');

    document.getElementById('menu-list').innerHTML = html || '<p class="empty-state">No menu items</p>';
}

function showNewMenuForm() {
    const formHtml = `
        <h3>Add Menu Item</h3>
        <form onsubmit="saveMenuItem(event)">
            <input type="hidden" id="menu-item-id">
            <div class="form-group">
                <label>Item Name</label>
                <input type="text" id="item-name" required>
            </div>
            <div class="form-group">
                <label>Category</label>
                <input type="text" id="item-category" placeholder="e.g., Appetizer, Main" required>
            </div>
            <div class="form-group">
                <label>Price (₹)</label>
                <input type="number" id="item-price" step="0.01" required>
            </div>
            <div class="form-group">
                <label>Description</label>
                <textarea id="item-description" rows="3"></textarea>
            </div>
            <div class="form-group">
                <label><input type="checkbox" id="item-available" checked> Available</label>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Save</button>
                <button type="button" class="btn btn-secondary" onclick="closeMenuForm()">Cancel</button>
            </div>
        </form>
    `;
    document.getElementById('menu-form').innerHTML = formHtml;
    document.getElementById('menu-form').style.display = 'block';
}

async function editMenuItem(id) {
    const item = await getMenuItem(id);
    document.getElementById('menu-item-id').value = id;
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-category').value = item.category;
    document.getElementById('item-price').value = item.price;
    document.getElementById('item-description').value = item.description;
    document.getElementById('item-available').checked = item.available;
    showNewMenuForm();
}

async function saveMenuItem(e) {
    e.preventDefault();
    const id = document.getElementById('menu-item-id').value;
    const itemData = {
        name: document.getElementById('item-name').value,
        category: document.getElementById('item-category').value,
        price: document.getElementById('item-price').value,
        description: document.getElementById('item-description').value,
        available: document.getElementById('item-available').checked
    };

    try {
        if (id) {
            await updateMenuItem(id, itemData);
            showNotification('Item updated', 'success');
        } else {
            await createMenuItem(itemData);
            showNotification('Item created', 'success');
        }
        closeMenuForm();
        loadMenuItems();
    } catch (error) {
        showNotification('Error saving item', 'error');
    }
}

function closeMenuForm() {
    document.getElementById('menu-form').style.display = 'none';
    document.getElementById('menu-item-id').value = '';
}

async function deleteMenuAction(id) {
    if (confirm('Delete this menu item?')) {
        await deleteMenuItem(id);
        loadMenuItems();
        showNotification('Item deleted', 'success');
    }
}

// ============ INVENTORY MANAGEMENT ============
async function loadInventory() {
    const items = await getAllInventory();
    const html = items.map(item => {
        const isLow = item.quantity <= item.minLevel;
        return `
            <tr>
                <td>${item.itemName}</td>
                <td>${item.quantity} ${item.unit}</td>
                <td>₹${item.costPrice.toFixed(2)}</td>
                <td>${item.minLevel} ${item.unit}</td>
                <td><span class="status ${isLow ? 'unavailable' : 'available'}">${isLow ? 'Low Stock' : 'OK'}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="edit-btn" onclick="editInventory(${item.id})">Edit</button>
                        <button class="delete-btn" onclick="deleteInventoryAction(${item.id})">Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    document.getElementById('inventory-list').innerHTML = html ? 
        `<table><thead><tr><th>Item</th><th>Qty</th><th>Cost</th><th>Min Level</th><th>Status</th><th>Action</th></tr></thead><tbody>${html}</tbody></table>` :
        '<p class="empty-state">No inventory items</p>';
}

function showNewInventoryForm() {
    const formHtml = `
        <h3>Add/Update Inventory</h3>
        <form onsubmit="saveInventory(event)">
            <input type="hidden" id="inventory-id">
            <div class="form-group">
                <label>Item Name</label>
                <input type="text" id="inv-item-name" required>
            </div>
            <div class="form-group">
                <label>Quantity</label>
                <input type="number" id="inv-quantity" required>
            </div>
            <div class="form-group">
                <label>Unit</label>
                <input type="text" id="inv-unit" placeholder="e.g., kg, litre" required>
            </div>
            <div class="form-group">
                <label>Cost Price (₹)</label>
                <input type="number" id="inv-cost-price" step="0.01" required>
            </div>
            <div class="form-group">
                <label>Minimum Stock Level</label>
                <input type="number" id="inv-min-level" required>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Save</button>
                <button type="button" class="btn btn-secondary" onclick="closeInventoryForm()">Cancel</button>
            </div>
        </form>
    `;
    document.getElementById('inventory-form').innerHTML = formHtml;
    document.getElementById('inventory-form').style.display = 'block';
}

async function editInventory(id) {
    const item = await getInventoryItem(id);
    document.getElementById('inventory-id').value = id;
    document.getElementById('inv-item-name').value = item.itemName;
    document.getElementById('inv-quantity').value = item.quantity;
    document.getElementById('inv-unit').value = item.unit;
    document.getElementById('inv-cost-price').value = item.costPrice;
    document.getElementById('inv-min-level').value = item.minLevel;
    showNewInventoryForm();
}

async function saveInventory(e) {
    e.preventDefault();
    const id = document.getElementById('inventory-id').value;
    const itemData = {
        itemName: document.getElementById('inv-item-name').value,
        quantity: document.getElementById('inv-quantity').value,
        unit: document.getElementById('inv-unit').value,
        costPrice: document.getElementById('inv-cost-price').value,
        minLevel: document.getElementById('inv-min-level').value
    };

    try {
        if (id) {
            await updateInventoryItem(id, itemData);
            showNotification('Inventory updated', 'success');
        } else {
            await createInventoryItem(itemData);
            showNotification('Item added', 'success');
        }
        closeInventoryForm();
        loadInventory();
    } catch (error) {
        showNotification('Error saving inventory', 'error');
    }
}

function closeInventoryForm() {
    document.getElementById('inventory-form').style.display = 'none';
    document.getElementById('inventory-id').value = '';
}

async function deleteInventoryAction(id) {
    if (confirm('Delete this inventory item?')) {
        await deleteInventoryItem(id);
        loadInventory();
        showNotification('Item deleted', 'success');
    }
}

// ============ USER MANAGEMENT (OWNER ONLY) ============
async function loadUsers() {
    const users = await getAllUsers();
    const html = users.map(u => `
        <tr>
            <td>${u.username}</td>
            <td>${u.email}</td>
            <td>${u.role}</td>
            <td>${u.active ? '✓' : '✗'}</td>
            <td>
                <div class="action-buttons">
                    <button class="edit-btn" onclick="editUser(${u.id})">Edit</button>
                    <button class="delete-btn" onclick="deleteUserAction(${u.id})">Delete</button>
                </div>
            </td>
        </tr>
    `).join('');

    document.getElementById('users-list').innerHTML = html ? 
        `<table><thead><tr><th>Username</th><th>Email</th><th>Role</th><th>Active</th><th>Action</th></tr></thead><tbody>${html}</tbody></table>` :
        '<p class="empty-state">No users</p>';
}

function showNewUserForm() {
    const formHtml = `
        <h3>Add User</h3>
        <form onsubmit="saveUser(event)">
            <input type="hidden" id="user-id">
            <div class="form-group">
                <label>Username</label>
                <input type="text" id="user-username" required>
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="user-email" required>
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="user-password">
            </div>
            <div class="form-group">
                <label>Role</label>
                <select id="user-role" required>
                    <option value="staff">Staff</option>
                    <option value="owner">Owner</option>
                </select>
            </div>
            <div class="form-actions">
                <button type="submit" class="btn btn-primary">Save</button>
                <button type="button" class="btn btn-secondary" onclick="closeUserForm()">Cancel</button>
            </div>
        </form>
    `;
    document.getElementById('user-form').innerHTML = formHtml;
    document.getElementById('user-form').style.display = 'block';
}

async function editUser(id) {
    const user = await getUser(user.username);
    if (user) {
        document.getElementById('user-id').value = id;
        document.getElementById('user-username').value = user.username;
        document.getElementById('user-email').value = user.email;
        document.getElementById('user-role').value = user.role;
        showNewUserForm();
    }
}

async function saveUser(e) {
    e.preventDefault();
    const id = document.getElementById('user-id').value;
    const userData = {
        username: document.getElementById('user-username').value,
        email: document.getElementById('user-email').value,
        role: document.getElementById('user-role').value
    };

    if (document.getElementById('user-password').value) {
        userData.password = document.getElementById('user-password').value;
    }

    try {
        if (id) {
            await updateUser(id, userData);
            showNotification('User updated', 'success');
        } else {
            await createUser(userData);
            showNotification('User created', 'success');
        }
        closeUserForm();
        loadUsers();
    } catch (error) {
        showNotification('Error saving user', 'error');
    }
}

function closeUserForm() {
    document.getElementById('user-form').style.display = 'none';
    document.getElementById('user-id').value = '';
}

async function deleteUserAction(id) {
    if (confirm('Delete this user?')) {
        await deleteUser(id);
        loadUsers();
        showNotification('User deleted', 'success');
    }
}

// ============ REPORTS (OWNER) ============
async function generateReport() {
    const startDate = document.getElementById('report-start-date').value || new Date().toISOString().split('T')[0];
    const endDate = document.getElementById('report-end-date').value || new Date().toISOString().split('T')[0];

    const allOrders = await getAllOrders();
    const orders = allOrders.filter(o => o.date.startsWith(startDate) || o.date.startsWith(endDate) || 
                                         (o.date >= startDate && o.date <= endDate));

    const totalSales = orders.reduce((sum, o) => sum + o.totalAmount, 0);
    const avgOrder = orders.length > 0 ? totalSales / orders.length : 0;

    document.getElementById('report-total-sales').textContent = '₹' + totalSales.toFixed(2);
    document.getElementById('report-total-orders').textContent = orders.length;
    document.getElementById('report-avg-order').textContent = '₹' + avgOrder.toFixed(2);

    // Category-wise sales
    const categorySales = {};
    orders.forEach(o => {
        o.items.forEach(item => {
            if (!categorySales[item.category]) {
                categorySales[item.category] = { count: 0, total: 0 };
            }
            categorySales[item.category].count += item.quantity || 1;
            categorySales[item.category].total += item.price * (item.quantity || 1);
        });
    });

    const categoryHtml = Object.entries(categorySales).map(([cat, data]) => `
        <tr>
            <td>${cat}</td>
            <td>${data.count}</td>
            <td>₹${data.total.toFixed(2)}</td>
        </tr>
    `).join('');

    document.getElementById('category-sales').innerHTML = categoryHtml ? 
        `<table><thead><tr><th>Category</th><th>Items Sold</th><th>Total</th></tr></thead><tbody>${categoryHtml}</tbody></table>` :
        '<p class="empty-state">No data</p>';

    // Daily sales
    const dailySales = {};
    orders.forEach(o => {
        const date = o.date.split('T')[0];
        if (!dailySales[date]) dailySales[date] = 0;
        dailySales[date] += o.totalAmount;
    });

    const dailyHtml = Object.entries(dailySales).map(([date, total]) => `
        <tr>
            <td>${new Date(date).toLocaleDateString()}</td>
            <td>₹${total.toFixed(2)}</td>
        </tr>
    `).join('');

    document.getElementById('daily-sales').innerHTML = dailyHtml ? 
        `<table><thead><tr><th>Date</th><th>Sales</th></tr></thead><tbody>${dailyHtml}</tbody></table>` :
        '<p class="empty-state">No data</p>';
}

function exportReportCSV() {
    const startDate = document.getElementById('report-start-date').value;
    const endDate = document.getElementById('report-end-date').value;
    const csv = `Report from ${startDate} to ${endDate}\nGenerated: ${new Date().toLocaleString()}\n\n`;
    
    const totalSales = document.getElementById('report-total-sales').textContent;
    const totalOrders = document.getElementById('report-total-orders').textContent;
    const avgOrder = document.getElementById('report-avg-order').textContent;

    const content = csv + `Total Sales,${totalSales}\nTotal Orders,${totalOrders}\nAvg Order,${avgOrder}`;
    downloadFile(content, 'report.csv');
}

// ============ POS INTERFACE (STAFF) ============
async function loadPOSMenu() {
    const menuItems = await getAllMenuItems();
    const categories = [...new Set(menuItems.map(m => m.category))];

    // Categories
    const categoryHtml = '<button class="category-btn active" onclick="filterPOSCategory(\'All\')">All</button>' +
        categories.map(cat => `<button class="category-btn" onclick="filterPOSCategory('${cat}')">${cat}</button>`).join('');
    document.getElementById('pos-categories').innerHTML = categoryHtml;

    // Items
    const itemsHtml = menuItems.filter(m => selectedCategory === 'All' || m.category === selectedCategory)
        .map(item => `
        <div class="pos-item" onclick="addToCart(${item.id}, '${item.name}', ${item.price})">
            <h4>${item.name}</h4>
            <p class="price">₹${item.price.toFixed(2)}</p>
        </div>
    `).join('');
    document.getElementById('pos-items').innerHTML = itemsHtml || '<p class="empty-state">No items</p>';
}

function filterPOSCategory(category) {
    selectedCategory = category;
    document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    loadPOSMenu();
}

async function addToCart(itemId, name, price) {
    const existing = cart.find(c => c.itemId === itemId);
    if (existing) {
        existing.quantity++;
    } else {
        cart.push({ itemId, name, price, quantity: 1 });
    }
    updateCartDisplay();
}

function updateCartDisplay() {
    const cartItemsHtml = cart.map((item, idx) => `
        <div class="cart-item">
            <div class="cart-item-info">
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-price">₹${(item.price * item.quantity).toFixed(2)}</div>
            </div>
            <div class="cart-item-qty">
                <button onclick="decreaseQty(${idx})">-</button>
                <span>${item.quantity}</span>
                <button onclick="increaseQty(${idx})">+</button>
            </div>
            <button class="cart-item-remove" onclick="removeFromCart(${idx})">Remove</button>
        </div>
    `).join('');

    document.getElementById('cart-items').innerHTML = cartItemsHtml;

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = 0;
    const total = subtotal + tax;

    document.getElementById('subtotal').textContent = subtotal.toFixed(2);
    document.getElementById('tax').textContent = tax.toFixed(2);
    document.getElementById('cart-total').textContent = total.toFixed(2);
}

function increaseQty(idx) {
    cart[idx].quantity++;
    updateCartDisplay();
}

function decreaseQty(idx) {
    if (cart[idx].quantity > 1) {
        cart[idx].quantity--;
    } else {
        removeFromCart(idx);
    }
    updateCartDisplay();
}

function removeFromCart(idx) {
    cart.splice(idx, 1);
    updateCartDisplay();
}

function clearCart() {
    cart = [];
    updateCartDisplay();
}

async function completeOrder() {
    if (cart.length === 0) {
        showNotification('Cart is empty', 'warning');
        return;
    }

    const customerName = document.getElementById('pos-customer').value || 'Walk-in';
    const orderType = document.getElementById('pos-order-type').value;
    const totalAmount = parseFloat(document.getElementById('cart-total').textContent);
    const paymentMethod = document.getElementById('pos-payment').value;

    try {
        await createOrder({
            customerName,
            orderType,
            items: cart,
            totalAmount,
            paymentMethod,
            createdBy: currentUser.username
        });

        showNotification('Order completed successfully', 'success');
        cart = [];
        document.getElementById('pos-customer').value = '';
        updateCartDisplay();
        loadPOSMenu();
    } catch (error) {
        showNotification('Error creating order', 'error');
    }
}

// ============ STAFF REPORTS ============
async function loadStaffOrders() {
    const orders = await getAllOrders();
    const myOrders = orders.filter(o => o.createdBy === currentUser.username);

    const html = myOrders.reverse().map(o => `
        <tr>
            <td>${o.customerName}</td>
            <td>${o.orderType}</td>
            <td>₹${o.totalAmount.toFixed(2)}</td>
            <td>${new Date(o.date).toLocaleDateString()}</td>
        </tr>
    `).join('');

    document.getElementById('staff-orders-list').innerHTML = html ? 
        `<table><thead><tr><th>Customer</th><th>Type</th><th>Amount</th><th>Date</th></tr></thead><tbody>${html}</tbody></table>` :
        '<p class="empty-state">No orders</p>';
}

async function generateStaffReport() {
    const startDate = document.getElementById('staff-report-start-date').value || new Date().toISOString().split('T')[0];
    const endDate = document.getElementById('staff-report-end-date').value || new Date().toISOString().split('T')[0];

    const allOrders = await getAllOrders();
    const myOrders = allOrders.filter(o => 
        o.createdBy === currentUser.username && 
        (o.date.startsWith(startDate) || o.date.startsWith(endDate) || 
         (o.date >= startDate && o.date <= endDate))
    );

    const totalSales = myOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const avgOrder = myOrders.length > 0 ? totalSales / myOrders.length : 0;

    document.getElementById('staff-total-sales').textContent = '₹' + totalSales.toFixed(2);
    document.getElementById('staff-total-orders').textContent = myOrders.length;
    document.getElementById('staff-avg-order').textContent = '₹' + avgOrder.toFixed(2);
}

// ============ SETTINGS ============
async function handleSettingsSave(e) {
    e.preventDefault();
    const shopName = document.getElementById('shop-name').value;
    const ownerName = document.getElementById('owner-name').value;
    const shopPhone = document.getElementById('shop-phone').value;
    const currencySymbol = document.getElementById('currency-symbol').value;

    try {
        await saveSetting('shopName', shopName);
        await saveSetting('ownerName', ownerName);
        await saveSetting('shopPhone', shopPhone);
        await saveSetting('currencySymbol', currencySymbol);
        showNotification('Settings saved', 'success');
    } catch (error) {
        showNotification('Error saving settings', 'error');
    }
}

async function loadSettings() {
    document.getElementById('shop-name').value = await getSetting('shopName') || '';
    document.getElementById('owner-name').value = await getSetting('ownerName') || '';
    document.getElementById('shop-phone').value = await getSetting('shopPhone') || '';
    document.getElementById('currency-symbol').value = await getSetting('currencySymbol') || '₹';
}

async function exportData() {
    const data = await exportAllData();
    const json = JSON.stringify(data, null, 2);
    downloadFile(json, 'fb-shop-data.json');
    showNotification('Data exported', 'success');
}

function importDataFile() {
    document.getElementById('import-file').click();
}

document.addEventListener('change', async (e) => {
    if (e.target.id === 'import-file') {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    await importData(data);
                    showNotification('Data imported successfully', 'success');
                    window.location.reload();
                } catch (error) {
                    showNotification('Error importing data', 'error');
                }
            };
            reader.readAsText(file);
        }
    }
});

async function resetAllData() {
    if (confirm('This will delete all data. Are you sure?')) {
        if (confirm('Really delete all data? This cannot be undone.')) {
            await clearAllData();
            showNotification('All data cleared', 'success');
            window.location.reload();
        }
    }
}

// ============ UTILITIES ============
function downloadFile(content, filename) {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(content));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

function viewOrder(orderId) {
    alert('Order details view - Order ID: ' + orderId);
}
