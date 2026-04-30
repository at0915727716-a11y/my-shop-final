const mongoose = require('mongoose');

// إعادة استخدام مخطط Order مع إضافة حقل archivedAt
const orderItemSchema = new mongoose.Schema({
    productId: String,
    name: String,
    quantity: Number,
    price: Number,
    variantId: String
});

const orderArchiveSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    customerName: String,
    customerPhone: String,
    customerAddress: String,
    customerEmail: String,
    items: [orderItemSchema],
    total: Number,
    status: String,
    date: Date,
    paypalOrderId: String,
    shippingMethod: String,
    shippingCost: Number,
    pointsRedeemed: Number,
    pointsDiscount: Number,
    pointsEarned: Number,
    notes: String,
    couponCode: String,
    discountAmount: Number,
    archivedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('OrderArchive', orderArchiveSchema);