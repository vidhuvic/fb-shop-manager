# 🍽️ F&B Shop Manager - Offline POS & Sales Management System

A completely **offline**, **no-server**, **no-API** web-based point-of-sale (POS) and inventory management system for small food & beverage shops. All data is stored locally in the browser using **IndexedDB**, making it perfect for shops without reliable internet connectivity.

## ✨ Features

### 🔐 Authentication & Role-Based Access
- **Two user types**: Owner and Staff
- Secure login with local database verification
- Role-based interface and feature access
- Default demo accounts for testing

### 👑 Owner Features
- **Dashboard**: Real-time sales metrics, low stock alerts, recent orders
- **Order Management**: View, track, and delete orders
- **Menu Management**: Add, edit, delete menu items with categories and pricing
- **Inventory Management**: Track stock levels with minimum thresholds and cost tracking
- **User Management**: Create and manage staff accounts
- **Advanced Reports**: 
  - Sales analytics by date range
  - Category-wise sales breakdown
  - Daily sales trends
  - Export reports to CSV
- **Settings**: Configure shop information
- **Data Management**: Export/Import all data, backup/restore functionality

### 👨‍💼 Staff Features
- **Multi-Tab POS Interface**: Fast, intuitive order creation
  - Category-filtered menu browsing
  - Quick item selection
  - Quantity adjustment with +/- buttons
  - Real-time cart calculation
  - Payment method selection (Cash, Card, UPI)
  - Order type selection (Dine-in, Takeaway, Delivery)
- **Order History**: View all orders created by staff
- **Basic Reports**: Personal sales metrics and order summary

### 💾 Data Storage
- **IndexedDB**: Browser-based local database
- **No server required**: Everything works offline
- **Persistent storage**: Data remains after browser close
- **Export/Import**: Backup and restore full database as JSON
- **Fast access**: Instant data retrieval and operations

## 🚀 Getting Started

### Prerequisites
- Any modern web browser (Chrome, Firefox, Safari, Edge)
- No internet connection required
- No backend server needed

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/vidhuvic/fb-shop-manager.git
cd fb-shop-manager
```

2. **Open in browser**
   - Simply open `index.html` in your web browser
   - Or use a local server (recommended):
     ```bash
     # Using Python 3
     python -m http.server 8000
     
     # Using Python 2
     python -m SimpleHTTPServer 8000
     
     # Using Node.js (http-server)
     npx http-server
     ```
   - Then navigate to `http://localhost:8000`

### Default Login Credentials

**Owner Account:**
- Username: `owner`
- Password: `owner123`

**Staff Account:**
- Username: `staff`
- Password: `staff123`

⚠️ **First login**: Change these credentials in User Management after setup!

## 📖 How to Use

### For Owners

#### Dashboard
1. View today's sales, order count, menu items, and low-stock alerts
2. See recent orders in a quick summary table
3. All metrics update in real-time as staff creates orders

#### Menu Management
1. Click "Menu" in sidebar
2. Click "+ Add Item" to create new menu items
3. Enter item details:
   - Item name
   - Category (e.g., Appetizer, Main Course, Beverage)
   - Price
   - Description
   - Availability status
4. Edit or delete items as needed

#### Inventory Management
1. Click "Inventory" in sidebar
2. Add items with:
   - Item name
   - Current quantity
   - Unit of measurement (kg, litre, pieces)
   - Cost price
   - Minimum stock level (for low-stock alerts)
3. System alerts when quantity falls below minimum level
4. Edit stock levels as items are restocked

#### User Management
1. Click "Users" in sidebar
2. Create new staff accounts:
   - Set username and password
   - Assign role (Owner or Staff)
   - Assign email
3. Edit or delete users as needed
4. Track all user accounts created

#### Reports
1. Click "Reports" in sidebar
2. Select date range (defaults to today)
3. View:
   - Total sales amount
   - Total orders count
   - Average order value
   - Category-wise sales breakdown
   - Daily sales trends
4. Export reports as CSV for spreadsheet analysis

#### Settings
1. Click "Settings" in sidebar
2. Update shop information:
   - Shop name
   - Owner name
   - Phone number
   - Currency symbol
3. **Data Management**:
   - **Export Data**: Download complete database as JSON backup
   - **Import Data**: Restore from previously exported JSON backup
   - **Clear All**: Delete all data (use with caution!)

### For Staff

#### POS (Point of Sale)
1. Login with staff account
2. Automatically shown POS interface
3. **Creating an Order**:
   - Enter customer name (optional, defaults to "Walk-in")
   - Select order type: Dine-in, Takeaway, or Delivery
   - Browse menu by category or view all items
   - Click items to add to cart
   - Adjust quantities with +/- buttons
   - Remove items if needed
   - Select payment method
   - Click "Complete Order" to finalize
