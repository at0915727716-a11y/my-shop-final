self.addEventListener('install', event => {
    console.log('Service Worker installed');
    self.skipWaiting(); // تفعيل الـ SW فوراً بعد التحديث
});

self.addEventListener('fetch', event => {
    event.respondWith(fetch(event.request));
});

// استقبال الإشعارات من الخادم
self.addEventListener('push', event => {
    let data = {};
    try {
        data = event.data.json();
    } catch (e) {
        data = {
            title: 'إشعار جديد',
            body: event.data ? event.data.text() : 'لديك إشعار جديد',
            url: '/'
        };
    }
    const options = {
        body: data.body || 'لديك إشعار جديد',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: {
            url: data.url || '/'
        },
        vibrate: [200, 100, 200]
    };
    event.waitUntil(
        self.registration.showNotification(data.title || 'Absi Store', options)
    );
});

// التعامل مع النقر على الإشعار
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || '/';
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            for (let client of windowClients) {
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});