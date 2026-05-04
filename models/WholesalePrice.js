const mongoose = require('mongoose');

const wholesalePriceSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true,
        index: true
    },
    variantId: { type: String, default: null }, // null = السعر الأساسي للمنتج
    minQuantity: { type: Number, required: true, default: 1 },
    price: { type: Number, required: true }, // سعر الوحدة
    userType: { type: String, enum: ['wholesale', 'retail'], default: 'wholesale' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('WholesalePrice', wholesalePriceSchema);