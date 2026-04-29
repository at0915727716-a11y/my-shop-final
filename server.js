require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const morgan = require('morgan');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const PDFDocument = require('pdfkit');
const axios = require('axios');
const { body, validationResult } = require('express-validator');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

// ========== Import Models ==========
const Product = require('./models/Product');
const Order = require('./models/Order');
const User = require('./models/User');
const Coupon = require('./models/Coupon');
const Alert = require('./models/Alert');
const Review = require('./models/Review');
const Settings = require('./models/Settings');
const Admin = require('./models/Admin'); // نموذج المدير

const app = express();
const PORT = process.env.PORT || 3000;

// ========== DNS Fix ==========
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

// ========== MongoDB Connection with Retry ==========
const connectWithRetry = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB Connected Successfully');
        await initAdmin();
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        setTimeout(connectWithRetry, 5000);
    }
};
connectWithRetry();

// ========== Initialize Default Admin in MongoDB ==========
const initAdmin = async () => {
    const adminExists = await Admin.findOne();
    if (!adminExists) {
        const defaultHash = '$2b$10$is3BjBnkjKw.mN1vvCry8e.RNYwsc6DOGp18qruZ5iqoSl94paJbi'; // admin123
        const defaultAdmin = new Admin({
            username: 'admin',
            passwordHash: defaultHash
        });
        await defaultAdmin.save();
        console.log('✅ Default admin user created (admin / admin123)');
    }
};

// ========== Create Required Directories ==========
const uploadsPath = path.join(__dirname, 'public', 'uploads');
const logsPath = path.join(__dirname, 'logs');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
if (!fs.existsSync(logsPath)) fs.mkdirSync(logsPath, { recursive: true });

// ========== Security Middleware ==========
app.use(helmet({ contentSecurityPolicy: false }));
app.use(mongoSanitize());
app.use(xss());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
app.use(morgan('combined', { stream: fs.createWriteStream(path.join(logsPath, 'access.log'), { flags: 'a' }) }));

// Rate Limiting
app.set('trust proxy', 1);
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: { error: 'طلبات كثيرة، حاول لاحقاً' }
});
app.use('/api/', globalLimiter);
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'محاولات دخول كثيرة، حاول بعد 15 دقيقة' }
});
app.use('/api/admin/login', loginLimiter);

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'absi-default-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: false, maxAge: 3600000 }
}));

// ========== Admin Auth Middleware ==========
const isAdmin = async (req, res, next) => {
    if (req.session.isAdmin) return next();
    res.status(401).json({ error: 'غير مصرح، يرجى تسجيل الدخول' });
};

// ========== Email Transporter (Optional) ==========
let transporter = null;
if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
}
const sendEmail = async (to, subject, html) => {
    if (!transporter) return;
    try {
        await transporter.sendMail({ from: process.env.EMAIL_USER, to, subject, html });
    } catch (err) { console.error('Email error:', err); }
};

// ========== Multer Storage for Product Images ==========
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsPath),
    filename: (req, file, cb) => cb(null, `product-${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`)
});
const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(file.mimetype))
});

// ========== Helper: Validate Product Input ==========
const validateProduct = [
    body('name').notEmpty().withMessage('الاسم مطلوب'),
    body('price').isFloat({ min: 0 }).withMessage('السعر يجب أن يكون رقماً موجباً'),
    body('stock').isInt({ min: 0 }).withMessage('المخزون يجب أن يكون عدداً صحيحاً'),
    body('description').optional().isString(),
    body('category').optional().isString(),
    body('discountPercent').optional().isFloat({ min: 0, max: 100 })
];

