// backup.js - يقوم بعمل نسخة احتياطية لقاعدة البيانات
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// تأكد من وجود مجلد backups
const BACKUP_DIR = path.join(__dirname, 'backups');
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// الحصول على رابط MongoDB من متغيرات البيئة
const DB_URI = process.env.MONGODB_URI;
if (!DB_URI) {
    console.error('❌ MONGODB_URI not defined in .env');
    process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.gz`);

// استخدام mongodump (يتطلب تثبيت mongodb-tools)
const cmd = `mongodump --uri="${DB_URI}" --archive="${backupFile}" --gzip`;

console.log(`🔄 Starting backup at ${new Date().toISOString()}`);
exec(cmd, (error, stdout, stderr) => {
    if (error) {
        console.error(`❌ Backup error: ${error.message}`);
        return;
    }
    if (stderr) console.error(`⚠️ stderr: ${stderr}`);
    console.log(`✅ Backup created: ${backupFile}`);

    // حذف النسخ الأقدم من 30 يوماً (اختياري)
    const files = fs.readdirSync(BACKUP_DIR);
    const now = Date.now();
    files.forEach(file => {
        const filePath = path.join(BACKUP_DIR, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > 30 * 24 * 60 * 60 * 1000) {
            fs.unlinkSync(filePath);
            console.log(`🗑️ Deleted old backup: ${file}`);
        }
    });
});