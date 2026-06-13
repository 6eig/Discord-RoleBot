const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const GuildConfig = require('../../models/GuildConfig');
const { logAction } = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Revoke a role from a member')
        .addUserOption(option => option.setName('user').setDescription('The member').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason').setRequired(false)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const targetUser = interaction.options.getMember('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const executorRoles = interaction.member.roles.cache;
        
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        if (!config || !config.isActivated) return interaction.editReply('❌ System inactive.');

        // --- القفل ---
        if (new Date() > config.expireDate) {
            return interaction.editReply('🚫 **Service Suspended:** Subscription expired. Contact the owner to renew.');
        }
        // ------------

        const validRules = config.permissions.filter(perm => executorRoles.has(perm.adminRoleId));
        if (validRules.length === 0) return interaction.editReply('❌ Access Denied.');

        let options = [];
        validRules.forEach((rule) => {
            rule.allowedRoles.forEach(roleId => {
                const role = interaction.guild.roles.cache.get(roleId);
                if (role && targetUser.roles.cache.has(roleId)) {
                    options.push({ label: `Revoke: ${role.name}`, value: roleId, emoji: '🔴' });
                }
            });
        });

        if (options.length === 0) return interaction.editReply('⚠️ No roles to remove.');

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('remove_menu_select').setPlaceholder('🔻 Select Role').addOptions(options.slice(0, 25))
        );
        const embed = new EmbedBuilder().setTitle('🗑️ Revoke Role').setDescription(`Target: ${targetUser}\nReason: **${reason}**`).setColor('Red');
        const msg = await interaction.editReply({ embeds: [embed], components: [row] });

        const filter = i => i.customId === 'remove_menu_select' && i.user.id === interaction.user.id;
        const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async i => {
            const roleIdToRemove = i.values[0];
            const roleObj = interaction.guild.roles.cache.get(roleIdToRemove);
            try {
                await targetUser.roles.remove(roleIdToRemove);
                await logAction(interaction.client, interaction.guild.id, 'REMOVE', interaction.user, targetUser, roleObj, `Reason: ${reason}`);
                await i.update({ content: `✅ **Revoked!**`, embeds: [], components: [] });
            } catch (err) { await i.update({ content: '❌ Error.', embeds: [], components: [] }); }
        });
    },
};