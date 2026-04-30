const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const userSchema = new mongoose.Schema({
    id: { type: String, default: () => uuidv4(), unique: true },
    username: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },

    // نقاط الولاء
    loyaltyPoints: { type: Number, default: 0, min: 0 },

    // تسجيل الدخول عبر مزود خارجي
    provider: { type: String, default: 'local' },
    providerId: { type: String, default: null },

    // ========== إضافات جديدة ==========
    // مزامنة السلة مع الخادم
    cart: { type: Array, default: [] }, // يخزن مصفوفة عناصر السلة { productId, name, price, quantity, variantId }

    // إعادة تعيين كلمة المرور
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    // التحقق من البريد الإلكتروني
    verificationToken: { type: String, default: null },
    verified: { type: Boolean, default: false }
});

// الفهارس (مع الحفاظ على الموجود)
userSchema.index({ provider: 1, providerId: 1 });

module.exports = mongoose.model('User', userSchema);