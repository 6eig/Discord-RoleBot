const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const License = require('../../models/License');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('list_keys')
        .setDescription('List the most recent 20 license keys'),

    async execute(interaction) {
        const keys = await License.find({}).limit(20).sort({ createdAt: -1 });

        if (keys.length === 0) {
            return interaction.reply({ content: '❌ No keys found.', ephemeral: true });
        }

        const fields = await Promise.all(keys.map(async (k, index) => {
            let status = '🟢 **Available**';
            let usedBy = '';

            // تنسيق العرض للمدة
            let durationDisplay = `${k.durationDays} Days`;
            if (k.durationDays >= 36500) {
                durationDisplay = '♾️ **Lifetime**';
            }

            if (k.isUsed) {
                status = '🔴 **Used**';
                if (k.usedByGuildId) {
                    const guild = interaction.client.guilds.cache.get(k.usedByGuildId);
                    const guildName = guild ? guild.name : `ID: ${k.usedByGuildId}`;
                    usedBy = `\n🏢 **Server:** ${guildName}`;
                }
            }

            return {
                name: `#${index + 1} | Key: ${k.key}`,
                value: `📅 **Duration:** ${durationDisplay}\n${status}${usedBy}`,
                inline: false
            };
        }));

        const embed = new EmbedBuilder()
            .setTitle('🔑 License Keys History')
            .setColor('Gold')
            .addFields(fields)
            .setFooter({ text: 'Developer Control Panel' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    },
};