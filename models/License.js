const mongoose = require('mongoose');

const licenseSchema = new mongoose.Schema({
    // كود التفعيل (16 حرف ورقم)
    key: { type: String, required: true, unique: true },

    // مدة الاشتراك بالأيام (مثلاً 30 يوم)
    durationDays: { type: Number, default: 30 },

    // حالة الكود: هل تم استخدامه؟
    isUsed: { type: Boolean, default: false },

    // من السيرفر الذي استخدمه؟ (يتم ملؤها تلقائياً عند التفعيل)
    usedByGuildId: { type: String, default: null },

    // متى تم إنشاء الكود؟
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('License', licenseSchema);