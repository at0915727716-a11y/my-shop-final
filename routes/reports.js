const express = require('express');
const router = express.Router();
const Order = require('../models/Order');

// Middleware للتحقق من صلاحيات المشرف سيُضاف لاحقاً
router.get('/sales-by-location', async(req, res) => {
    try {
        const { groupBy = 'city', fromDate, toDate } = req.query;
        let match = {};
        if (fromDate || toDate) {
            match.date = {};
            if (fromDate) match.date.$gte = new Date(fromDate);
            if (toDate) match.date.$lte = new Date(toDate);
        }
        const groupField = groupBy === 'country' ? 'shippingAddress.country' : 'shippingAddress.city';
        const result = await Order.aggregate([
            { $match: match },
            { $group: { _id: `$${groupField}`, totalSales: { $sum: '$total' }, ordersCount: { $sum: 1 } } },
            { $sort: { totalSales: -1 } }
        ]);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;