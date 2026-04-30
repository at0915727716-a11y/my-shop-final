@echo off
chcp 65001 >nul
title مدير متجر Absi stor
color 0A

:menu
cls
echo ╔══════════════════════════════════════════════════════════╗
echo ║            مدير متجر Absi stor الاحترافي                 ║
echo ╠══════════════════════════════════════════════════════════╣
echo ║                                                          ║
echo ║   [1] ▶ تشغيل السيرفر                                    ║
echo ║   [2] ■ إيقاف السيرفر                                    ║
echo ║   [3] ⟳ إعادة تشغيل السيرفر                              ║
echo ║   [4] 📊 عرض الحالة والأداء                              ║
echo ║   [5] 📜 مشاهدة السجلات (logs)                           ║
echo ║   [6] 💾 نسخ احتياطي فوري                               ║
echo ║   [7] 🌐 فتح المتجر في المتصفح                          ║
echo ║   [8] 🔐 الدخول إلى لوحة التحكم                         ║
echo ║   [9] 🩹 إصلاح المشاكل الشائعة                          ║
echo ║   [0] 🚪 خروج                                            ║
echo ║                                                          ║
echo ╚══════════════════════════════════════════════════════════╝
echo.
set /p choice="اختر رقم (0-9): "

if "%choice%"=="1" ( pm2 start ecosystem.config.js & echo ✅ تم تشغيل السيرفر & timeout /t 2 & goto menu )
if "%choice%"=="2" ( pm2 stop absi-stor & echo ⏹️ تم إيقاف السيرفر & timeout /t 2 & goto menu )
if "%choice%"=="3" ( pm2 restart absi-stor & echo ⟳ تم إعادة تشغيل السيرفر & timeout /t 2 & goto menu )
if "%choice%"=="4" ( cls & pm2 status & echo. & echo ──────────────────────────────────────────────────────── & echo. & pm2 monit & goto menu )
if "%choice%"=="5" ( cls & echo آخر 50 سطر من السجلات: & echo ════════════════════════════════════════════════════════ & pm2 logs absi-stor --lines 50 & echo. & pause & goto menu )
if "%choice%"=="6" ( node backup-auto.js & echo ✅ تم النسخ الاحتياطي & timeout /t 2 & goto menu )
if "%choice%"=="7" start http://localhost:3000/shop.html & goto menu
if "%choice%"=="8" start http://localhost:3000/login.html & goto menu
if "%choice%"=="9" ( echo 🔧 إصلاح المشاكل... & npm install & pm2 delete absi-stor & pm2 start ecosystem.config.js & pm2 save & echo ✅ تم الإصلاح & timeout /t 3 & goto menu )
if "%choice%"=="0" exit
goto menu