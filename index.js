// --- كود الـ 24 ساعة (Web Server for Replit) ---
const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is Alive! 🟢');
});

const port = 3000;
app.listen(port, () => {
  console.log(`🔗 Listening on port ${port}`);
});
// ------------------------------------------------

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { 
    Client, Collection, GatewayIntentBits, Events, 
    ActionRowBuilder, RoleSelectMenuBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    ModalBuilder, TextInputBuilder, TextInputStyle, ActivityType, PermissionsBitField 
} = require('discord.js');
const mongoose = require('mongoose');
const GuildConfig = require('./models/GuildConfig');
const { generatePanel } = require('./utils/panelGenerator');
const { logAction } = require('./utils/logger');
const { checkExpirations } = require('./utils/expirationCheck');
const { isAuthorized } = require('./utils/checkAuth');

const wizardCache = new Collection();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

client.commands = new Collection();

// 1. Loading Commands
const foldersPath = path.join(__dirname, 'commands');
if (fs.existsSync(foldersPath)) {
    const commandFolders = fs.readdirSync(foldersPath);
    for (const folder of commandFolders) {
        const commandsPath = path.join(foldersPath, folder);
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
        for (const file of commandFiles) {
            const filePath = path.join(commandsPath, file);
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                client.commands.set(command.data.name, command);
            }
        }
    }
}

// 2. Database
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected to Database successfully'))
    .catch((err) => console.log('❌ Error connecting to Database:', err));

// --- Helper Functions ---

// تحديث اللوحة
async function updateMainPanel(guild, config) {
    try {
        const channel = guild.channels.cache.get(config.channels.panelChannelId);
        if (channel && config.channels.panelMessageId) {
            const msg = await channel.messages.fetch(config.channels.panelMessageId);
            const panelData = generatePanel(config);
            await msg.edit(panelData);
        }
    } catch (e) { console.error('Error updating panel UI'); }
}

// فحص اللوحات الدورية
async function checkPanels() {
    const activeGuilds = await GuildConfig.find({ isActivated: true });
    for (const config of activeGuilds) {
        try {
            const guild = client.guilds.cache.get(config.guildId);
            if (!guild) continue;
            const channel = guild.channels.cache.get(config.channels.panelChannelId);
            if (!channel) continue;
            let message = null;
            try {
                if (config.channels.panelMessageId) message = await channel.messages.fetch(config.channels.panelMessageId);
            } catch (err) { message = null; }
            if (!message) {
                const panelData = generatePanel(config);
                const newMessage = await channel.send(panelData);
                config.channels.panelMessageId = newMessage.id;
                await config.save();
            }
        } catch (error) { console.error(`Check error: ${error.message}`); }
    }
}

// إدارة الصلاحيات (فتح/إغلاق الرومات)
async function manageChannelPerms(guild, config, roleIds, type, action) {
    const channelsToEdit = [];
    if (type === 'FULL') {
        if (config.channels.panelChannelId) channelsToEdit.push(config.channels.panelChannelId);
        if (config.channels.commandsChannelId) channelsToEdit.push(config.channels.commandsChannelId);
        if (config.channels.requestsChannelId) channelsToEdit.push(config.channels.requestsChannelId);
        if (config.channels.logsChannelId) channelsToEdit.push(config.channels.logsChannelId);
    } else if (type === 'HANDLER') {
        if (config.channels.requestsChannelId) channelsToEdit.push(config.channels.requestsChannelId);
    }

    for (const roleId of roleIds) {
        for (const chId of channelsToEdit) {
            const channel = guild.channels.cache.get(chId);
            if (channel) {
                if (action === 'GRANT') {
                    await channel.permissionOverwrites.edit(roleId, { ViewChannel: true, SendMessages: true, UseApplicationCommands: true }).catch(e => console.error(e));
                } else {
                    await channel.permissionOverwrites.edit(roleId, { ViewChannel: false }).catch(e => console.error(e));
                }
            }
        }
    }
}

async function grantCommandAccess(guild, channelId, roleId) {
    try {
        const channel = guild.channels.cache.get(channelId);
        if (!channel) return;
        await channel.permissionOverwrites.edit(roleId, {
            ViewChannel: true, SendMessages: true, UseApplicationCommands: true
        });
    } catch (error) { console.error(`Perms Error: ${error.message}`); }
}

