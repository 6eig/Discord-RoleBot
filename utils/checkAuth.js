/**
 * التحقق من الصلاحيات
 * @param {string} level - مستوى الصلاحية المطلوب ('dashboard' أو 'requests')
 */
function isAuthorized(interaction, config, level = 'dashboard') {
    // 1. الأونر دائماً معه كل الصلاحيات
    if (interaction.user.id === interaction.guild.ownerId) return true;

    const memberRoles = interaction.member.roles.cache;
    const fullAdmins = config.managers?.fullAdmins || [];
    const requestResponders = config.managers?.requestResponders || [];

    // دالة مساعدة: هل المستخدم أو رتبته موجود في القائمة؟
    const hasAccess = (list) => {
        return list.includes(interaction.user.id) || 
               list.some(id => memberRoles.has(id));
    };

    // 2. إذا كان المطلوب صلاحية "لوحة التحكم" (إضافة قوانين)
    // يجب أن يكون في قائمة fullAdmins حصراً
    if (level === 'dashboard') {
        return hasAccess(fullAdmins);
    }

    // 3. إذا كان المطلوب صلاحية "الطلبات" (قبول/رفض)
    // مسموح لـ fullAdmins OR requestResponders
    if (level === 'requests') {
        return hasAccess(fullAdmins) || hasAccess(requestResponders);
    }

    return false;
}

module.exports = { isAuthorized };