module.exports = {
    apps: [{
        name: 'absi-stor',
        script: 'server.js',
        watch: false,
        instances: 1,
        exec_mode: 'fork',
        max_memory_restart: '512M',
        min_uptime: '10s',
        max_restarts: 10,
        restart_delay: 4000,
        autorestart: true,
        kill_timeout: 3000,
        listen_timeout: 3000,
        env: { NODE_ENV: 'production', PORT: 3000 },
        error_file: './logs/pm2-error.log',
        out_file: './logs/pm2-out.log',
        log_file: './logs/combined.log',
        time: true,
        merge_logs: true,
        cron_restart: '0 3 * * *',
        node_args: ['--max-old-space-size=512', '--optimize-for-size']
    }]
};