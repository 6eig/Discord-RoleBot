const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, PermissionsBitField } = require('discord.js');
const GuildConfig = require('../../models/GuildConfig');
const License = require('../../models/License');
const { generatePanel } = require('../../utils/panelGenerator');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('activate')
        .setDescription('Activate the bot using a license key')
        .addStringOption(option =>
            option.setName('key')
                .setDescription('Your 16-character license key')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        const client = interaction.client; 
        
        if (interaction.user.id !== interaction.guild.ownerId) {
            return interaction.reply({ content: '❌ Only Owner can activate.', ephemeral: true });
        }

        const keyInput = interaction.options.getString('key');
        const license = await License.findOne({ key: keyInput });

        if (!license) return interaction.reply({ content: '❌ Invalid Key.', ephemeral: true });
        if (license.isUsed) return interaction.reply({ content: '❌ Used Key.', ephemeral: true });

        const existingConfig = await GuildConfig.findOne({ guildId: interaction.guild.id });
        if (existingConfig && existingConfig.isActivated) {
            return interaction.reply({ content: '⚠️ Already Activated.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            const guild = interaction.guild;
            
            // 1. إنشاء الكاتيجوري
            const category = await guild.channels.create({
                name: 'ROLE MANAGER SYSTEM',
                type: ChannelType.GuildCategory,
            });

            // 2. إنشاء قناة لوحة التحكم
            const panelChannel = await guild.channels.create({
                name: 'control-panel',
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
                ]
            });

            // 3. إنشاء قناة الأوامر (مع وضع التوقف لمدة دقيقتين)
            const commandsChannel = await guild.channels.create({
                name: 'bot-commands',
                type: ChannelType.GuildText,
                parent: category.id,
                rateLimitPerUser: 120, // <--- هنا التعديل: 120 ثانية = 2 دقيقة
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }, // مخفية في البداية
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
                ]
            });

            // 4. إنشاء قناة الطلبات
            const requestsChannel = await guild.channels.create({
                name: 'role-requests',
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
                ]
            });

            // 5. إنشاء قناة السجلات
            const logsChannel = await guild.channels.create({
                name: 'system-logs',
                type: ChannelType.GuildText,
                parent: category.id,
                permissionOverwrites: [
                    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] }
                ]
            });

            // إرسال اللوحة
            const tempConfig = { permissions: [] };
            const panelData = generatePanel(tempConfig);
            const sentMessage = await panelChannel.send(panelData);

            // الحفظ في قاعدة البيانات
            const expireDate = new Date();
            expireDate.setDate(expireDate.getDate() + license.durationDays);

            license.isUsed = true;
            license.usedByGuildId = guild.id;
            await license.save();

            await GuildConfig.findOneAndUpdate(
                { guildId: guild.id },
                {
                    guildId: guild.id,
                    isActivated: true,
                    licenseKey: keyInput,
                    expireDate: expireDate,
                    channels: {
                        categoryId: category.id,
                        panelChannelId: panelChannel.id,
                        panelMessageId: sentMessage.id,
                        commandsChannelId: commandsChannel.id,
                        requestsChannelId: requestsChannel.id,
                        logsChannelId: logsChannel.id
                    },
                    $setOnInsert: { permissions: [] } 
                },
                { upsert: true, new: true }
            );

            await interaction.editReply({ 
                content: `✅ **Setup Complete!**\nChannels created with **2-minute Slowmode** on commands channel.\nGo to <#${panelChannel.id}>.` 
            });

        } catch (error) {
            console.error(error);
            await interaction.editReply({ content: '❌ Error during setup.' });
        }
    },
};