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
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { body, validationResult } = require('express-validator');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const crypto = require('crypto');
const cron = require('node-cron');

// ========== Cloudinary ==========
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// ========== Import Models ==========
const Product = require('./models/Product');
const Order = require('./models/Order');
const User = require('./models/User');
const Coupon = require('./models/Coupon');
const Alert = require('./models/Alert');
const Review = require('./models/Review');
const Settings = require('./models/Settings');
const Admin = require('./models/Admin');
const Wishlist = require('./models/Wishlist');
const OrderArchive = require('./models/OrderArchive');
const Offer = require('./models/Offer');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== DNS Fix ==========
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

// ========== MongoDB Connection ==========
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB Connected Successfully');
        await initAdmin();
    } catch (err) {
        console.error('❌ MongoDB Connection Error:', err.message);
        setTimeout(connectDB, 5000);
    }
};
connectDB();

const initAdmin = async () => {
    const adminExists = await Admin.findOne();
    if (!adminExists) {
        const defaultAdmin = new Admin({
            username: 'admin',
            passwordHash: '$2b$10$is3BjBnkjKw.mN1vvCry8e.RNYwsc6DOGp18qruZ5iqoSl94paJbi'
        });
        await defaultAdmin.save();
        console.log('✅ Default admin user created (admin / admin123)');
    }
};

// ========== Create Directories ==========
const uploadsPath = path.join(__dirname, 'public', 'uploads');
const logsPath = path.join(__dirname, 'logs');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
if (!fs.existsSync(logsPath)) fs.mkdirSync(logsPath, { recursive: true });

// ========== Middleware ==========
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(mongoSanitize());
app.use(xss());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));
app.use(morgan('combined', { stream: fs.createWriteStream(path.join(logsPath, 'access.log'), { flags: 'a' }) }));

// ========== Maintenance Mode Middleware ==========
app.use(async (req, res, next) => {
    // استثناء المسارات الإدارية ومسارات الصحة والاختبار
    if (req.path.startsWith('/api/admin') || req.path === '/login.html' || req.path === '/health' || req.path === '/debug-env' || req.path === '/test-email') {
        return next();
    }
    const settings = await Settings.findOne();
    if (settings && settings.maintenance === true) {
        if (req.xhr || req.path.startsWith('/api/')) {
            return res.status(503).json({ error: 'المتجر في صيانة مؤقتة، عاود المحاولة لاحقاً' });
        } else {
            return res.sendFile(path.join(__dirname, 'public', 'maintenance.html'));
        }
    }
    next();
});

// Rate Limiting
const globalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { error: 'طلبات كثيرة' } });
app.use('/api/', globalLimiter);
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'محاولات كثيرة' } });
app.use('/api/admin/login', loginLimiter);
app.use('/api/login', loginLimiter);

// ========== Redis Session Store (optional) ==========
let sessionStore;
try {
    const RedisStore = require('connect-redis').default;
    const redisClient = require('redis').createClient({
        url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    redisClient.connect().catch(err => console.warn('Redis connection failed, using memory store', err));
    sessionStore = new RedisStore({ client: redisClient });
    console.log('✅ Redis session store enabled');
} catch (err) {
    console.warn('⚠️ Redis not available, using default memory store');
    sessionStore = undefined;
}

// Session
app.use(session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'absi-default-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 3600000 }
}));

const isAdmin = (req, res, next) => {
    if (req.session.isAdmin) return next();
    res.status(401).json({ error: 'غير مصرح' });
};

// ========== Email with Resend (SMTP) ==========
let transporter = null;
if (process.env.RESEND_API_KEY) {
    transporter = nodemailer.createTransport({
        host: "smtp.resend.com",
        port: 465,
        secure: true,
        auth: {
            user: "resend",
            pass: process.env.RESEND_API_KEY,
        },
    });
    console.log('✅ Resend email transporter configured');
} else {
    console.warn('⚠️ RESEND_API_KEY not found, email features disabled');
}

const sendEmail = async (to, subject, html) => {
    if (!transporter) return;
    try {
        await transporter.sendMail({ from: process.env.EMAIL_FROM || 'onboarding@resend.dev', to, subject, html });
    } catch (err) { console.error('Email error:', err); }
};

