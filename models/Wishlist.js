const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const wishlistSchema = new mongoose.Schema({
    id: { type: String, default: () => uuidv4(), unique: true },
    userId: { type: String, required: true, index: true }, // معرف المستخدم (من نموذج User)
    productId: { type: String, required: true, index: true }, // معرف المنتج (من نموذج Product)
    addedAt: { type: Date, default: Date.now }
});

// منع تكرار إضافة نفس المنتج لنفس المستخدم
wishlistSchema.index({ userId: 1, productId: 1 }, { unique: true });

module.exports = mongoose.model('Wishlist', wishlistSchema);