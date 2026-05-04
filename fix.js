require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({ username: String, email: String, passwordHash: String, role: String, verified: Boolean });
const User = mongoose.model('User', UserSchema);

async function fix() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        // تحديث حساب admin الموجود
        await User.updateOne({ username: "admin" }, { $set: { role: "super_admin", verified: true } });
        // إنشاء حساب جديد super_admin إذا لم يوجد
        const exists = await User.findOne({ email: "super@absistor.com" });
        if (!exists) {
            const hashed = bcrypt.hashSync("admin123", 10);
            await User.create({ username: "super", email: "super@absistor.com", passwordHash: hashed, role: "super_admin", verified: true });
            console.log("✅ تم إنشاء حساب super@absistor.com / admin123");
        }
        console.log("✅ تم إصلاح الصلاحيات");
        process.exit();
    } catch(err) { console.error(err); process.exit(1); }
}
fix();