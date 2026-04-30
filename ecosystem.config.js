module.exports = {
    apps: [{
        name: 'absi-stor',
        script: 'server.js',
        watch: ['server.js', 'models'], // مراقبة التغييرات في السيرفر والموديلات
        ignore_watch: ['node_modules', 'logs', 'backups', 'public/uploads'],
        watch_options: {
            followSymlinks: false,
            usePolling: true,
            interval: 1000
        },
        instances: 'max', // استخدام جميع أنوية المعالج (cluster mode)
        exec_mode: 'cluster', // تغيير من fork إلى cluster للأداء العالي
        max_memory_restart: '1G', // زيادة الذاكرة لتتناسب مع الميزات الجديدة
        min_uptime: '10s',
        max_restarts: 10,
        restart_delay: 4000,
        autorestart: true,
        kill_timeout: 5000, // زيادة المهلة قليلاً
        listen_timeout: 5000,
        env: {
            NODE_ENV: 'production',
            PORT: 3000,
            // إضافة المتغيرات الجديدة
            REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
            PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID || '',
            PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET || '',
            ADMIN_EMAIL: process.env.ADMIN_EMAIL || '',
            SESSION_SECRET: process.env.SESSION_SECRET || 'absi-production-secret-change-this'
        },
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        log_file: './logs/combined.log',
        time: true,
        merge_logs: true,
        cron_restart: '0 3 * * *', // إعادة التشغيل اليومية
        node_args: [
            '--max-old-space-size=1024', // زيادة الذاكرة
            '--optimize-for-size',
            '--experimental-worker' // دعم العمالة للتزامن
        ],
        // منع إعادة التشغيل غير الضرورية
        exp_backoff_restart_delay: 100,
        wait_ready: true, // انتظر إشارة ready من التطبيق
        shutdown_with_message: true
    }]
};