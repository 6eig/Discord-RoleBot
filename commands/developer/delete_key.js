const { SlashCommandBuilder } = require('discord.js');
const License = require('../../models/License');
const GuildConfig = require('../../models/GuildConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('delete_key')
        .setDescription('Delete a license key (WARNING: If active, this will wipe bot data from the server)')
        .addStringOption(option =>
            option.setName('key')
                .setDescription('The license key to delete')
                .setRequired(true)),

    async execute(interaction) {
        // تأجيل الرد لأن العملية قد تأخذ ثواني لحذف القنوات
        await interaction.deferReply({ ephemeral: true });

        const keyToDelete = interaction.options.getString('key');
        
        // 1. البحث عن الكود
        const license = await License.findOne({ key: keyToDelete });

        if (!license) {
            return interaction.editReply({ content: `❌ Key \`${keyToDelete}\` not found.` });
        }

        let cleanupMsg = '';

        // 2. إذا كان الكود مستخدماً، نبدأ عملية التنظيف (SaaS Cleanup)
        if (license.isUsed && license.usedByGuildId) {
            try {
                // جلب إعدادات السيرفر
                const guildConfig = await GuildConfig.findOne({ guildId: license.usedByGuildId });
                
                if (guildConfig) {
                    // محاولة الوصول للسيرفر
                    const guild = interaction.client.guilds.cache.get(license.usedByGuildId);
                    
                    if (guild) {
                        cleanupMsg += '\n🗑️ **Cleaning up server channels...**';
                        
                        // قائمة القنوات للحذف
                        const channelsToDelete = [
                            guildConfig.channels.logsChannelId,
                            guildConfig.channels.requestsChannelId,
                            guildConfig.channels.commandsChannelId,
                            guildConfig.channels.panelChannelId,
                            guildConfig.channels.categoryId // نحذف الكاتيجوري أخيراً
                        ];

                        // الحذف الفعلي للقنوات
                        for (const channelId of channelsToDelete) {
                            if (channelId) {
                                try {
                                    const channel = guild.channels.cache.get(channelId);
                                    if (channel) await channel.delete();
                                } catch (err) {
                                    console.log(`Could not delete channel ${channelId}: ${err.message}`);
                                }
                            }
                        }
                    } else {
                        cleanupMsg += '\n⚠️ **Note:** Bot is not in the server anymore, skipping channel deletion.';
                    }

                    // حذف إعدادات السيرفر من قاعدة البيانات (إلغاء التفعيل)
                    await GuildConfig.deleteOne({ guildId: license.usedByGuildId });
                    cleanupMsg += '\n✅ **Server Deactivated.**';
                }
            } catch (error) {
                console.error('Error during cleanup:', error);
                cleanupMsg += '\n⚠️ **Error during cleanup** (Check console).';
            }
        }

        // 3. حذف الكود نهائياً
        await License.deleteOne({ _id: license._id });

        // 4. الرد النهائي
        await interaction.editReply({ 
            content: `✅ **License Deleted Successfully.**\n\`${keyToDelete}\`\n${cleanupMsg}` 
        });
    },
};