4. Cart shows real-time totals
5. Order saved automatically to database

#### Order History
1. Click "Orders" in sidebar
2. View all orders you've created
3. See customer name, order type, amount, and date

#### Personal Reports
1. Click "Reports" in sidebar
2. View personal sales metrics:
   - Total sales amount (for your orders)
   - Total orders created
   - Average order value
3. Filter by date range
4. Compare your performance over time

## 🗄️ Database Schema

### Users Table
```
id, username, password, email, role, createdAt, active
```

### Menu Items Table
```
id, name, category, price, description, available, createdAt, updatedAt
```

### Orders Table
```
id, customerName, orderType, items, totalAmount, notes, date, status, paymentMethod, createdBy
```

### Inventory Table
```
id, itemName, quantity, unit, costPrice, minLevel, lastRestockDate, createdAt
```

### Settings Table
```
key, value, updatedAt
```

## 🔒 Security Notes

- **Local storage only**: No data is sent to servers
- **Simple authentication**: Demo uses simple hash (in production, use stronger encryption)
- **Session management**: Uses browser sessionStorage
- **Export/Import**: Exported files contain all data - store backups securely

## 🛠️ Troubleshooting

### Issue: Data not persisting
- **Solution**: Check browser's IndexedDB is enabled
- Open DevTools → Application → IndexedDB → FBShopDB
- Try clearing browser cache and reloading

### Issue: Can't login with default credentials
- **Solution**: Clear browser data and reload
- Or open DevTools → Application → Clear site data
- App will reinitialize with default users

### Issue: Slow performance with large datasets
- **Solution**: IndexedDB performs well up to 50,000+ orders
- If experiencing slowness, try exporting data and clearing old records

### Issue: Browser data cleared unexpectedly
- **Solution**: Regular exports are recommended for backup
- Keep exported JSON files on external storage

## 📈 Performance Tips

1. **Regular Exports**: Export data weekly as backup
2. **Archive Old Data**: Regularly clean up very old orders
3. **Category Management**: Keep menu categories organized for faster browsing
4. **Inventory Updates**: Update stock levels regularly for accurate reports

## 🚀 Future Enhancement Ideas

- [ ] Receipt printing functionality
- [ ] Barcode scanning support
- [ ] Multi-table/counter support with tab management
- [ ] Customer loyalty program
- [ ] Advanced analytics and charts
- [ ] Multi-currency support
- [ ] SMS notifications for orders
- [ ] Cloud sync option (sync to backend when internet available)
- [ ] Discount and promotion management
- [ ] GST/Tax calculation

## 📝 File Structure

```
fb-shop-manager/
├── index.html          # Main HTML structure
├── styles.css          # Complete styling
├── db.js              # IndexedDB database layer
├── app.js             # Application logic
└── README.md          # This file
```

## 🤝 Contributing

Feel free to fork this repository and submit pull requests for any improvements.

## 📄 License

MIT License - Feel free to use this project for personal or commercial use.

## 👨‍💻 Author

Created by: **VIDHUVIC**

## 📞 Support

For issues, suggestions, or questions, please open an issue on GitHub.

---

## 💡 Quick Tips

1. **First Time Setup**: 
   - Login as owner (owner/owner123)
   - Go to Settings and update shop information
   - Create menu items in Menu section
   - Add staff users in Users section

2. **Daily Workflow**:
   - Staff logs in and uses POS to create orders
   - Owner reviews dashboard throughout the day
   - At end of day, owner reviews reports and exports data

3. **Regular Maintenance**:
   - Update inventory levels when stock changes
   - Keep menu updated with available items
   - Regularly backup data using export function
   - Review sales trends in reports section

4. **Mobile Use**:
   - Works on tablets and phones
   - Responsive design adapts to screen size
   - Touch-friendly buttons and interface

---

## Demo Video Workflow

### Owner Day
1. Open app, login as owner
2. Check dashboard for today's metrics
3. Review recent orders
4. Update menu items if needed
5. Check low-stock alerts in inventory
6. Export data for backup
7. Logout

### Staff Day
1. Open app, login as staff
2. Use POS interface to take orders
3. Add items to cart, adjust quantities
4. Complete order with payment method
5. Start new order
6. View order history in Orders section
7. Check personal sales in Reports
8. Logout

---

**Enjoy using F&B Shop Manager! 🎉**

Perfect for small restaurants, cafes, food stalls, and food delivery operations.
All offline. All local. All yours.