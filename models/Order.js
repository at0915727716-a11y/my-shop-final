const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    productId: { type: String, required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    variantId: { type: String, default: null }
});

const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    customerAddress: { type: String, required: true },
    customerEmail: { type: String, default: null },
    items: [orderItemSchema],
    total: { type: Number, required: true, min: 0 },
    status: { type: String, default: 'قيد المراجعة' },
    date: { type: Date, default: Date.now },
    paypalOrderId: { type: String, default: null },

    shippingMethod: { type: String, enum: ['standard', 'express', 'pickup'], default: 'standard' },
    shippingCost: { type: Number, default: 0, min: 0 },

    pointsRedeemed: { type: Number, default: 0, min: 0 },
    pointsDiscount: { type: Number, default: 0, min: 0 },
    pointsEarned: { type: Number, default: 0, min: 0 },

    notes: { type: String, default: '' },
    couponCode: { type: String, default: null },
    discountAmount: { type: Number, default: 0 }
}, {
    timestamps: true
});

// فقط هذا index (بدون orderId)
orderSchema.index({ customerEmail: 1, status: 1 });

module.exports = mongoose.model('Order', orderSchema);