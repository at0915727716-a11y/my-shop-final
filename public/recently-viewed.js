/**
 * Recently Viewed Products Manager
 * يدير تخزين وعرض المنتجات التي شاهدها المستخدم مؤخراً
 * يعتمد على localStorage لحفظ آخر 10 منتجات تمت زيارتها
 */

const RecentlyViewed = {
    // المفتاح المستخدم في localStorage
    STORAGE_KEY: 'absi_recent_products',

    // الحد الأقصى لعدد المنتجات المحفوظة
    MAX_ITEMS: 10,

    // إضافة منتج إلى قائمة المشاهدة الحديثة
    add: function(productId, productName, productPrice, productImage) {
        if (!productId) return;

        let recent = this.get();

        // إزالة المنتج إذا كان موجوداً مسبقاً (لنقله إلى البداية)
        recent = recent.filter(item => item.id !== productId);

        // إضافة المنتج الجديد في البداية
        recent.unshift({
            id: productId,
            name: productName || 'منتج',
            price: productPrice || 0,
            image: productImage || null,
            timestamp: Date.now()
        });

        // الحفاظ على الحد الأقصى للعدد
        if (recent.length > this.MAX_ITEMS) {
            recent = recent.slice(0, this.MAX_ITEMS);
        }

        // حفظ في localStorage
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(recent));

        // تحديث العرض إذا كانت الدالة موجودة
        if (typeof window.displayRecentProducts === 'function') {
            window.displayRecentProducts();
        }
    },

    // استرجاع قائمة المنتجات التي شوهدت مؤخراً
    get: function() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (!stored) return [];
        try {
            return JSON.parse(stored);
        } catch (e) {
            return [];
        }
    },

    // حذف منتج من القائمة
    remove: function(productId) {
        let recent = this.get();
        recent = recent.filter(item => item.id !== productId);
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(recent));
        if (typeof window.displayRecentProducts === 'function') {
            window.displayRecentProducts();
        }
    },

    // مسح جميع المنتجات الحديثة
    clear: function() {
        localStorage.removeItem(this.STORAGE_KEY);
        if (typeof window.displayRecentProducts === 'function') {
            window.displayRecentProducts();
        }
    },

    // عرض المنتجات الحديثة في حاوية محددة (يتم استدعاؤها من التطبيق)
    render: function(containerId, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const recent = this.get();

        if (recent.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';

        const title = options.title || '🕘 منتجات شاهدتها مؤخراً';
        const maxToShow = options.maxToShow || this.MAX_ITEMS;
        const itemsToShow = recent.slice(0, maxToShow);

        let html = `<div class="recent-section">
                        <div class="recent-title">${title}</div>
                        <div class="recent-grid">`;

        itemsToShow.forEach(product => {
            html += `
                <div class="recent-item" onclick="location.href='/product.html?id=${product.id}'">
                    <img src="${product.image || 'https://via.placeholder.com/80'}" onerror="this.src='https://via.placeholder.com/80'">
                    <div class="recent-item-name">${product.name}</div>
                    <div class="recent-item-price">${product.price} ريال</div>
                </div>
            `;
        });

        html += `</div></div>`;
        container.innerHTML = html;
    }
};

// دالة مساعدة لتسجيل مشاهدة منتج (يمكن استدعاؤها من product.html أو shop.html)
function trackProductView(productId, productName, productPrice, productImage) {
    RecentlyViewed.add(productId, productName, productPrice, productImage);
}

// دالة لعرض قسم المنتجات الحديثة (تستدعى عند تحميل الصفحة أو تحديث القائمة)
function displayRecentProducts(containerId = 'recentProductsContainer', options = {}) {
    RecentlyViewed.render(containerId, options);
}

// تصدير الدوال للاستخدام العالمي
window.RecentlyViewed = RecentlyViewed;
window.trackProductView = trackProductView;
window.displayRecentProducts = displayRecentProducts;