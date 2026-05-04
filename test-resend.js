const { Resend } = require('resend');
const resend = new Resend('re_TR5zp373_DoJ8o3yuike947h4hVetpFgM');

async function test() {
    const { data, error } = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: 'at0915727716@gmail.com', // ضع بريدك هنا
        subject: 'اختبار من Resend',
        html: '<strong>هذا بريد تجريبي</strong>'
    });
    if (error) {
        console.error('❌ فشل الإرسال:', error);
    } else {
        console.log('✅ تم الإرسال بنجاح:', data);
    }
}
test();