const { SlashCommandBuilder } = require('discord.js');
const License = require('../../models/License');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('edit_key')
        .setDescription('Edit the duration of an unused license key')
        .addStringOption(option =>
            option.setName('key')
                .setDescription('The license key to edit')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('days')
                .setDescription('New duration in days')
                .setRequired(true)),

    async execute(interaction) {
        const keyToEdit = interaction.options.getString('key');
        const newDays = interaction.options.getInteger('days');

        const license = await License.findOne({ key: keyToEdit });

        if (!license) {
            return interaction.reply({ content: '❌ Key not found.', ephemeral: true });
        }

        if (license.isUsed) {
            return interaction.reply({ content: '⚠️ This key is already used. You cannot edit it.', ephemeral: true });
        }

        // التحديث
        license.durationDays = newDays;
        await license.save();

        await interaction.reply({ content: `✅ **Key Updated!**\nKey \`${keyToEdit}\` duration is now: **${newDays} Days**.`, ephemeral: true });
    },
};