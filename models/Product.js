const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const productSchema = new mongoose.Schema({
    id: { type: String, default: () => uuidv4(), unique: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true, default: 0 },
    description: { type: String, default: '' },
    category: { type: String, default: 'عام' },
    discountPercent: { type: Number, default: 0 },
    imageUrl: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Product', productSchema);