// ========== Test email endpoint ==========
app.get('/test-email', async (req, res) => {
    try {
        await sendEmail('at0915727716@gmail.com', 'اختبار فوري من المتجر', '<h1>✅ تم إرسال هذا البريد عبر Resend</h1><p>إذا وصلت هذه الرسالة، فالمشكلة في رابط التفعيل فقط.</p>');
        res.send('✅ تم إرسال البريد، تحقق من صندوق الوارد (بما في ذلك Spam)');
    } catch (err) {
        console.error('Test email error:', err);
        res.status(500).send('❌ فشل الإرسال: ' + err.message);
    }
});

// ========== Debug endpoint ==========
app.get('/debug-env', (req, res) => {
    const hasKey = !!process.env.RESEND_API_KEY;
    const preview = hasKey ? process.env.RESEND_API_KEY.substring(0, 8) + '...' : 'undefined';
    res.json({
        RESEND_API_KEY_exists: hasKey,
        RESEND_API_KEY_preview: preview,
        transporter_ready: !!transporter
    });
});

// ========== Multer + Cloudinary ==========
const storage = new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => ({
        folder: 'absi-stor',
        format: file.mimetype.split('/')[1],
        transformation: [{ width: 500, height: 500, crop: 'limit' }]
    })
});
const upload = multer({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(file.mimetype))
});

// ========== Product Validation ==========
const validateProduct = [
    body('name').notEmpty(),
    body('price').isFloat({ min: 0 }),
    body('stock').isInt({ min: 0 })
];

// ========== PayPal Integration ==========
const paypal = require('@paypal/checkout-server-sdk');
function environment() {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        console.warn('⚠️ PayPal credentials missing, PayPal endpoints disabled');
        return null;
    }
    if (process.env.NODE_ENV === 'production') {
        return new paypal.core.LiveEnvironment(clientId, clientSecret);
    } else {
        return new paypal.core.SandboxEnvironment(clientId, clientSecret);
    }
}
let paypalClient = null;
if (environment()) {
    paypalClient = new paypal.core.PayPalHttpClient(environment());
}

