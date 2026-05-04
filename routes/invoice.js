const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const fs = require('fs');
const path = require('path');

router.get('/:orderId/print', async(req, res) => {
    try {
        const order = await Order.findById(req.params.orderId);
        if (!order) return res.status(404).send('الطلب غير موجود');
        const templatePath = path.join(__dirname, '../public/invoice-template.html');
        let html = fs.readFileSync(templatePath, 'utf8');
        // استبدال البيانات
        html = html.replace('</body>', `<script>window.orderData = ${JSON.stringify(order)};</script></body>`);
        res.send(html);
    } catch (err) {
        res.status(500).send(err.message);
    }
});

module.exports = router;