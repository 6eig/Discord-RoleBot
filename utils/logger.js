const { EmbedBuilder } = require('discord.js');
const GuildConfig = require('../models/GuildConfig');

async function logAction(client, guildId, actionType, executor, target, role, details = '') {
    try {
        // 1. جلب إعدادات السيرفر لمعرفة قناة اللوج
        const config = await GuildConfig.findOne({ guildId: guildId });
        if (!config || !config.channels.logsChannelId) return;

        // 2. جلب القناة
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;
        
        const channel = guild.channels.cache.get(config.channels.logsChannelId);
        if (!channel) return;

        // 3. تحديد اللون والعنوان حسب نوع الفعل
        let color = 'Blue';
        let emoji = 'ℹ️';

        switch (actionType) {
            case 'ASSIGN':
                color = 'Green';
                emoji = '✅';
                break;
            case 'REMOVE':
                color = 'Red';
                emoji = '🗑️';
                break;
            case 'SWAP':
                color = 'Gold';
                emoji = '🔄';
                break;
            case 'APPROVE':
                color = 'Green';
                emoji = '🛡️';
                break;
            case 'DENY':
                color = 'Red';
                emoji = '🚫';
                break;
        }

        // 4. تصميم اللوج
        const embed = new EmbedBuilder()
            .setTitle(`${emoji} Log: ${actionType}`)
            .addFields(
                { name: '👮 Executor', value: `${executor} (\`${executor.id}\`)`, inline: true },
                { name: '👤 Target', value: `${target} (\`${target.id}\`)`, inline: true },
                { name: '🎭 Role', value: role ? `${role} (\`${role.id}\`)` : 'N/A', inline: true }
            )
            .setColor(color)
            .setTimestamp();

        if (details) {
            embed.addFields({ name: '📝 Details', value: details, inline: false });
        }

        await channel.send({ embeds: [embed] });

    } catch (error) {
        console.error('Logger Error:', error.message);
    }
}

module.exports = { logAction };