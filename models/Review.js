const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const reviewSchema = new mongoose.Schema({
    id: { type: String, default: () => uuidv4(), unique: true },
    productId: { type: String, required: true, index: true },
    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, required: true },
    customerName: { type: String, default: 'زائر' },
    date: { type: Date, default: Date.now },

    // ========== ردود الإدارة (جديد) ==========
    adminReply: { type: String, default: null }, // نص رد المدير
    adminReplyDate: { type: Date, default: null } // تاريخ الرد
});

// إضافة فهرس لتحسين سرعة جلب التقييمات حسب المنتج
reviewSchema.index({ productId: 1, date: -1 });

module.exports = mongoose.model('Review', reviewSchema);