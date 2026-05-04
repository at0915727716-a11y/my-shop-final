const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Wishlist = require('../models/Wishlist');
const User = require('../models/User');

// Middleware افتراضي للتحقق من تسجيل الدخول – يمكنك استبداله بآليتك
const isAuthenticated = (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'غير مصرح' });
    next();
};

router.get('/my-orders', isAuthenticated, async(req, res) => {
    const orders = await Order.find({ customerEmail: req.user.email }).sort({ date: -1 });
    res.json(orders);
});

router.get('/wishlist', isAuthenticated, async(req, res) => {
    const wishlist = await Wishlist.find({ userId: req.user._id }).populate('productId');
    res.json(wishlist);
});

router.get('/profile', isAuthenticated, async(req, res) => {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
});

module.exports = router;