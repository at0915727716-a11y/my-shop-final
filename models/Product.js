const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

// مخطط المتغير (variants)
const variantSchema = new mongoose.Schema({
    id: { type: String, default: () => uuidv4() },
    name: { type: String, required: true }, // مثال: "أحمر - XL", "سعة 64GB"
    price: { type: Number, default: null }, // إذا كان null، يستخدم سعر المنتج الرئيسي
    stock: { type: Number, required: true, default: 0 }
});

const productSchema = new mongoose.Schema({
    id: { type: String, default: () => uuidv4(), unique: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true, default: 0 },
    description: { type: String, default: '' },
    category: { type: String, default: 'عام' },
    discountPercent: { type: Number, default: 0 },
    imageUrl: { type: String, default: null }, // الصورة الرئيسية
    createdAt: { type: Date, default: Date.now },

    // المتغيرات (اختياري)
    variants: [variantSchema],

    // ========== إضافة جديدة ==========
    // معرض صور إضافية (صور متعددة)
    gallery: { type: [String], default: [] } // مصفوفة من عناوين URL للصور الإضافية
});

// فهارس صحيحة بدون تكرار
productSchema.index({ name: 'text', category: 1 });

module.exports = mongoose.model('Product', productSchema);