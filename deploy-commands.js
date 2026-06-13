require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('node:fs');
const path = require('node:path');

// مصفوفات لفصل الأوامر
const globalCommands = []; // أوامر تظهر للجميع (العملاء)
const guildCommands = [];  // أوامر تظهر لك فقط (المطور)

const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = path.join(foldersPath, folder);
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        
        if ('data' in command && 'execute' in command) {
            // الفرز حسب المجلد
            if (folder === 'developer') {
                // إذا كان في مجلد المطور، ضعه في قائمة السيرفر الخاص
                guildCommands.push(command.data.toJSON());
            } else {
                // أي شيء آخر (admin) يذهب للعامة
                globalCommands.push(command.data.toJSON());
            }
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing "data" or "execute" property.`);
        }
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log(`🚀 Started refreshing application (/) commands...`);

        // 1. رفع أوامر المطور (لسيرفر التحكم فقط)
        // يتم التحديث فورياً
        if (process.env.CONTROL_GUILD_ID) {
            await rest.put(
                Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.CONTROL_GUILD_ID),
                { body: guildCommands },
            );
            console.log(`✅ Developer commands uploaded to Control Server (${guildCommands.length} commands).`);
        } else {
            console.log('⚠️ CONTROL_GUILD_ID not found in .env, skipping developer commands.');
        }

        // 2. رفع أوامر العامة (لكل السيرفرات)
        // قد يأخذ ديسكورد ساعة لتحديثها عالمياً، لكنها تظهر
        await rest.put(
            Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
            { body: globalCommands },
        );
        console.log(`✅ Global commands uploaded for customers (${globalCommands.length} commands).`);

    } catch (error) {
        console.error(error);
    }
})();