const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const couponSchema = new mongoose.Schema({
    id: { type: String, default: () => uuidv4(), unique: true },
    code: { type: String, required: true, unique: true },
    type: { type: String, enum: ['percentage', 'fixed'], required: true },
    value: { type: Number, required: true },
    expiryDate: { type: Date, required: true },
    usageLimit: { type: Number, default: 1 },
    usedCount: { type: Number, default: 0 },
    minCartAmount: { type: Number, default: 0 },
    productId: { type: String, default: null },
    newCustomerOnly: { type: Boolean, default: false }
});

module.exports = mongoose.model('Coupon', couponSchema);