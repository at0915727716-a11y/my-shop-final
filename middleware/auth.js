const requireRole = (role) => {
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'غير مسجل دخول' });
        if (req.user.role !== role && req.user.role !== 'super_admin') {
            return res.status(403).json({ error: 'ليس لديك صلاحية' });
        }
        next();
    };
};

const isAdmin = (req, res, next) => {
    if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'super_admin')) {
        return res.status(403).json({ error: 'يتطلب صلاحية مدير' });
    }
    next();
};

module.exports = { requireRole, isAdmin };