app.post('/api/create-paypal-order', async (req, res) => {
    if (!paypalClient) return res.status(501).json({ error: 'PayPal not configured' });
    const { total, currency = 'USD' } = req.body;
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
            amount: { currency_code: currency, value: total.toFixed(2) }
        }]
    });
    try {
        const order = await paypalClient.execute(request);
        res.json({ id: order.result.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/capture-paypal-order', async (req, res) => {
    if (!paypalClient) return res.status(501).json({ error: 'PayPal not configured' });
    const { orderID } = req.body;
    const request = new paypal.orders.OrdersCaptureRequest(orderID);
    request.requestBody({});
    try {
        const capture = await paypalClient.execute(request);
        res.json(capture.result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== Socket.io ==========
const http = require('http');
const serverSocket = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(serverSocket, { cors: { origin: '*' } });
const userSockets = new Map();

io.use((socket, next) => {
    const userId = socket.handshake.auth.userId;
    if (userId) socket.userId = userId;
    next();
});

io.on('connection', (socket) => {
    if (socket.userId) userSockets.set(socket.userId, socket.id);
    socket.on('disconnect', () => {
        if (socket.userId) userSockets.delete(socket.userId);
    });
});

function notifyUser(userId, event, data) {
    const socketId = userSockets.get(userId);
    if (socketId) io.to(socketId).emit(event, data);
}

// ========== 1. Public Products (with dynamic offers) ==========
app.get('/api/products', async (req, res) => {
    try {
        let products = await Product.find();
        const offers = await Offer.find({ active: true, startDate: { $lte: new Date() }, endDate: { $gte: new Date() } });
        products = products.map(p => {
            let maxDiscount = p.discountPercent || 0;
            for (const offer of offers) {
                if (offer.type === 'category' && p.category === offer.target) maxDiscount = Math.max(maxDiscount, offer.discountPercent);
                if (offer.type === 'product' && p.id === offer.target) maxDiscount = Math.max(maxDiscount, offer.discountPercent);
            }
            p.discountPercent = maxDiscount;
            return p;
        });
        const { search, category, minPrice, maxPrice, minDiscount, minRating } = req.query;
        if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
        if (category) products = products.filter(p => p.category === category);
        if (minPrice) products = products.filter(p => p.price >= parseFloat(minPrice));
        if (maxPrice) products = products.filter(p => p.price <= parseFloat(maxPrice));
        if (minDiscount) products = products.filter(p => (p.discountPercent || 0) >= parseFloat(minDiscount));
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

// ========== 2. Admin Products Management ==========
app.post('/api/admin/products', isAdmin, upload.single('productImage'), validateProduct, async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const { name, price, stock, description, category, discountPercent, variants, gallery } = req.body;
        let parsedVariants = [], parsedGallery = [];
        if (variants) try { parsedVariants = JSON.parse(variants); } catch(e) {}
        if (gallery) try { parsedGallery = JSON.parse(gallery); } catch(e) {}
        const newProduct = new Product({
            name, price: parseFloat(price), stock: parseInt(stock), description: description || '',
            category: category || 'عام', discountPercent: parseFloat(discountPercent) || 0,
            imageUrl: req.file ? req.file.path : null, variants: parsedVariants, gallery: parsedGallery,
            createdAt: new Date().toISOString()
        });
        await newProduct.save();
        res.json({ success: true, data: newProduct });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/admin/products/:id', isAdmin, upload.single('productImage'), async (req, res) => {
    try {
        const product = await Product.findOne({ id: req.params.id });
        if (!product) return res.status(404).json({ error: 'المنتج غير موجود' });
        ['name', 'price', 'stock', 'description', 'category', 'discountPercent'].forEach(field => {
            if (req.body[field] !== undefined) product[field] = req.body[field];
        });
        if (req.body.variants) try { product.variants = JSON.parse(req.body.variants); } catch(e) {}
        if (req.body.gallery) try { product.gallery = JSON.parse(req.body.gallery); } catch(e) {}
        if (req.file) {
            if (product.imageUrl) {
                const publicId = product.imageUrl.split('/').slice(-2).join('/').split('.')[0];
                await cloudinary.uploader.destroy(publicId);
            }
            product.imageUrl = req.file.path;
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
            const publicId = product.imageUrl.split('/').slice(-2).join('/').split('.')[0];
            await cloudinary.uploader.destroy(publicId);
        }
        await Product.deleteOne({ id: req.params.id });
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== 3. Orders ==========
const SHIPPING_COSTS = { standard: 10, express: 25, pickup: 0 };
app.post('/api/orders', [
    body('customerName').notEmpty(),
    body('customerPhone').notEmpty(),
    body('customerAddress').notEmpty(),
    body('cartItems').isArray({ min: 1 })
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    try {
        const { customerName, customerPhone, customerAddress, cartItems, couponCode, customerEmail, notes, shippingMethod = 'standard', usePoints = false } = req.body;

        let total = 0;
        const itemsData = [];
        for (const item of cartItems) {
            let product;
            if (item.variantId) {
                product = await Product.findOne({ id: item.productId });
                const variant = product.variants.find(v => v.id === item.variantId);
                if (!variant || variant.stock < item.quantity) return res.status(400).json({ error: `المنتج غير متوفر` });
                total += (variant.price || product.price) * item.quantity;
                itemsData.push({ product, quantity: item.quantity, variant });
            } else {
                product = await Product.findOne({ id: item.productId });
                if (!product) return res.status(400).json({ error: `المنتج غير موجود` });
                if (product.stock < item.quantity) return res.status(400).json({ error: `المنتج ${product.name} غير متوفر` });
                total += product.price * item.quantity;
                itemsData.push({ product, quantity: item.quantity, variant: null });
            }
        }

        let discount = 0;
        let usedCoupon = null;
        if (couponCode) {
            const coupon = await Coupon.findOne({ code: couponCode });
            if (coupon && new Date(coupon.expiryDate) > new Date() && coupon.usedCount < coupon.usageLimit) {
                let cartTotalValid = total >= (coupon.minCartAmount || 0);
                let productValid = true;
                if (coupon.productId) {
                    const hasProduct = cartItems.some(item => item.productId === coupon.productId);
                    if (!hasProduct) productValid = false;
                }
                let newCustomerValid = true;
                if (coupon.newCustomerOnly && customerEmail) {
                    const existingOrder = await Order.findOne({ customerEmail });
                    if (existingOrder) newCustomerValid = false;
                }
                if (cartTotalValid && productValid && newCustomerValid) {
                    discount = coupon.type === 'percentage' ? (total * coupon.value / 100) : coupon.value;
                    discount = Math.min(discount, total);
                    coupon.usedCount++;
                    await coupon.save();
                    usedCoupon = coupon.code;
                }
            }
        }

        let pointsRedeemed = 0;
        let pointsDiscount = 0;
        let user = null;
        if (usePoints && customerEmail) {
            user = await User.findOne({ email: customerEmail });
            if (user && user.loyaltyPoints > 0) {
                pointsRedeemed = Math.min(user.loyaltyPoints, Math.floor(total * 0.3));
                pointsDiscount = pointsRedeemed;
                user.loyaltyPoints -= pointsRedeemed;
                await user.save();
            }
        }

        const shippingCost = SHIPPING_COSTS[shippingMethod] || 0;
        const finalTotal = total - discount - pointsDiscount + shippingCost;
        const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        const newOrder = new Order({
            orderId, customerName, customerPhone, customerAddress, customerEmail: customerEmail || null,
            notes: notes || null, items: [], total: finalTotal, status: 'قيد المراجعة',
            shippingMethod, shippingCost, pointsRedeemed, pointsDiscount, couponCode: usedCoupon,
            discountAmount: discount
        });

        for (const { product, quantity, variant } of itemsData) {
            newOrder.items.push({
                productId: product.id,
                name: product.name,
                quantity,
                price: variant ? (variant.price || product.price) : product.price,
                variantId: variant ? variant.id : null
            });
        }
        await newOrder.save();

        let pointsEarned = 0;
        for (const { product, quantity, variant } of itemsData) {
            if (variant) {
                const variantIndex = product.variants.findIndex(v => v.id === variant.id);
                if (variantIndex !== -1) product.variants[variantIndex].stock -= quantity;
                await product.save();
            } else {
                product.stock -= quantity;
                await product.save();
            }
            if (product.stock <= 5) {
                const existing = await Alert.findOne({ productId: product.id });
                if (!existing || (Date.now() - new Date(existing.date).getTime() > 86400000)) {
                    await new Alert({ productId: product.id, productName: product.name, remainingStock: product.stock }).save();
                }
            }
            pointsEarned += Math.floor(product.price * quantity * 0.01);
        }
        if (customerEmail) {
            if (!user) user = await User.findOne({ email: customerEmail });
            if (user) {
                user.loyaltyPoints += pointsEarned;
                await user.save();
            }
        }

        if (process.env.ADMIN_EMAIL) {
            sendEmail(process.env.ADMIN_EMAIL, `طلب جديد #${orderId}`, `<h3>طلب جديد</h3><p>${customerName}</p>`);
        }

        if (customerEmail) {
            const userDb = await User.findOne({ email: customerEmail });
            if (userDb) notifyUser(userDb.id, 'newOrder', { orderId, total: finalTotal });
        }

        let whatsappText = `🛍️ طلب جديد في Absi stor\n👤 الاسم: ${customerName}\n📞 رقم الجوال: ${customerPhone}\n🏠 العنوان: ${customerAddress}\n🆔 رقم الطلب: ${orderId}\n💰 الإجمالي: ${finalTotal} ريال (الشحن: ${shippingCost} ريال)\n📦 المنتجات:\n`;
        for (const item of newOrder.items) whatsappText += `- ${item.name} (${item.quantity} × ${item.price}) = ${item.price * item.quantity}\n`;
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
    } else res.status(401).json({ error: 'بيانات غير صحيحة' });
});
app.post('/api/admin/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

// ========== 5. Admin Orders ==========
app.get('/api/admin/orders', isAdmin, async (req, res) => {
    const orders = await Order.find().sort({ date: -1 });
    res.json({ success: true, data: orders });
});
app.put('/api/admin/orders/:id/status', isAdmin, async (req, res) => {
    const order = await Order.findOne({ orderId: req.params.id });
    if (!order) return res.status(404).json({ error: 'الطلب غير موجود' });
    order.status = req.body.status;
    await order.save();
    if (order.customerEmail) {
        sendEmail(order.customerEmail, `تحديث حالة طلبك #${order.orderId}`, `<p>أهلاً ${order.customerName}، تم تغيير حالة طلبك إلى: ${req.body.status}</p>`);
        const user = await User.findOne({ email: order.customerEmail });
        if (user) notifyUser(user.id, 'orderStatusChanged', { orderId: order.orderId, status: order.status });
    }
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

// ========== 7. Export CSV ==========
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
    settings.maintenance = req.body.maintenance ?? false;
    settings.maintenanceMessage = req.body.maintenanceMessage ?? 'المتجر في صيانة';
    await settings.save();
    res.json({ success: true });
});

// ========== 9. Coupons ==========
app.get('/api/admin/coupons', isAdmin, async (req, res) => {
    const coupons = await Coupon.find();
    res.json({ success: true, data: coupons });
});
app.post('/api/admin/coupons', isAdmin, async (req, res) => {
    const { code, type, value, expiryDate, usageLimit, minCartAmount, productId, newCustomerOnly } = req.body;
    const newCoupon = new Coupon({
        code: code.toUpperCase(), type, value: parseFloat(value), expiryDate,
        usageLimit: parseInt(usageLimit) || 1, minCartAmount: parseFloat(minCartAmount) || 0,
        productId: productId || null, newCustomerOnly: newCustomerOnly === 'true'
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
    await new Review({ productId: req.params.id, rating: parseInt(rating), comment, customerName: customerName || 'زائر' }).save();
    res.json({ success: true });
});
app.post('/api/admin/reviews/:id/reply', isAdmin, async (req, res) => {
    const { reply } = req.body;
    if (!reply) return res.status(400).json({ error: 'الرد مطلوب' });
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ error: 'التقييم غير موجود' });
    review.adminReply = reply;
    review.adminReplyDate = new Date();
    await review.save();
    res.json({ success: true });
});

// ========== 11. Admin Stats ==========
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
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== 12. Users Management ==========
app.get('/api/admin/users', isAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-passwordHash').sort({ createdAt: -1 });
        const usersWithStats = await Promise.all(users.map(async (user) => {
            const orders = await Order.find({ customerEmail: user.email });
            const totalSpent = orders.reduce((sum, o) => sum + o.total, 0);
            return { ...user.toObject(), totalOrders: orders.length, totalSpent };
        }));
        res.json({ success: true, data: usersWithStats });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== 13. Sitemap ==========
app.get('/sitemap.xml', async (req, res) => {
    const products = await Product.find();
    let urls = [`<url><loc>https://my-shop-final.onrender.com/</loc><lastmod>${new Date().toISOString()}</lastmod></url>`];
    products.forEach(p => {
        urls.push(`<url><loc>https://my-shop-final.onrender.com/product.html?id=${p.id}</loc><lastmod>${p.createdAt.toISOString()}</lastmod></url>`);
    });
    res.header('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`);
});

// ========== 14. User Accounts & Loyalty ==========
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
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const user = new User({ username, email, passwordHash: hash, verificationToken, verified: false });
        await user.save();
        const verifyLink = `https://my-shop-final.onrender.com/verify-email.html?token=${verificationToken}`;
        await sendEmail(email, 'تفعيل حسابك في Absi stor', `<p>مرحباً ${username}, اضغط على الرابط لتفعيل حسابك: <a href="${verifyLink}">${verifyLink}</a></p>`);
        res.json({ success: true, message: 'تم التسجيل، يرجى تفعيل حسابك عبر البريد' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/verify-email', async (req, res) => {
    const { token } = req.query;
    const user = await User.findOne({ verificationToken: token });
    if (!user) return res.status(400).send('رابط غير صالح');
    user.verified = true;
    user.verificationToken = null;
    await user.save();
    res.send('تم تفعيل حسابك بنجاح، يمكنك الآن تسجيل الدخول');
});

app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) return res.status(401).json({ error: 'بيانات غير صحيحة' });
    if (!user.verified) return res.status(401).json({ error: 'يرجى تفعيل حسابك عبر البريد الإلكتروني أولاً' });
    req.session.userId = user.id;
    req.session.userName = user.username;
    req.session.userEmail = user.email;
    res.json({ success: true, userName: user.username, loyaltyPoints: user.loyaltyPoints });
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.get('/api/account/orders', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مسجل دخول' });
    const userOrders = await Order.find({ customerEmail: req.session.userEmail }).sort({ date: -1 });
    res.json({ success: true, data: userOrders });
});

app.get('/api/account/reorder/:orderId', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'يجب تسجيل الدخول' });
    const oldOrder = await Order.findOne({ orderId: req.params.orderId });
    if (!oldOrder) return res.status(404).json({ error: 'الطلب غير موجود' });
    const cartItems = oldOrder.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        variantId: item.variantId
    }));
    res.json({ success: true, cartItems });
});

app.get('/api/account/loyalty', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مسجل دخول' });
    const user = await User.findById(req.session.userId);
    res.json({ success: true, points: user.loyaltyPoints });
});

// ========== Edit Profile ==========
app.put('/api/account/profile', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مسجل' });
    const { username, email } = req.body;
    const user = await User.findById(req.session.userId);
    if (!user) return res.status(404).json({ error: 'المستخدم غير موجود' });
    if (email && email !== user.email) {
        const existing = await User.findOne({ email });
        if (existing) return res.status(400).json({ error: 'البريد مستخدم بالفعل' });
        user.email = email;
        req.session.userEmail = email;
    }
    if (username) user.username = username;
    await user.save();
    req.session.userName = user.username;
    res.json({ success: true });
});

// ========== Forgot / Reset Password ==========
app.post('/api/forgot-password', async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ error: 'البريد غير موجود' });
    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();
    const resetLink = `https://my-shop-final.onrender.com/reset-password.html?token=${token}`;
    await sendEmail(email, 'إعادة تعيين كلمة المرور', `<p>اضغط على الرابط: <a href="${resetLink}">${resetLink}</a></p>`);
    res.json({ success: true });
});

