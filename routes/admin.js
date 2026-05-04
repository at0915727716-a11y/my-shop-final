const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Order = require('../models/Order');

// ميدلوير خاص للتحقق من super_admin (سيُستخدم لاحقاً)
const requireSuperAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'super_admin') return res.status(403).json({ error: 'غير مسموح' });
    next();
};

// إنشاء أدمن جديد
router.post('/create-admin', requireSuperAdmin, async(req, res) => {
    try {
        const { name, email, password } = req.body;
        const hashed = await bcrypt.hash(password, 10);
        const admin = new User({ name, email, password: hashed, role: 'admin', createdBy: req.user._id });
        await admin.save();
        res.json({ message: 'تم إنشاء الأدمن', adminId: admin._id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// تحديث أدمن (الاسم أو كلمة المرور)
router.put('/update-admin/:id', requireSuperAdmin, async(req, res) => {
    try {
        const { name, newPassword } = req.body;
        const update = { name };
        if (newPassword) update.password = await bcrypt.hash(newPassword, 10);
        await User.findByIdAndUpdate(req.params.id, update);
        res.json({ message: 'تم التحديث' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// إحصائيات جميع الأدمن (للسوبر أدمن)
router.get('/admins-stats', requireSuperAdmin, async(req, res) => {
    try {
        const admins = await User.find({ role: 'admin' }).select('-password');
        const stats = await Promise.all(admins.map(async(admin) => {
            const orders = await Order.find({ handledBy: admin._id, status: 'delivered' });
            const totalSales = orders.reduce((sum, o) => sum + o.total, 0);
            return {
                id: admin._id,
                name: admin.name,
                email: admin.email,
                ordersCount: orders.length,
                totalSales,
                lastLogin: admin.lastLogin
            };
        }));
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// تغيير كلمة مرور المدير نفسه (يتطلب التحقق من القديمة)
router.put('/change-password', async(req, res) => {
    if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) return res.status(401).json({ error: 'غير مصرح' });
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);
    if (!await bcrypt.compare(currentPassword, user.password)) return res.status(401).json({ error: 'كلمة المرور الحالية غير صحيحة' });
    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: 'تم تغيير كلمة المرور' });
});

module.exports = router;