// ========== 1. Public Product Routes ==========
app.get('/api/products', async (req, res) => {
    try {
        let products = await Product.find();
        const { search, category, minPrice, maxPrice } = req.query;
        if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
        if (category) products = products.filter(p => p.category === category);
        if (minPrice) products = products.filter(p => p.price >= parseFloat(minPrice));
        if (maxPrice) products = products.filter(p => p.price <= parseFloat(maxPrice));
        res.json({ success: true, data: products });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findOne({ id: req.params.id });
        if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
        res.json({ success: true, data: product });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== 2. Admin Product Management ==========
app.post('/api/admin/products', isAdmin, upload.single('productImage'), validateProduct, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const { name, price, stock, description, category, discountPercent } = req.body;
        const newProduct = new Product({
            name,
            price: parseFloat(price),
            stock: parseInt(stock),
            description: description || '',
            category: category || 'عام',
            discountPercent: parseFloat(discountPercent) || 0,
            imageUrl: req.file ? `/uploads/${req.file.filename}` : null
        });
        await newProduct.save();
        res.json({ success: true, data: newProduct });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/products/:id', isAdmin, upload.single('productImage'), async (req, res) => {
    try {
        const product = await Product.findOne({ id: req.params.id });
        if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
        const allowed = ['name', 'price', 'stock', 'description', 'category', 'discountPercent'];
        allowed.forEach(field => {
            if (req.body[field] !== undefined) product[field] = req.body[field];
        });
        if (req.file) {
            if (product.imageUrl) {
                const oldPath = path.join(uploadsPath, path.basename(product.imageUrl));
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }
            product.imageUrl = `/uploads/${req.file.filename}`;
        }
        await product.save();
        res.json({ success: true, data: product });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/admin/products/:id', isAdmin, async (req, res) => {
    try {
        const product = await Product.findOne({ id: req.params.id });
        if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
        if (product.imageUrl) {
            const imagePath = path.join(uploadsPath, path.basename(product.imageUrl));
            if (fs.existsSync(imagePath)) fs.unlinkSync(imagePath);
        }
        await Product.deleteOne({ id: req.params.id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== 3. Create Order ==========
app.post('/api/orders', [
    body('customerName').notEmpty(),
    body('customerPhone').notEmpty(),
    body('customerAddress').notEmpty(),
    body('cartItems').isArray({ min: 1 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const { customerName, customerPhone, customerAddress, cartItems, couponCode, customerEmail, notes } = req.body;
        let total = 0;
        const itemsData = [];
        for (const item of cartItems) {
            const product = await Product.findOne({ id: item.productId });
            if (!product) return res.status(400).json({ error: `المنتج غير موجود` });
            if (product.stock < item.quantity) return res.status(400).json({ error: `المنتج ${product.name} غير متوفر` });
            total += product.price * item.quantity;
            itemsData.push({ product, quantity: item.quantity });
        }

        let discount = 0;
        if (couponCode) {
            const allCoupons = await Coupon.find();
            const validCoupon = allCoupons.find(c =>
                c.code === couponCode &&
                new Date(c.expiryDate) > new Date() &&
                c.usedCount < c.usageLimit &&
                total >= (c.minCartAmount || 0)
            );
            if (validCoupon) {
                discount = validCoupon.type === 'percentage' ? (total * validCoupon.value / 100) : validCoupon.value;
                discount = Math.min(discount, total);
                validCoupon.usedCount++;
                await validCoupon.save();
            }
        }

        const finalTotal = total - discount;
        const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
        const newOrder = new Order({
            orderId,
            customerName,
            customerPhone,
            customerAddress,
            customerEmail: customerEmail || null,
            notes: notes || null,
            items: [],
            total: finalTotal,
            status: 'قيد المراجعة'
        });
        for (const { product, quantity } of itemsData) {
            newOrder.items.push({ productId: product.id, name: product.name, quantity, price: product.price });
        }
        await newOrder.save();

        // Update stock & Alerts
        for (const { product, quantity } of itemsData) {
            product.stock -= quantity;
            await product.save();
            if (product.stock <= 5) {
                const existing = await Alert.findOne({ productId: product.id });
                if (!existing || (Date.now() - new Date(existing.date).getTime() > 86400000)) {
                    const newAlert = new Alert({ productId: product.id, productName: product.name, remainingStock: product.stock });
                    await newAlert.save();
                }
            }
        }

        if (process.env.ADMIN_EMAIL) {
            sendEmail(process.env.ADMIN_EMAIL, `طلب جديد #${orderId}`, `<h3>طلب جديد</h3><p>${customerName}</p>`);
        }

        let whatsappText = `🛍️ طلب جديد في Absi stor\n👤 الاسم: ${customerName}\n📞 رقم الجوال: ${customerPhone}\n🏠 العنوان: ${customerAddress}\n🆔 رقم الطلب: ${orderId}\n💰 الإجمالي: ${finalTotal} ريال\n📦 المنتجات:\n`;
        for (const item of newOrder.items) {
            whatsappText += `- ${item.name} (${item.quantity} × ${item.price}) = ${item.price * item.quantity}\n`;
        }
        if (notes) whatsappText += `\n📝 ملاحظات: ${notes}`;
        const whatsappLink = `https://wa.me/218915727716?text=${encodeURIComponent(whatsappText)}`;
        res.json({ success: true, orderId, whatsappLink, message: 'تم استلام طلبك بنجاح' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ========== 4. Admin Authentication ==========
app.post('/api/admin/login', async (req, res) => {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (admin && bcrypt.compareSync(password, admin.passwordHash)) {
        req.session.isAdmin = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ error: 'بيانات غير صحيحة' });
    }
});
app.post('/api/admin/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ========== 5. Admin Order Management ==========
app.get('/api/admin/orders', isAdmin, async (req, res) => {
    const orders = await Order.find().sort({ date: -1 });
    res.json({ success: true, data: orders });
});
app.put('/api/admin/orders/:id/status', isAdmin, async (req, res) => {
    const order = await Order.findOne({ orderId: req.params.id });
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    order.status = req.body.status;
    await order.save();
    res.json({ success: true });
});

// ========== 6. Alerts ==========
app.get('/api/admin/alerts', isAdmin, async (req, res) => {
    const alerts = await Alert.find().sort({ date: -1 });
    res.json({ success: true, data: alerts });
});
app.delete('/api/admin/alerts/:productId', isAdmin, async (req, res) => {
    await Alert.deleteOne({ productId: req.params.productId });
    res.json({ success: true });
});

// ========== 7. Export Orders to CSV ==========
app.get('/api/admin/export-orders', isAdmin, async (req, res) => {
    const orders = await Order.find();
    let csv = 'رقم الطلب,الاسم,رقم الجوال,العنوان,الإجمالي,الحالة,التاريخ,المنتجات\n';
    orders.forEach(order => {
        const products = order.items.map(i => `${i.name} x${i.quantity}`).join('; ');
        csv += `"${order.orderId}","${order.customerName}","${order.customerPhone}","${order.customerAddress}",${order.total},"${order.status}","${order.date}","${products}"\n`;
    });
    res.header('Content-Type', 'text/csv');
    res.attachment('orders.csv');
    res.send(csv);
});

// ========== 8. Settings ==========
app.get('/api/admin/settings', isAdmin, async (req, res) => {
    let settings = await Settings.findOne();
    if (!settings) settings = new Settings();
    res.json({ success: true, data: settings });
});
app.put('/api/admin/settings', isAdmin, async (req, res) => {
    let settings = await Settings.findOne();
    if (!settings) settings = new Settings();
    settings.maintenance = req.body.maintenance ?? settings.maintenance;
    settings.maintenanceMessage = req.body.maintenanceMessage ?? settings.maintenanceMessage;
    await settings.save();
    res.json({ success: true });
});

// ========== 9. Coupons CRUD ==========
app.get('/api/admin/coupons', isAdmin, async (req, res) => {
    const coupons = await Coupon.find();
    res.json({ success: true, data: coupons });
});
app.post('/api/admin/coupons', isAdmin, async (req, res) => {
    const { code, type, value, expiryDate, usageLimit, minCartAmount, productId, newCustomerOnly } = req.body;
    const newCoupon = new Coupon({
        code: code.toUpperCase(),
        type,
        value: parseFloat(value),
        expiryDate,
        usageLimit: parseInt(usageLimit) || 1,
        minCartAmount: parseFloat(minCartAmount) || 0,
        productId: productId || null,
        newCustomerOnly: newCustomerOnly === 'true'
    });
    await newCoupon.save();
    res.json({ success: true, data: newCoupon });
});
app.delete('/api/admin/coupons/:id', isAdmin, async (req, res) => {
    await Coupon.deleteOne({ id: req.params.id });
    res.json({ success: true });
});

// ========== 10. Product Reviews ==========
app.get('/api/products/:id/reviews', async (req, res) => {
    const reviews = await Review.find({ productId: req.params.id }).sort({ date: -1 });
    res.json({ success: true, data: reviews });
});
app.post('/api/products/:id/reviews', async (req, res) => {
    const { rating, comment, customerName } = req.body;
    if (!rating || !comment) return res.status(400).json({ error: 'التقييم والتعليق مطلوبان' });
    const newReview = new Review({ productId: req.params.id, rating: parseInt(rating), comment, customerName: customerName || 'زائر' });
    await newReview.save();
    res.json({ success: true });
});

// ========== 11. Admin Dashboard Stats ==========
app.get('/api/admin/stats', isAdmin, async (req, res) => {
    try {
        const totalSalesAgg = await Order.aggregate([{ $group: { _id: null, totalSales: { $sum: "$total" } } }]);
        const totalSales = totalSalesAgg[0]?.totalSales || 0;
        const totalOrders = await Order.countDocuments();
        const totalProducts = await Product.countDocuments();
        const lowStock = await Product.countDocuments({ stock: { $lte: 5 } });
        const topProducts = await Order.aggregate([
            { $unwind: "$items" },
            { $group: { _id: "$items.name", totalSold: { $sum: "$items.quantity" } } },
            { $sort: { totalSold: -1 } },
            { $limit: 5 }
        ]);
        res.json({ success: true, data: { totalSales, totalOrders, totalProducts, lowStock, topProducts } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== 12. Users Management (Admin) ==========
app.get('/api/admin/users', isAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
        res.json({ success: true, data: users });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== 13. SEO: Sitemap.xml ==========
app.get('/sitemap.xml', async (req, res) => {
    const products = await Product.find();
    let urls = [`<url><loc>https://my-shop-final.onrender.com/</loc><lastmod>${new Date().toISOString()}</lastmod></url>`];
    products.forEach(p => {
        urls.push(`<url><loc>https://my-shop-final.onrender.com/product.html?id=${p.id}</loc><lastmod>${p.createdAt.toISOString()}</lastmod></url>`);
    });
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
});

// ========== 14. User Accounts (Register/Login) ==========
app.post('/api/register', [
    body('username').notEmpty(),
    body('email').isEmail(),
    body('password').isLength({ min: 6 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const { username, email, password } = req.body;
        if (await User.findOne({ email })) return res.status(400).json({ error: 'البريد مسجل مسبقاً' });
        const hash = bcrypt.hashSync(password, 10);
        const newUser = new User({ username, email, passwordHash: hash });
        await newUser.save();
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) return res.status(401).json({ error: 'بيانات غير صحيحة' });
    req.session.userId = user.id;
    req.session.userName = user.username;
    req.session.userEmail = user.email;
    res.json({ success: true, userName: user.username });
});

app.get('/api/account/orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مسجل دخول' });
    const userOrders = await Order.find({ customerEmail: req.session.userEmail }).sort({ date: -1 });
    res.json({ success: true, data: userOrders });
});

// ========== 15. Health Check ==========
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', uptime: process.uptime(), mongo: mongoose.connection.readyState === 1 });
});

// ========== 16. PDF Invoice (Admin only) ==========
app.get('/api/orders/:id/invoice', isAdmin, async (req, res) => {
    const order = await Order.findOne({ orderId: req.params.id });
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.orderId}.pdf`);
    doc.pipe(res);
    doc.fontSize(20).text('Absi stor - فاتورة', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(`رقم الطلب: ${order.orderId}`);
    doc.text(`التاريخ: ${new Date(order.date).toLocaleDateString()}`);
    doc.text(`العميل: ${order.customerName}`);
    doc.text(`الجوال: ${order.customerPhone}`);
    doc.text(`العنوان: ${order.customerAddress}`);
    doc.moveDown();
    doc.text('المنتجات:', { underline: true });
    order.items.forEach(item => {
        doc.text(`- ${item.name} (${item.quantity} × ${item.price}) = ${item.price * item.quantity}`);
    });
    doc.moveDown();
    doc.fontSize(14).text(`الإجمالي: ${order.total} ريال`, { align: 'right' });
    doc.end();
});

// ========== 17. Optional: Migration from JSON to MongoDB ==========
app.post('/api/admin/migrate-from-json', isAdmin, async (req, res) => {
    const dataDir = path.join(__dirname, 'data');
    try {
        const productsJson = JSON.parse(fs.readFileSync(path.join(dataDir, 'products.json'), 'utf8'));
        for (const p of productsJson) {
            const exists = await Product.findOne({ id: p.id });
            if (!exists) await Product.create(p);
        }
        const ordersJson = JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8'));
        for (const o of ordersJson) {
            const exists = await Order.findOne({ orderId: o.orderId });
            if (!exists) await Order.create(o);
        }
        res.json({ success: true, message: 'Migration completed' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== Global Error Handler ==========
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'حدث خطأ داخلي في الخادم' });
});

// ========== Start Server ==========
app.listen(PORT, () => {
    console.log(`\n🚀 متجر Absi stor يعمل على http://localhost:${PORT}`);
    console.log(`📱 المتجر: http://localhost:${PORT}/shop.html`);
    console.log(`🔐 لوحة التحكم: http://localhost:${PORT}/login.html`);
    console.log(`📞 واتساب المدير: +218915727716`);
    console.log(`🔑 بيانات الدخول للمدير: admin / admin123\n`);
});