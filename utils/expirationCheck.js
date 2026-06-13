const { EmbedBuilder } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');

async function checkExpirations(client) {
    // console.log('🔄 Checking subscriptions status...'); // (مخفي لتخفيف الزحمة)
    
    try {
        const activeGuilds = await GuildConfig.find({ isActivated: true });
        const now = new Date();

        for (const config of activeGuilds) {
            if (!config.expireDate) continue;

            // حساب الفرق بالأيام (الميلي ثانية -> أيام)
            const diffTime = config.expireDate - now;
            const diffDays = diffTime / (1000 * 60 * 60 * 24);

            const guild = client.guilds.cache.get(config.guildId);
            if (!guild) continue;
            
            const panelChannel = guild.channels.cache.get(config.channels.panelChannelId);

            // --- الحالة 1: تبقى 3 أيام أو أقل (ولم ينتهي بعد) ---
            if (diffDays <= 3 && diffDays > 0 && !config.notificationState.warningSent) {
                if (panelChannel) {
                    const embed = new EmbedBuilder()
                        .setTitle('⚠️ Subscription Expiring Soon')
                        .setDescription(`Your subscription will expire in **${Math.ceil(diffDays)} days**.\nPlease renew your license to avoid service interruption.`)
                        .setColor('Yellow')
                        .setTimestamp();
                    
                    await panelChannel.send({ content: `<@${guild.ownerId}>`, embeds: [embed] });
                }
                
                // تحديث الحالة لكي لا نرسل مرة أخرى
                config.notificationState.warningSent = true;
                await config.save();
                console.log(`⚠️ Sent warning to guild ${guild.id}`);
            }

            // --- الحالة 2: انتهى الوقت (Expired) ---
            else if (diffDays <= 0 && !config.notificationState.expiredSent) {
                if (panelChannel) {
                    const embed = new EmbedBuilder()
                        .setTitle('🚫 Subscription Expired')
                        .setDescription('**The bot service has been suspended.**\nYour channels and settings are safe, but commands and controls are disabled.\n\nTo restore access, please activate a new key using `/activate` or contact support.')
                        .setColor('Red')
                        .setTimestamp();
                    
                    await panelChannel.send({ content: `<@${guild.ownerId}>`, embeds: [embed] });
                }

                // نحدث الحالة فقط (ولا نحذف القنوات)
                config.notificationState.expiredSent = true;
                await config.save();
                console.log(`🚫 Service suspended for guild ${guild.id}`);
            }
        }
    } catch (error) {
        console.error('Error in expiration check:', error);
    }
}

module.exports = { checkExpirations };