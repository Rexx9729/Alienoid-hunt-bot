const { Telegraf } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');

// Express Keep-Alive Server
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('⚡ Alienoid Hunt Bot is Live 24/7!');
});

app.listen(PORT, () => {
    console.log(`🌐 Keep-Alive server running on port ${PORT}`);
});

// Secrets
const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGO_URI = process.env.MONGO_URI;

if (!BOT_TOKEN || !MONGO_URI) {
    console.error('❌ Error: BOT_TOKEN or MONGO_URI is missing!');
    process.exit(1);
}

// Connect Database
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Connected Successfully!'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// Database Schema
const userSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    username: { type: String, default: 'Hunter' },
    level: { type: Number, default: 1 },
    rupees: { type: Number, default: 1000 },
    hunts: { type: Number, default: 0 },
    duels: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    inventory: {
        healerx: { type: Number, default: 0 },
        buff: { type: Number, default: 0 },
        defense: { type: Number, default: 0 },
        superScan: { type: Number, default: 0 },
        megaScan: { type: Number, default: 0 },
        absoluteScan: { type: Number, default: 0 }
    },
    aliens: [{
        alienId: String,
        name: String,
        nickname: String,
        rarity: String,
        star: { type: Number, default: 0 },
        level: { type: Number, default: 1 },
        hp: Number,
        maxHp: Number,
        atk: Number,
        def: Number,
        element: String,
        fileId: { type: String, default: '' }
    }]
});

const User = mongoose.model('User', userSchema);

// Bot Config
const bot = new Telegraf(BOT_TOKEN);

// Commands
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.first_name || 'Hunter';

    let user = await User.findOne({ userId });

    if (!user) {
        user = new User({
            userId,
            username,
            rupees: 1000,
            aliens: []
        });

        await user.save();

        ctx.reply(
            `🔱 Hello ${username}, welcome to the Alienoid ||\n\n` +
            `🎉 New Login Rewards : ₹1,000\n` +
            `🎉 Your First Companion : Coming Soon 👽\n\n` +
            `START NOW YOUR THRILLER JOURNEY ⚡`
        );
    } else {
        ctx.reply(
            `🔱 Welcome back ${username} to the Alienoid ||\n\n` +
            `⚡ Your thriller journey continues...\n\n` +
            `Use /profile to view your Hunter profile.\n` +
            `Use /inventory to check your items.\n` +
            `Use /hunt to hunt wild aliens.`
        );
    }
});

bot.command(['profile', 'me'], async (ctx) => {
    const userId = ctx.from.id;
    let user = await User.findOne({ userId });

    if (!user) return ctx.reply('⚠️ Please send /start first!');

    const name = user.username.padEnd(10, ' ').substring(0, 10);
    const lvl = String(user.level).padEnd(8, ' ');
    const duels = `${user.duels} (W:${user.wins})`.padEnd(8, ' ');
    const hunts = String(user.hunts).padEnd(8, ' ');
    const rupees = String(user.rupees).padEnd(8, ' ');

    const profileMsg = 
`<code>╔════ HUNTER INFO ════╗
║ 👤 Name  : ${name} ║
║ 📊 Level : ${lvl} ║
║ ⚔️ Duels : ${duels} ║
║ 🎯 Hunts : ${hunts} ║
║ 💰 Rupees: ₹ ${rupees} ║
╚═════════════════════╝</code>`;

    ctx.replyWithHTML(profileMsg);
});

bot.command(['inventory', 'items'], async (ctx) => {
    const userId = ctx.from.id;
    let user = await User.findOne({ userId });

    if (!user) return ctx.reply('⚠️ Please send /start first!');

    const rupees = String(user.rupees).padEnd(8, ' ');
    const healerx = String(user.inventory.healerx).padEnd(8, ' ');
    const buff = String(user.inventory.buff).padEnd(8, ' ');
    const defense = String(user.inventory.defense).padEnd(8, ' ');
    const sScan = String(user.inventory.superScan).padEnd(8, ' ');
    const mScan = String(user.inventory.megaScan).padEnd(8, ' ');
    const aScan = String(user.inventory.absoluteScan).padEnd(8, ' ');

    const invMsg = 
`<code>╔══════ INVENTORY ══════╗
║ 💰 Rupees : ₹ ${rupees} ║
║ 🧪 Healerx: ${healerx} ║
║ 💊 Buff   : ${buff} ║
║ 🛡️ Defence: ${defense} ║
║ ⚠️ S.Scan : ${sScan} ║
║ ☣️ M.Scan : ${mScan} ║
║ ☢️ A.Scan : ${aScan} ║
╚═══════════════════════╝</code>`;

    ctx.replyWithHTML(invMsg);
});

bot.command(['bag', 'aliens'], async (ctx) => {
    const userId = ctx.from.id;
    let user = await User.findOne({ userId });

    if (!user || user.aliens.length === 0) return ctx.reply('🎒 Your alien bag is empty!');

    let msg = `🛸 ━━━ YOUR ALIEN DECK ━━━ 🛸\n\n`;
    user.aliens.forEach((alien, index) => {
        const starStr = alien.star > 0 ? `${'⭐'.repeat(alien.star)} ` : '';
        msg += `${index + 1}. ${starStr}${alien.nickname} (${alien.rarity}) - Lvl ${alien.level}\n`;
    });

    msg += `\nTotal Aliens: ${user.aliens.length}`;
    ctx.reply(msg);
});

bot.launch().then(() => console.log('🤖 Alienoid Hunt Bot is online!'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
