const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    productId: String,
    name: String,
    quantity: Number,
    price: Number
});

const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    customerAddress: { type: String, required: true },
    customerEmail: { type: String, default: null },
    items: [orderItemSchema],
    total: { type: Number, required: true },
    status: { type: String, default: 'قيد المراجعة' },
    date: { type: Date, default: Date.now },
    paypalOrderId: { type: String, default: null }
});

module.exports = mongoose.model('Order', orderSchema);