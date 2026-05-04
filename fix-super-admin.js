require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function fix() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ متصل بقاعدة البيانات');

        // البحث عن super_admin موجود
        let superAdmin = await User.findOne({ role: 'super_admin' });
        
        if (superAdmin) {
            console.log('🔍 super_admin موجود بالفعل:');
            console.log(`   username: ${superAdmin.username}`);
            console.log(`   email: ${superAdmin.email}`);
            console.log(`   role: ${superAdmin.role}`);
            // إعادة تعيين كلمة المرور للتأكد
            superAdmin.passwordHash = bcrypt.hashSync('admin123', 10);
            await superAdmin.save();
            console.log('✅ تم إعادة تعيين كلمة المرور إلى admin123');
        } else {
            // إنشاء حساب جديد
            const hashed = bcrypt.hashSync('admin123', 10);
            superAdmin = new User({
                username: 'superadmin',
                email: 'superadmin@absistor.com',
                passwordHash: hashed,
                role: 'super_admin',
                verified: true,
                createdAt: new Date()
            });
            await superAdmin.save();
            console.log('✅ تم إنشاء حساب super_admin جديد');
            console.log('   البريد: superadmin@absistor.com');
            console.log('   كلمة المرور: admin123');
        }

        console.log('\n🔑 يمكنك الآن تسجيل الدخول إلى لوحة التحكم باستخدام:');
        console.log('   البريد: superadmin@absistor.com');
        console.log('   كلمة المرور: admin123');
        
        process.exit(0);
    } catch (err) {
        console.error('❌ خطأ:', err);
        process.exit(1);
    }
}

fix();