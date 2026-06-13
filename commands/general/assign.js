const { SlashCommandBuilder, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const GuildConfig = require('../../models/GuildConfig');
const { logAction } = require('../../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('assign')
        .setDescription('Assign a role to a member (Supports Auto-Swap) - تعيين رتبة')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The member to assign a role to')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const targetUser = interaction.options.getMember('user');
        const executorRoles = interaction.member.roles.cache;
        
        // 1. جلب الإعدادات
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        if (!config || !config.isActivated) return interaction.editReply('❌ System inactive.');

        // 2. التحقق من صلاحية الأدمن (هل يملك رتبة مسؤولة؟)
        // ملاحظة: هنا نستخدم filter للعثور على القوانين التي يملك المستخدم رتبة الأدمن فيها
        const validRules = config.permissions.filter(perm => executorRoles.has(perm.adminRoleId));

        if (validRules.length === 0) return interaction.editReply('❌ You do not have permission to assign roles.');

        // 3. بناء القائمة
        let options = [];
        validRules.forEach((rule, ruleIndex) => { // ruleIndex هنا مهم جداً
            rule.allowedRoles.forEach(roleId => {
                const role = interaction.guild.roles.cache.get(roleId);
                // نعرض الرتبة إذا كانت موجودة + العضو لا يملكها
                if (role && !targetUser.roles.cache.has(roleId)) {
                    // نستخدم التنسيق: ruleIndex_roleId
                    // هذا يضمن أننا نعرف هل تتطلب موافقة أم لا لاحقاً
                    // نبحث عن الاندكس الاصلي في مصفوفة الصلاحيات الكاملة
                    const realIndex = config.permissions.indexOf(rule);
                    
                    options.push({
                        label: `Assign: ${role.name}`,
                        description: rule.requireApproval ? 'Requires Approval 🛡️' : 'Instant & Auto-Swap ⚡',
                        value: `${realIndex}_${roleId}`, 
                        emoji: rule.requireApproval ? '🛡️' : '⚡'
                    });
                }
            });
        });

        if (options.length === 0) return interaction.editReply('⚠️ No roles available (User might have them all or permissions issue).');

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('assign_menu_select')
                .setPlaceholder('🔻 Select a role to Assign')
                .addOptions(options.slice(0, 25))
        );

        const embed = new EmbedBuilder()
            .setTitle('👤 Assign Role')
            .setDescription(`Target: ${targetUser}\nSelect a role from the menu below.`)
            .setColor('Blue');

        const msg = await interaction.editReply({ embeds: [embed], components: [row] });

        // 4. استقبال الاختيار
        const filter = i => i.customId === 'assign_menu_select' && i.user.id === interaction.user.id;
        const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async i => {
            const [ruleIndexStr, selectedRoleId] = i.values[0].split('_');
            const ruleIndex = parseInt(ruleIndexStr);
            const rule = config.permissions[ruleIndex];
            const roleObj = interaction.guild.roles.cache.get(selectedRoleId);

            // تحديد الرتب القديمة للحذف (Swap)
            const rolesToRemove = [];
            rule.allowedRoles.forEach(rId => {
                if (targetUser.roles.cache.has(rId) && rId !== selectedRoleId) {
                    rolesToRemove.push(rId);
                }
            });

            // --- المسار أ: يحتاج موافقة ---
            if (rule.requireApproval) {
                const requestsChannel = interaction.guild.channels.cache.get(config.channels.requestsChannelId);
                if (!requestsChannel) return i.update({ content: '❌ Requests channel not found.', components: [] });

                // تنسيق الرسالة بدقة لكي يقرأها index.js
                const requestEmbed = new EmbedBuilder()
                    .setTitle('🛡️ Role Assignment Request')
                    .setDescription(`**Admin:** ${interaction.user}\n**Target:** ${targetUser}\n**New Role:** <@&${selectedRoleId}>\n**Roles to Remove (Swap):** ${rolesToRemove.length > 0 ? rolesToRemove.map(r=>`<@&${r}>`).join(', ') : 'None'}`)
                    .setColor('Gold')
                    .setTimestamp();

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`req_accept_${targetUser.id}_${selectedRoleId}_${rolesToRemove.join(',')}`).setLabel('Accept').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`req_deny_${targetUser.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger)
                );

                await requestsChannel.send({ embeds: [requestEmbed], components: [btnRow] });
                await i.update({ content: `⏳ **Request Sent!** Waiting for approval in <#${requestsChannel.id}>.`, embeds: [], components: [] });
            
            } 
            // --- المسار ب: فوري (Instant) ---
            else {
                try {
                    // 1. حذف القديم
                    if (rolesToRemove.length > 0) {
                        for (const oldRole of rolesToRemove) await targetUser.roles.remove(oldRole).catch(e => console.error(e));
                    }
                    // 2. إضافة الجديد
                    await targetUser.roles.add(selectedRoleId);
                    
                    const swapText = rolesToRemove.length > 0 ? `\n🔄 **Auto-Swapped:** Removed old role(s).` : '';
                    await i.update({ content: `✅ **Success:** Assigned <@&${selectedRoleId}> to ${targetUser}.${swapText}`, embeds: [], components: [] });

                    // تسجيل اللوج
                    const details = rolesToRemove.length > 0 ? `Swapped (Removed: ${rolesToRemove.map(r=>`<@&${r}>`).join(', ')})` : 'Direct Assignment';
                    await logAction(interaction.client, interaction.guild.id, rolesToRemove.length > 0 ? 'SWAP' : 'ASSIGN', interaction.user, targetUser, roleObj, details);

                } catch (err) {
                    console.error("Assign Error:", err);
                    // رسالة خطأ واضحة
                    await i.update({ content: `❌ **Failed to assign role.**\nPossible reason: The Bot's role is **lower** than the role you are trying to give.\nPlease move the Bot role HIGHER in Server Settings.`, embeds: [], components: [] });
                }
            }
        });
    },
};