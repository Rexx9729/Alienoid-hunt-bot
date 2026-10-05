const { Telegraf } = require('telegraf');

const CHARACTER_BOT_TOKEN = process.env.CHARACTER_BOT_TOKEN;

if (!CHARACTER_BOT_TOKEN) {
    throw new Error('CHARACTER_BOT_TOKEN is missing from environment variables.');
}

const characterBot = new Telegraf(CHARACTER_BOT_TOKEN);

// Temporary base command.
// Character features will be added module-by-module.
characterBot.start(async (ctx) => {
    await ctx.reply(
        '🌟 Welcome to the Anime Character Bot!\n\n' +
        'Collect Waifus & Husbandos.\n\n' +
        'More features are coming soon...'
    );
});

module.exports = characterBot;
