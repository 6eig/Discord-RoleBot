const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function generatePanel(guildConfig) {
    const rulesCount = guildConfig.permissions ? guildConfig.permissions.length : 0;
    
    // إحصائيات المدراء للعرض
    const fullAdminCount = guildConfig.managers?.fullAdmins?.length || 0;
    const reqResponderCount = guildConfig.managers?.requestResponders?.length || 0;

    let expireDisplay = 'Unknown';
    if (guildConfig.expireDate) {
        const now = new Date();
        const expire = new Date(guildConfig.expireDate);
        const diffDays = Math.ceil((expire - now) / (1000 * 60 * 60 * 24));
        if (diffDays > 20000) {
            expireDisplay = '♾️ **Lifetime License**';
        } else {
            expireDisplay = `<t:${Math.floor(expire.getTime() / 1000)}:R>`;
        }
    }

    const embed = new EmbedBuilder()
        .setTitle('🎛️ Role Manager Dashboard')
        .setDescription(`**System Status:** 🟢 Online & Active\n\nManage your server roles and staff permissions below.`)
        .addFields(
            { name: '📊 Rules', value: `${rulesCount} Active`, inline: true },
            { name: '👥 Staff', value: `${fullAdminCount} Admins | ${reqResponderCount} Helpers`, inline: true },
            { name: '📅 Expires', value: expireDisplay, inline: true }
        )
        .setColor('#2b2d31')
        .setImage('https://dummyimage.com/600x100/2b2d31/ffffff&text=Role+Manager+System')
        .setFooter({ text: 'Secure Role Management System' })
        .setTimestamp();

    // الصف الأول: إدارة القوانين
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_add_rule_start').setLabel('➕ New Rule').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_manage_rules').setLabel('📂 Manage Rules').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_refresh_panel').setLabel('🔄 Refresh').setStyle(ButtonStyle.Secondary)
    );

    // الصف الثاني: إدارة الفريق (زر جديد)
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_manage_team_access') // <--- الزر الجديد
            .setLabel('👥 Manage Team Access')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🔐')
    );

    return { embeds: [embed], components: [row1, row2] };
}

module.exports = { generatePanel };