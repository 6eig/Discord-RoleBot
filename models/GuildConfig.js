const mongoose = require('mongoose');

const guildConfigSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    isActivated: { type: Boolean, default: false },
    licenseKey: { type: String, default: null },
    expireDate: { type: Date, default: null },

    channels: {
        categoryId: { type: String, default: null },
        panelChannelId: { type: String, default: null },
        panelMessageId: { type: String, default: null },
        commandsChannelId: { type: String, default: null },
        requestsChannelId: { type: String, default: null },
        logsChannelId: { type: String, default: null },
    },

    permissions: [{
        adminRoleId: { type: String, required: true },
        allowedRoles: [{ type: String }],
        requireApproval: { type: Boolean, default: false }
    }],

    // --- التعديل الجوهري: فصل الصلاحيات ---
    managers: {
        // 1. مدراء كاملين (يعدلون القوانين + يقبلون الطلبات)
        fullAdmins: [{ type: String }], 
        // 2. موظفين قبول فقط (يقبلون الطلبات فقط)
        requestResponders: [{ type: String }] 
    },
    // --------------------------------------

    notificationState: {
        warningSent: { type: Boolean, default: false },
        expiredSent: { type: Boolean, default: false }
    }
});

module.exports = mongoose.model('GuildConfig', guildConfigSchema);