app.post('/api/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    const user = await User.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });
    if (!user) return res.status(400).json({ error: 'الرابط غير صالح أو منتهي' });
    user.passwordHash = bcrypt.hashSync(newPassword, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();
    res.json({ success: true });
});

// ========== Sync Cart with Server ==========
app.post('/api/cart/sync', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مسجل' });
    const { cart } = req.body;
    await User.findByIdAndUpdate(req.session.userId, { cart: cart || [] });
    res.json({ success: true });
});

app.get('/api/cart/sync', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'غير مسجل' });
    const user = await User.findById(req.session.userId);
    res.json({ cart: user.cart || [] });
});

// ========== Wishlist ==========
app.get('/api/wishlist', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'تسجيل دخول مطلوب' });
    const wishlist = await Wishlist.find({ userId: req.session.userId });
    res.json({ success: true, data: wishlist });
});
app.post('/api/wishlist', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'تسجيل دخول مطلوب' });
    const { productId } = req.body;
    const exists = await Wishlist.findOne({ userId: req.session.userId, productId });
    if (exists) return res.json({ success: true, message: 'موجود مسبقاً' });
    await new Wishlist({ userId: req.session.userId, productId }).save();
    res.json({ success: true });
});
app.delete('/api/wishlist/:productId', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'تسجيل دخول مطلوب' });
    await Wishlist.deleteOne({ userId: req.session.userId, productId: req.params.productId });
    res.json({ success: true });
});