// 4. Client Ready
client.once(Events.ClientReady, readyClient => {
    console.log(`🚀 Ready! Logged in as ${readyClient.user.tag}`);
    client.user.setActivity('Organize servers!');
    
    checkPanels();
    checkExpirations(client);
    
    setInterval(() => { checkPanels(); }, 15 * 60 * 1000);
    setInterval(() => { checkExpirations(client); }, 24 * 60 * 60 * 1000);
});

// 5. Interaction Handler
client.on(Events.InteractionCreate, async interaction => {
    
    if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) return;
        try { await command.execute(interaction); } catch (e) { console.error(e); }
        return;
    }

    // --- Modal Submit ---
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_deny_submit_')) {
        const targetId = interaction.customId.split('_')[3];
        const reason = interaction.fields.getTextInputValue('deny_reason');
        const member = await interaction.guild.members.fetch(targetId).catch(() => null);
        const memberDisplay = member ? member : { id: targetId, toString: () => `User(${targetId})` };

        const embed = new EmbedBuilder(interaction.message.embeds[0].data)
            .setColor('Red').setTitle('🛡️ Request Denied').addFields({ name: '🚫 Rejection Reason', value: reason });
        
        await interaction.update({ embeds: [embed], components: [] });
        await logAction(client, interaction.guild.id, 'DENY', interaction.user, memberDisplay, null, `Reason: ${reason}`);
        return;
    }

    // --- Buttons & Menus ---
    if (interaction.customId && (interaction.customId.startsWith('btn_') || interaction.customId.startsWith('select_') || interaction.customId.startsWith('req_'))) {
        
        const config = await GuildConfig.findOne({ guildId: interaction.guild.id });
        if (!config) return interaction.reply({ content: 'Error: Config not found.', ephemeral: true });

        // General Checks
        if (config.expireDate && new Date() > config.expireDate) {
            return interaction.reply({ content: '🚫 **Service Suspended:** Subscription expired.', ephemeral: true });
        }

        // ============================================================
        // C. Request System (HIERARCHY CHECK)
        // ============================================================
        if (interaction.customId.startsWith('req_')) {
             if (!isAuthorized(interaction, config, 'requests')) {
                 return interaction.reply({ content: '❌ Access Denied: You are not authorized.', ephemeral: true });
             }

             // استخراج البيانات للتحقق من الرتب
             const embedDesc = interaction.message.embeds[0].description;
             const executorMatch = embedDesc.match(/\*\*Admin:\*\*\s*<@!?(\d+)>/);
             
             if (executorMatch) {
                 const executorId = executorMatch[1];
                 const targetId = interaction.customId.split('_')[2]; 

                 // أ. منع قبول الطلب الذاتي
                 if (interaction.user.id === executorId) {
                     return interaction.reply({ content: '❌ **Self-Approval Denied:** You cannot accept/deny your own request.', ephemeral: true });
                 }

                 // ب. التحقق من الهرمية (إذا لم يكن المستخدم هو الأونر)
                 if (interaction.user.id !== interaction.guild.ownerId) {
                     const approverMember = interaction.member;
                     const executorMember = await interaction.guild.members.fetch(executorId).catch(() => null);
                     const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

                     if (executorMember && approverMember.roles.highest.position <= executorMember.roles.highest.position) {
                         return interaction.reply({ content: '❌ **Hierarchy Error:** You must be ranked **higher** than the Admin who sent the request.', ephemeral: true });
                     }
                     if (targetMember && approverMember.roles.highest.position <= targetMember.roles.highest.position) {
                         return interaction.reply({ content: '❌ **Hierarchy Error:** You must be ranked **higher** than the Target user.', ephemeral: true });
                     }
                 }
             }

             // التنفيذ
             if (interaction.customId.startsWith('req_deny_')) {
                 const targetId = interaction.customId.split('_')[2];
                 const modal = new ModalBuilder().setCustomId(`modal_deny_submit_${targetId}`).setTitle('Reject Request');
                 const reasonInput = new TextInputBuilder().setCustomId('deny_reason').setLabel("Reason").setStyle(TextInputStyle.Paragraph).setRequired(true);
                 modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                 await interaction.showModal(modal);
                 return;
             }
             if (interaction.customId.startsWith('req_accept_')) {
                 const parts = interaction.customId.split('_');
                 const targetId = parts[2]; const newRoleId = parts[3]; const oldRolesStr = parts[4];
                 const member = await interaction.guild.members.fetch(targetId).catch(() => null);
                 if (!member) return interaction.reply({ content: '❌ Member left.', ephemeral: true });
                 const roleObj = interaction.guild.roles.cache.get(newRoleId);
                 try {
                     if (oldRolesStr && oldRolesStr.length > 0) {
                         for (const r of oldRolesStr.split(',')) if(r) await member.roles.remove(r).catch(console.error);
                     }
                     await member.roles.add(newRoleId);
                     const embed = new EmbedBuilder(interaction.message.embeds[0].data).setColor('Green').setTitle('🛡️ Request Approved');
                     await interaction.update({ embeds: [embed], components: [] });
                     await interaction.followUp({ content: `✅ **Done.**`, ephemeral: true });
                     await logAction(client, interaction.guild.id, 'APPROVE', interaction.user, member, roleObj, oldRolesStr ? 'Swap' : 'Approved');
                 } catch (e) { await interaction.reply({ content: '❌ Error.', ephemeral: true }); }
             }
             return; 
        }

        // ============================================================
        // Team Management (Owner Only)
        // ============================================================
        if (interaction.customId === 'btn_manage_team_access') {
            if (interaction.user.id !== interaction.guild.ownerId) {
                return interaction.reply({ content: '❌ Only Owner can manage team access.', ephemeral: true });
            }
            const embed = new EmbedBuilder()
                .setTitle('🔐 Team Access Control')
                .setDescription('Select an action:\n\n👁️ **View:** See current staff.\n➕ **Add:** Add new roles and grant access.\n🗑️ **Remove:** Remove roles and revoke access.')
                .setColor('Blue');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_team_view').setLabel('View Team').setStyle(ButtonStyle.Secondary).setEmoji('👁️'),
                new ButtonBuilder().setCustomId('btn_team_add_menu').setLabel('Add Access').setStyle(ButtonStyle.Success).setEmoji('➕'),
                new ButtonBuilder().setCustomId('btn_team_remove_menu').setLabel('Remove Access').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
            );
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }
        else if (interaction.customId === 'btn_team_view') {
            const fullAdmins = config.managers?.fullAdmins?.map(id => `<@&${id}>`).join('\n') || 'None';
            const reqHandlers = config.managers?.requestResponders?.map(id => `<@&${id}>`).join('\n') || 'None';
            const embed = new EmbedBuilder().setTitle('👥 Current Team').addFields({ name: '🛡️ Full Access', value: fullAdmins, inline: true }, { name: '✅ Handlers', value: reqHandlers, inline: true }).setColor('Gold');
            await interaction.update({ content: '', embeds: [embed], components: [] });
        }
        else if (interaction.customId === 'btn_team_add_menu') {
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_team_add_full').setLabel('Add Full Access').setStyle(ButtonStyle.Danger).setEmoji('🛡️'), new ButtonBuilder().setCustomId('btn_team_add_req').setLabel('Add Handler').setStyle(ButtonStyle.Success).setEmoji('✅'));
            await interaction.update({ content: '➕ **What type of access do you want to ADD?**', embeds: [], components: [row] });
        }
        else if (interaction.customId === 'btn_team_remove_menu') {
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_team_remove_full').setLabel('Remove Full Access').setStyle(ButtonStyle.Danger).setEmoji('🛡️'), new ButtonBuilder().setCustomId('btn_team_remove_req').setLabel('Remove Handler').setStyle(ButtonStyle.Success).setEmoji('✅'));
            await interaction.update({ content: '🗑️ **What type of access do you want to REMOVE?**', embeds: [], components: [row] });
        }
        // Select Menus Setup
        else if (interaction.customId === 'btn_team_add_full') {
            const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('select_team_add_full').setPlaceholder('Select Roles to ADD to Full Access').setMinValues(1).setMaxValues(10));
            await interaction.update({ content: '👇 Select roles to **Give Full Access**:', components: [row] });
        }
        else if (interaction.customId === 'btn_team_add_req') {
            const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('select_team_add_req').setPlaceholder('Select Roles to ADD to Handlers').setMinValues(1).setMaxValues(10));
            await interaction.update({ content: '👇 Select roles to **Give Handler Access**:', components: [row] });
        }
        else if (interaction.customId === 'btn_team_remove_full') {
            const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('select_team_remove_full').setPlaceholder('Select Roles to REMOVE from Full Access').setMinValues(1).setMaxValues(10));
            await interaction.update({ content: '👇 Select roles to **Revoke Full Access**:', components: [row] });
        }
        else if (interaction.customId === 'btn_team_remove_req') {
            const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('select_team_remove_req').setPlaceholder('Select Roles to REMOVE from Handlers').setMinValues(1).setMaxValues(10));
            await interaction.update({ content: '👇 Select roles to **Revoke Handler Access**:', components: [row] });
        }
        // Execution Logic
        else if (interaction.customId === 'select_team_add_full') {
            if (!config.managers) config.managers = { fullAdmins: [], requestResponders: [] };
            const rolesToAdd = interaction.values;
            rolesToAdd.forEach(r => { if (!config.managers.fullAdmins.includes(r)) config.managers.fullAdmins.push(r); });
            config.markModified('managers'); await config.save();
            await manageChannelPerms(interaction.guild, config, rolesToAdd, 'FULL', 'GRANT');
            await updateMainPanel(interaction.guild, config);
            await interaction.update({ content: `✅ **Added:** ${rolesToAdd.length} roles to Full Access.`, components: [] });
        }
        else if (interaction.customId === 'select_team_add_req') {
            if (!config.managers) config.managers = { fullAdmins: [], requestResponders: [] };
            const rolesToAdd = interaction.values;
            rolesToAdd.forEach(r => { if (!config.managers.requestResponders.includes(r)) config.managers.requestResponders.push(r); });
            config.markModified('managers'); await config.save();
            await manageChannelPerms(interaction.guild, config, rolesToAdd, 'HANDLER', 'GRANT');
            await updateMainPanel(interaction.guild, config);
            await interaction.update({ content: `✅ **Added:** ${rolesToAdd.length} roles to Handlers.`, components: [] });
        }
        else if (interaction.customId === 'select_team_remove_full') {
            if (!config.managers) return;
            const rolesToRemove = interaction.values;
            config.managers.fullAdmins = config.managers.fullAdmins.filter(id => !rolesToRemove.includes(id));
            config.markModified('managers'); await config.save();
            await manageChannelPerms(interaction.guild, config, rolesToRemove, 'FULL', 'REVOKE');
            await updateMainPanel(interaction.guild, config);
            await interaction.update({ content: `🗑️ **Removed:** ${rolesToRemove.length} roles from Full Access.`, components: [] });
        }
        else if (interaction.customId === 'select_team_remove_req') {
            if (!config.managers) return;
            const rolesToRemove = interaction.values;
            config.managers.requestResponders = config.managers.requestResponders.filter(id => !rolesToRemove.includes(id));
            config.markModified('managers'); await config.save();
            await manageChannelPerms(interaction.guild, config, rolesToRemove, 'HANDLER', 'REVOKE');
            await updateMainPanel(interaction.guild, config);
            await interaction.update({ content: `🗑️ **Removed:** ${rolesToRemove.length} roles from Handlers.`, components: [] });
        }

        // ============================================================
        // D. Dashboard & Wizard
        // ============================================================
        else if (!isAuthorized(interaction, config, 'dashboard')) {
            if (interaction.customId === 'btn_refresh_panel') {
                await updateMainPanel(interaction.guild, config);
                return interaction.reply({ content: '🔄 Refreshed.', ephemeral: true });
            }
            return interaction.reply({ content: '❌ Access Denied.', ephemeral: true });
        }
        else {
            try {
                if (interaction.customId === 'btn_add_rule_start') {
                    const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('select_admin_role').setPlaceholder('Select Admin Role').setMaxValues(1));
                    await interaction.reply({ content: '1️⃣ **Step 1:** Select Admin.', components: [row], ephemeral: true });
                }
                else if (interaction.customId === 'select_admin_role') {
                    wizardCache.set(interaction.user.id, { adminRoleId: interaction.values[0] });
                    const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('select_target_roles').setPlaceholder('Select Targets').setMinValues(1).setMaxValues(20));
                    await interaction.update({ content: '2️⃣ **Step 2:** Select Targets.', components: [row] });
                }
                else if (interaction.customId === 'select_target_roles') {
                    const data = wizardCache.get(interaction.user.id);
                    if (!data) return interaction.update({ content: '❌ Expired.', components: [] });
                    const filteredRoles = interaction.values.filter(roleId => roleId !== data.adminRoleId);
                    if (filteredRoles.length === 0) return interaction.update({ content: '⚠️ Targets cannot match Admin.', components: [] });
                    data.allowedRoles = filteredRoles;
                    wizardCache.set(interaction.user.id, data);
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_approval_yes').setLabel('Require Approval').setStyle(ButtonStyle.Primary).setEmoji('🛡️'), new ButtonBuilder().setCustomId('btn_approval_no').setLabel('Instant Give').setStyle(ButtonStyle.Secondary).setEmoji('⚡'));
                    await interaction.update({ content: `3️⃣ **Step 3:** Require Approval?`, components: [row] });
                }
                else if (interaction.customId === 'btn_approval_yes' || interaction.customId === 'btn_approval_no') {
                    const data = wizardCache.get(interaction.user.id);
                    if (!data) return interaction.update({ content: '❌ Expired.', components: [] });
                    config.permissions.push({ adminRoleId: data.adminRoleId, allowedRoles: data.allowedRoles, requireApproval: interaction.customId === 'btn_approval_yes' });
                    await config.save();
                    if (config.channels.commandsChannelId) await grantCommandAccess(interaction.guild, config.channels.commandsChannelId, data.adminRoleId);
                    wizardCache.delete(interaction.user.id);
                    await updateMainPanel(interaction.guild, config); 
                    await interaction.update({ content: '✅ **Rule Created!**', components: [] });
                }
                
                // Edit Rules with Names
                else if (interaction.customId === 'btn_manage_rules') {
                    if (!config.permissions || config.permissions.length === 0) return interaction.reply({ content: '⚠️ No rules.', ephemeral: true });
                    const options = config.permissions.map((perm, index) => {
                        const role = interaction.guild.roles.cache.get(perm.adminRoleId);
                        const roleName = role ? role.name : 'Unknown Role';
                        return { label: `#${index + 1} | 👮 ${roleName}`, value: index.toString(), description: `Target Roles: ${perm.allowedRoles.length}` };
                    });
                    const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('select_rule_to_edit').addOptions(options));
                    await interaction.reply({ components: [row], ephemeral: true });
                }
                else if (interaction.customId === 'select_rule_to_edit') {
                    const index = parseInt(interaction.values[0]);
                    const perm = config.permissions[index];
                    wizardCache.set(interaction.user.id + '_edit', index);
                    const adminRole = `<@&${perm.adminRoleId}>`;
                    const targetRoles = perm.allowedRoles.map(r => `<@&${r}>`).join(', ');
                    const status = perm.requireApproval ? '✅ Required' : '⚡ Instant';
                    const embed = new EmbedBuilder().setTitle(`⚙️ Editing Rule #${index + 1}`).setDescription(`👮 **Admin:** ${adminRole}\n🎯 **Targets:** ${targetRoles}\n🛡️ **Approval:** ${status}`).setColor('Orange');
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('btn_edit_toggle_approval').setLabel('Toggle Approval').setStyle(ButtonStyle.Success).setEmoji('🛡️'),
                        new ButtonBuilder().setCustomId('btn_edit_roles_menu').setLabel('Edit Roles').setStyle(ButtonStyle.Primary).setEmoji('🎭'),
                        new ButtonBuilder().setCustomId('btn_edit_delete').setLabel('Delete').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
                    );
                    await interaction.update({ embeds: [embed], components: [row] });
                }
                else if (interaction.customId === 'btn_edit_roles_menu') {
                     const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_edit_admin_role').setLabel('Change Admin').setStyle(ButtonStyle.Secondary).setEmoji('👮'), new ButtonBuilder().setCustomId('btn_edit_target_roles').setLabel('Change Targets').setStyle(ButtonStyle.Secondary).setEmoji('🎯'), new ButtonBuilder().setCustomId('btn_back_to_rule').setLabel('Back').setStyle(ButtonStyle.Secondary).setEmoji('🔙'));
                     await interaction.update({ content: '**🎭 Modify Roles:**', embeds: [], components: [row] });
                }
                else if (interaction.customId === 'btn_back_to_rule') {
                     const index = wizardCache.get(interaction.user.id + '_edit');
                     const perm = config.permissions[index];
                     const adminRole = `<@&${perm.adminRoleId}>`;
                     const targetRoles = perm.allowedRoles.map(r => `<@&${r}>`).join(', ');
                     const status = perm.requireApproval ? '✅ Required' : '⚡ Instant';
                     const embed = new EmbedBuilder().setTitle(`⚙️ Editing Rule #${index + 1}`).setDescription(`👮 **Admin:** ${adminRole}\n🎯 **Targets:** ${targetRoles}\n🛡️ **Approval:** ${status}`).setColor('Orange');
                     const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_edit_toggle_approval').setLabel('Toggle Approval').setStyle(ButtonStyle.Success).setEmoji('🛡️'), new ButtonBuilder().setCustomId('btn_edit_roles_menu').setLabel('Edit Roles').setStyle(ButtonStyle.Primary).setEmoji('🎭'), new ButtonBuilder().setCustomId('btn_edit_delete').setLabel('Delete').setStyle(ButtonStyle.Danger).setEmoji('🗑️'));
                     await interaction.update({ content: '', embeds: [embed], components: [row] });
                }
                else if (interaction.customId === 'btn_edit_admin_role') {
                    const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('select_edit_new_admin').setPlaceholder('Select New Admin').setMaxValues(1));
                    await interaction.update({ content: '👇 Select New Admin:', components: [row] });
                }
                else if (interaction.customId === 'select_edit_new_admin') {
                    const index = wizardCache.get(interaction.user.id + '_edit');
                    if (index === undefined) return;
                    config.permissions[index].adminRoleId = interaction.values[0];
                    await config.save();
                    if (config.channels.commandsChannelId) await grantCommandAccess(interaction.guild, config.channels.commandsChannelId, interaction.values[0]);
                    await updateMainPanel(interaction.guild, config);
                    await interaction.update({ content: '✅ **Updated!**', components: [] });
                }
                else if (interaction.customId === 'btn_edit_target_roles') {
                    const row = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('select_edit_new_targets').setPlaceholder('Select New Targets').setMinValues(1).setMaxValues(20));
                    await interaction.update({ content: '👇 Select New Targets:', components: [row] });
                }
                else if (interaction.customId === 'select_edit_new_targets') {
                    const index = wizardCache.get(interaction.user.id + '_edit');
                    if (index === undefined) return;
                    const filteredRoles = interaction.values.filter(id => id !== config.permissions[index].adminRoleId);
                    if (filteredRoles.length === 0) return interaction.update({ content: '⚠️ Targets cannot match Admin.', components: [] });
                    config.permissions[index].allowedRoles = filteredRoles;
                    await config.save();
                    await updateMainPanel(interaction.guild, config);
                    await interaction.update({ content: '✅ **Updated!**', components: [] });
                }
                else if (interaction.customId === 'btn_edit_toggle_approval') {
                    const index = wizardCache.get(interaction.user.id + '_edit');
                    if (index === undefined) return;
                    config.permissions[index].requireApproval = !config.permissions[index].requireApproval;
                    await config.save();
                    await updateMainPanel(interaction.guild, config);
                    const perm = config.permissions[index];
                    const adminRole = `<@&${perm.adminRoleId}>`;
                    const targetRoles = perm.allowedRoles.map(r => `<@&${r}>`).join(', ');
                    const status = perm.requireApproval ? '✅ Required' : '⚡ Instant';
                    const embed = new EmbedBuilder().setTitle(`⚙️ Editing Rule #${index + 1}`).setDescription(`👮 **Admin:** ${adminRole}\n🎯 **Targets:** ${targetRoles}\n🛡️ **Approval:** ${status}`).setColor('Orange');
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_edit_toggle_approval').setLabel('Toggle Approval').setStyle(ButtonStyle.Success).setEmoji('🛡️'), new ButtonBuilder().setCustomId('btn_edit_roles_menu').setLabel('Edit Roles').setStyle(ButtonStyle.Primary).setEmoji('🎭'), new ButtonBuilder().setCustomId('btn_edit_delete').setLabel('Delete').setStyle(ButtonStyle.Danger).setEmoji('🗑️'));
                    await interaction.update({ embeds: [embed], components: [row] });
                }
                else if (interaction.customId === 'btn_edit_delete') {
                    const index = wizardCache.get(interaction.user.id + '_edit');
                    if (index === undefined) return;
                    config.permissions.splice(index, 1);
                    await config.save();
                    await updateMainPanel(interaction.guild, config);
                    await interaction.update({ content: '🗑️ **Deleted.**', embeds: [], components: [] });
                }
                else if (interaction.customId === 'btn_refresh_panel') {
                    await updateMainPanel(interaction.guild, config);
                    await interaction.reply({ content: '🔄 Refreshed.', ephemeral: true });
                }
            } catch (error) { console.error(error); }
        }
    }
});

// Anti-Crash System
process.on('unhandledRejection', (reason, promise) => { console.log('Unhandled Rejection at:', promise, 'reason:', reason); });
process.on('uncaughtException', (err) => { console.log('Uncaught Exception:', err); });
process.on('uncaughtExceptionMonitor', (err, origin) => { console.log('Uncaught Exception Monitor:', err, origin); });

client.login(process.env.DISCORD_TOKEN);