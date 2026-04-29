const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
    productId: { type: String, required: true },
    productName: { type: String, required: true },
    remainingStock: { type: Number, required: true },
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Alert', alertSchema);