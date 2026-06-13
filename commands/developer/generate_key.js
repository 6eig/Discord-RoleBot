const { SlashCommandBuilder } = require('discord.js');
const License = require('../../models/License');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('generate_key')
        .setDescription('Generate a new license key (Use 999 for Lifetime)')
        .addIntegerOption(option =>
            option.setName('days')
                .setDescription('Duration in days (Default: 30, Input 999 for Lifetime)')
                .setRequired(false)),

    async execute(interaction) {
        // 1. استلام المدة
        const daysInput = interaction.options.getInteger('days') || 30;
        
        let finalDays = daysInput;
        let durationText = `${daysInput} Days`;

        // --- الشفرة السرية: 999 تعني مدى الحياة ---
        if (daysInput === 999) {
            finalDays = 36500; // 100 سنة (عملياً مدى الحياة)
            durationText = '♾️ **Lifetime**';
        }

        // 2. توليد الكود (خليط حروف وأرقام)
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let key = '';
        for (let i = 0; i < 16; i++) {
            key += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        // 3. الحفظ
        try {
            const newLicense = new License({
                key: key,
                durationDays: finalDays,
                isUsed: false
            });

            await newLicense.save();

            // 4. الرد
            await interaction.reply({
                content: `✅ **License Generated!**\n\n🔑 **Key:** \`${key}\`\n📅 **Duration:** ${durationText}\n\n*Copy this key and send it to the customer.*`,
                ephemeral: true
            });

        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '❌ Error saving key.', ephemeral: true });
        }
    },
};