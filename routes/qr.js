const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');

router.get('/generate', async(req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });
    try {
        const qrBuffer = await QRCode.toBuffer(url, { type: 'png', margin: 1 });
        res.setHeader('Content-Type', 'image/png');
        res.send(qrBuffer);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;