// ========== Advanced Reports (Excel) ==========
app.get('/api/admin/reports/sales', isAdmin, async (req, res) => {
    const orders = await Order.find().sort({ date: -1 });
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('تقرير المبيعات');
    sheet.columns = [
        { header: 'رقم الطلب', key: 'orderId', width: 20 },
        { header: 'العميل', key: 'customerName', width: 20 },
        { header: 'الإجمالي', key: 'total', width: 15 },
        { header: 'الحالة', key: 'status', width: 15 },
        { header: 'التاريخ', key: 'date', width: 20 }
    ];
    orders.forEach(order => {
        sheet.addRow({
            orderId: order.orderId,
            customerName: order.customerName,
            total: order.total,
            status: order.status,
            date: order.date.toISOString().split('T')[0]
        });
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
    await workbook.xlsx.write(res);
    res.end();
});

// ========== Health Check ==========
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', uptime: process.uptime(), mongo: mongoose.connection.readyState === 1 });
});

// ========== PDF Invoice ==========
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

// ========== Archive Old Orders ==========
app.post('/api/admin/archive-orders', isAdmin, async (req, res) => {
    try {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        const oldOrders = await Order.find({ date: { $lt: oneYearAgo } });
        if (oldOrders.length) {
            await OrderArchive.insertMany(oldOrders.map(o => o.toObject()));
            await Order.deleteMany({ date: { $lt: oneYearAgo } });
            res.json({ success: true, archivedCount: oldOrders.length });
        } else {
            res.json({ success: true, archivedCount: 0 });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ========== Offers Management ==========
app.get('/api/admin/offers', isAdmin, async (req, res) => {
    const offers = await Offer.find();
    res.json({ success: true, data: offers });
});
app.post('/api/admin/offers', isAdmin, async (req, res) => {
    const { name, type, target, discountPercent, startDate, endDate, active } = req.body;
    const newOffer = new Offer({ name, type, target, discountPercent: parseFloat(discountPercent), startDate, endDate, active: active !== false });
    await newOffer.save();
    res.json({ success: true, data: newOffer });
});
app.put('/api/admin/offers/:id', isAdmin, async (req, res) => {
    const offer = await Offer.findOne({ id: req.params.id });
    if (!offer) return res.status(404).json({ error: 'العرض غير موجود' });
    Object.assign(offer, req.body);
    await offer.save();
    res.json({ success: true, data: offer });
});
app.delete('/api/admin/offers/:id', isAdmin, async (req, res) => {
    await Offer.deleteOne({ id: req.params.id });
    res.json({ success: true });
});

// ========== Migration from JSON ==========
app.post('/api/admin/migrate-from-json', isAdmin, async (req, res) => {
    const dataDir = path.join(__dirname, 'data');
    try {
        const productsJson = JSON.parse(fs.readFileSync(path.join(dataDir, 'products.json'), 'utf8'));
        for (const p of productsJson) {
            if (!await Product.findOne({ id: p.id })) await Product.create(p);
        }
        const ordersJson = JSON.parse(fs.readFileSync(path.join(dataDir, 'orders.json'), 'utf8'));
        for (const o of ordersJson) {
            if (!await Order.findOne({ orderId: o.orderId })) await Order.create(o);
        }
        res.json({ success: true, message: 'Migration completed' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ========== Scheduled Backup (cron daily at 3 AM) ==========
cron.schedule('0 3 * * *', () => {
    console.log('🔄 Running scheduled backup...');
    const { exec } = require('child_process');
    const backupScript = path.join(__dirname, 'backup.js');
    exec(`node ${backupScript}`, (error, stdout, stderr) => {
        if (error) console.error(`Backup cron error: ${error.message}`);
        else console.log(`Backup completed: ${stdout}`);
    });
});

// ========== Global Error Handler ==========
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'حدث خطأ داخلي في الخادم' });
});

// ========== Confirm env variable at startup ==========
console.log('🔐 RESEND_API_KEY loaded?', process.env.RESEND_API_KEY ? '✅ Yes' : '❌ No');

// ========== Start Server (with Socket.io) ==========
serverSocket.listen(PORT, () => {
    console.log(`\n🚀 متجر Absi stor يعمل على http://localhost:${PORT}`);
    console.log(`📱 المتجر: http://localhost:${PORT}/shop.html`);
    console.log(`🔐 لوحة التحكم: http://localhost:${PORT}/login.html`);
    console.log(`📞 واتساب المدير: +218915727716`);
    console.log(`🔑 بيانات الدخول للمدير: admin / admin123\n`);
});