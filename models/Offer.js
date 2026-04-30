const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const offerSchema = new mongoose.Schema({
    id: { type: String, default: () => uuidv4(), unique: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['category', 'product'], required: true },
    target: { type: String, required: true }, // اسم الفئة أو productId
    discountPercent: { type: Number, required: true, min: 0, max: 100 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Offer', offerSchema);