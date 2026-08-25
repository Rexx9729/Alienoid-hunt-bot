const { Telegraf, session } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const { generateAlienStats } = require('./services/alienGenerator');
const Alien = require('./models/Alien');
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
    lastDailyClaim: {
    type: Date,
    default: null
},
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
bot.use(session());
// ==================== ALIENOID ECONOMY ====================

const HUNT_COST = 20;

const ALIEN_ECONOMY = {
    Basic: {
        killReward: 80,
        spawnThreshold: 1
    },

    Common: {
        killReward: 120,
        spawnThreshold: 25
    },

    Rare: {
        killReward: 220,
        spawnThreshold: 80
    },

    Legendary: {
        killReward: 520,
        spawnThreshold: 200
    },

    Cosmic: {
        killReward: 1020,
        spawnThreshold: 400
    },

    God: {
        killReward: 2020,
        spawnThreshold: 600
    }
};
// ==================== TELEGRAM COMMAND MENU ====================

// Private DM command menu
bot.telegram.setMyCommands([
    { command: 'start', description: 'Start Alienoid Hunt' },
    { command: 'profile', description: 'View your Hunter profile' },
    { command: 'inventory', description: 'View your items and scans' },
    { command: 'bag', description: 'View your collected aliens' },
    { command: 'hunt', description: 'Hunt a wild alien' },
    { command: 'daily', description: 'Claim your daily ₹500 reward' },
    { command: 'rpay', description: 'Send Rupees to another player' },
    { command: 'agive', description: 'Give an alien to another player' },
    { command: 'trade', description: 'Trade aliens with another player' },
    { command: 'give', description: 'Give an item to another player' },
    { command: 'donate', description: 'Donate a scan to another player' },
    { command: 'help', description: 'Open Alienoid Hunt Help' }
], {
    scope: { type: 'all_private_chats' }
});

// Group command menu
bot.telegram.setMyCommands([
    { command: 'start', description: 'Start Alienoid Hunt' },
    { command: 'profile', description: 'View your Hunter profile' },
    { command: 'inventory', description: 'View your items and scans' },
    { command: 'bag', description: 'View your collected aliens' },
    { command: 'daily', description: 'Claim your daily ₹500 reward' },
    { command: 'rpay', description: 'Send Rupees to another player' },
    { command: 'agive', description: 'Give an alien to another player' },
    { command: 'trade', description: 'Trade aliens with another player' },
    { command: 'give', description: 'Give an item to another player' },
    { command: 'donate', description: 'Donate a scan to another player' },
    { command: 'help', description: 'Open Alienoid Hunt Help' }
], {
    scope: { type: 'all_group_chats' }
});
// ==================== ADD ALIEN ====================

bot.command('addalien', async (ctx) => {

    ctx.session.addAlien = {
        step: 'name'
    };

    await ctx.reply(
        `👽 ADD NEW ALIEN\n\n` +
        `Step 1/4\n` +
        `Enter alien name:`
    );
});


// ==================== ADD ALIEN — NAME ====================

bot.on('text', async (ctx, next) => {

    if (!ctx.session?.addAlien) {
        return next();
    }

    const data = ctx.session.addAlien;

    if (data.step !== 'name') {
        return next();
    }

    const name = ctx.message.text.trim();

    if (name.length < 2 || name.length > 50) {
        return ctx.reply(
            '⚠️ Alien name must be between 2 and 50 characters.'
        );
    }

    const existingAlien = await Alien.findOne({ name });

    if (existingAlien) {
        return ctx.reply(
            '❌ This alien already exists.\n\n' +
            'Please enter another name.'
        );
    }

    data.name = name;
    data.step = 'rarity';

    await ctx.reply(
        `👽 ${name}\n\n` +
        `Step 2/4\n` +
        `Select rarity:`,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '⚪ Basic', callback_data: 'alien_rarity_Basic' },
                        { text: '🟢 Common', callback_data: 'alien_rarity_Common' }
                    ],
                    [
                        { text: '🔵 Rare', callback_data: 'alien_rarity_Rare' },
                        { text: '🟣 Legendary', callback_data: 'alien_rarity_Legendary' }
                    ],
                    [
                        { text: '🌌 Cosmic', callback_data: 'alien_rarity_Cosmic' },
                        { text: '👑 God', callback_data: 'alien_rarity_God' }
                    ]
                ]
            }
        }
    );
});


// ==================== ADD ALIEN — RARITY ====================

bot.action(/^alien_rarity_(.+)$/, async (ctx) => {

    const rarity = ctx.match[1];

    if (!ctx.session?.addAlien) {
        return ctx.answerCbQuery(
            '⚠️ Start again with /addalien'
        );
    }

    const data = ctx.session.addAlien;

    if (!ALIEN_ECONOMY[rarity]) {
        return ctx.answerCbQuery(
            '❌ Invalid rarity.',
            { show_alert: true }
        );
    }

    data.rarity = rarity;
    data.step = 'element';

    await ctx.answerCbQuery();

    const elementButtons = [
        [
            { text: '🔥 Fire', callback_data: 'alien_element_Fire' },
            { text: '💧 Water', callback_data: 'alien_element_Water' }
        ],
        [
            { text: '🌍 Earth', callback_data: 'alien_element_Earth' },
            { text: '🪨 Rock', callback_data: 'alien_element_Rock' }
        ],
        [
            { text: '❄️ Ice', callback_data: 'alien_element_Ice' },
            { text: '☣️ Acid', callback_data: 'alien_element_Acid' }
        ],
        [
            { text: '⚡ Electric', callback_data: 'alien_element_Electric' },
            { text: '🌪️ Wind', callback_data: 'alien_element_Wind' }
        ],
        [
            { text: '🥊 Physical', callback_data: 'alien_element_Physical' },
            { text: '🧠 Psychic', callback_data: 'alien_element_Psychic' }
        ],
        [
            { text: '🌀 Gravity', callback_data: 'alien_element_Gravity' }
        ]
    ];

    // Void only belongs to God tier.
    if (rarity === 'God') {
        elementButtons.push([
            { text: '🌑 Void', callback_data: 'alien_element_Void' }
        ]);
    }

    await ctx.editMessageText(
        `👽 ${data.name}\n` +
        `⭐ ${data.rarity}\n\n` +
        `Step 3/4\n` +
        `Select element:`,
        {
            reply_markup: {
                inline_keyboard: elementButtons
            }
        }
    );
});


// ==================== ADD ALIEN — ELEMENT ====================

bot.action(/^alien_element_(.+)$/, async (ctx) => {

    const element = ctx.match[1];

    if (!ctx.session?.addAlien) {
        return ctx.answerCbQuery(
            '⚠️ Start again with /addalien'
        );
    }

    const data = ctx.session.addAlien;

    if (element === 'Void' && data.rarity !== 'God') {
        return ctx.answerCbQuery(
            '❌ Void is only available for God tier.',
            { show_alert: true }
        );
    }

    data.element = element;
    data.step = 'image';

    await ctx.answerCbQuery();

    await ctx.editMessageText(
        `👽 ${data.name}\n` +
        `⭐ Rarity: ${data.rarity}\n` +
        `🌌 Element: ${data.element}\n\n` +
        `Step 4/4\n` +
        `🖼️ Send the alien image now.`
    );
});


// ==================== ADD ALIEN — IMAGE ====================

bot.on('photo', async (ctx, next) => {

    if (!ctx.session?.addAlien) {
        return next();
    }

    const data = ctx.session.addAlien;

    if (data.step !== 'image') {
        return next();
    }

    try {

        const largestPhoto =
            ctx.message.photo[ctx.message.photo.length - 1];

        const imageFileId = largestPhoto.file_id;

        // Generate HP, attack, defense, speed and 3 unique attacks.
        const generated = generateAlienStats(
            data.name,
            data.rarity,
            data.element
        );

        const economy = ALIEN_ECONOMY[data.rarity];

        const alien = new Alien({

            name: generated.name,
            rarity: generated.rarity,
            element: generated.element,

            imageFileId,

            maxHp: generated.maxHp,
            defense: generated.defense,
            speed: generated.speed,
            baseAttack: generated.baseAttack,

            attacks: generated.attacks,

            maxStar: 3,

            huntRewardMin: economy.killReward,
            huntRewardMax: economy.killReward,

            spawnThreshold: economy.spawnThreshold,

            normalScanAvailable:
                ['Basic', 'Common', 'Rare'].includes(data.rarity)
        });

        await alien.save();

        const attackText = generated.attacks
            .map((attack, index) =>
                `${index + 1}. ${attack.name} — ${attack.damage} DMG`
            )
            .join('\n');

        await ctx.reply(
            `✅ ALIEN ADDED SUCCESSFULLY!\n\n` +

            `👽 ${generated.name}\n` +
            `⭐ Rarity: ${generated.rarity}\n` +
            `🌌 Element: ${generated.element}\n\n` +

            `❤️ HP: ${generated.maxHp}\n` +
            `🛡️ Defense: ${generated.defense}\n` +
            `⚡ Speed: ${generated.speed}\n` +
            `⚔️ Base Attack: ${generated.baseAttack}\n\n` +

            `🥊 ATTACKS\n` +
            `${attackText}\n\n` +

            `💰 Kill Reward: ₹${economy.killReward}\n` +
            `🎯 Spawn Threshold: ${economy.spawnThreshold} hunts\n\n` +

            `🗄️ Saved to MongoDB.`
        );

        ctx.session.addAlien = null;

    } catch (error) {

        console.error('❌ Add Alien Error:', error);

        ctx.session.addAlien = null;

        await ctx.reply(
            `❌ Failed to add alien.\n\n` +
            `Error: ${error.message}`
        );
    }
});
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
`<code> HUNTER INFO 
──────────────────
 👤 Name  : ${name} 
 📊 Level : ${lvl} 
 ⚔️ Duels : ${duels} 
 🎯 Hunts : ${hunts} 
 💰 Rupees: ₹ ${rupees} 
 ──────────────────
</code>`;

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
`<code> INVENTORY 
────────────────
 💰 Rupees : ₹ ${rupees}
 🧪 Healerx: ${healerx}
 💊 Buff   : ${buff}
 🛡️ Defence: ${defense} 
 ⚠️ S.Scan : ${sScan} 
 ☣️ M.Scan : ${mScan} 
 ☢️ A.Scan : ${aScan} 
 ────────────────
</code>`;

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

// ==================== DAILY REWARD ====================

bot.command('daily', async (ctx) => {
    try {
        const userId = ctx.from.id;

        const user = await User.findOne({ userId });

        if (!user) {
            return ctx.reply('⚠️ Please send /start first!');
        }

        const now = new Date();
        const DAILY_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours

        // Check previous claim
        if (user.lastDailyClaim) {
            const timePassed = now.getTime() - user.lastDailyClaim.getTime();

            if (timePassed < DAILY_COOLDOWN) {
                const remaining = DAILY_COOLDOWN - timePassed;

                const hours = Math.floor(remaining / (1000 * 60 * 60));
                const minutes = Math.floor(
                    (remaining % (1000 * 60 * 60)) / (1000 * 60)
                );

                return ctx.reply(
                    `⏳ Daily reward already claimed!\n\n` +
                    `Come back in ${hours}h ${minutes}m.`
                );
            }
        }

        // Give ₹500 daily bonus
        user.rupees += 500;
        user.lastDailyClaim = now;

        await user.save();

        return ctx.reply(
            `🎁 DAILY REWARD CLAIMED!\n\n` +
            `💰 You received ₹500\n` +
            `💵 Current Balance: ₹${user.rupees}\n\n` +
            `Come back tomorrow for another reward! 🔱`
        );

    } catch (error) {
        console.error('Daily command error:', error);
        return ctx.reply('❌ Something went wrong. Please try again.');
    }
});

// ==================== RUPPES PAYMENT ====================

bot.command('rpay', async (ctx) => {
    try {
        const senderId = ctx.from.id;

        // Must reply to another user's message
        if (!ctx.message.reply_to_message) {
            return ctx.reply(
                '⚠️ Reply to a player\'s message and use:\n\n' +
                '/rpay <amount>\n\n' +
                'Example: /rpay 200'
            );
        }

        const receiverId = ctx.message.reply_to_message.from.id;

        // Prevent self-payment
        if (senderId === receiverId) {
            return ctx.reply(
                '❌ You cannot transfer Rupees to yourself.'
            );
        }

        // Get amount
        const args = ctx.message.text.trim().split(/\s+/);
        const amount = Number(args[1]);

        // Invalid / zero / negative amount
        if (!Number.isFinite(amount) || amount <= 0) {
            return ctx.reply(
                'Are you a fool, kiddo? Don\'t mess around here. 😈'
            );
        }

        // Only whole Rupees
        if (!Number.isInteger(amount)) {
            return ctx.reply(
                '⚠️ Please enter a whole Rupee amount.'
            );
        }

        // Find both users
        const sender = await User.findOne({ userId: senderId });
        const receiver = await User.findOne({ userId: receiverId });

        if (!sender) {
            return ctx.reply('⚠️ Please send /start first!');
        }

        if (!receiver) {
            return ctx.reply(
                '❌ This player has not started Alienoid Hunt yet.'
            );
        }

        // Check sender balance
        if (sender.rupees < amount) {
            return ctx.reply(
                '❌ LOW BALANCE\n\n' +
                'Transfer denied!!\n\n' +
                `💰 Your Balance: ₹${sender.rupees}\n` +
                `💸 Required: ₹${amount}`
            );
        }

        // Transfer
        sender.rupees -= amount;
        receiver.rupees += amount;

        await sender.save();
        await receiver.save();

        const receiverName =
            receiver.username ||
            ctx.message.reply_to_message.from.first_name ||
            'Hunter';

        return ctx.reply(
            `💸 PAYMENT SUCCESSFUL ${amount} 🎉\n\n` +
            `To: ${receiverName}\n` +
            `💰 Amount: ₹${amount}\n\n` +
            `💵 Your Balance: ₹${sender.rupees}`
        );

    } catch (error) {
        console.error('RPay command error:', error);

        return ctx.reply(
            '❌ Payment failed due to a temporary error. Please try again.'
        );
    }
});
// ==================== HELP MENU ====================

const helpKeyboard = {
    reply_markup: {
        inline_keyboard: [
            [
                { text: '📜 Commands', callback_data: 'help_commands' },
                { text: '🎒 Items', callback_data: 'help_items' }
            ],
            [
                { text: '⭐ Star System', callback_data: 'help_stars' },
                { text: '🆘 Support', callback_data: 'help_support' }
            ]
        ]
    }
};

bot.command('help', async (ctx) => {
    const helpMessage =
`🔱 ALIENOID HUNT

👽 Hunt. Capture. Battle. Collect.

Welcome to Alienoid Hunt, Hunter!

Choose a category below to learn how the game works. 👇`;

    await ctx.reply(helpMessage, helpKeyboard);
});


// ==================== HELP: COMMANDS ====================

bot.action('help_commands', async (ctx) => {

    const message =
`📜 ALIENOID HUNT — COMMANDS

/start
Start your journey and create your Hunter profile.

/profile
View your level, Rupees, Hunts, Duels and wins.

/inventory
View your items, scans and Rupees.

/bag
View your collected aliens.

/hunt
Hunt a wild alien, capture it or defeat it.
⚠️ DM only.

/daily
Claim your daily ₹500 reward.

/rpay <amount>
Transfer Rupees to another player.
Reply to their message.

/agive
Give an alien to another player.

/trade
Trade an alien with another player.

/give <item>
Give an item to another player.

/donate <scan>
Donate a scan to another player.

/help
Open the Alienoid Hunt Help Menu.`;

    await ctx.answerCbQuery();
    await ctx.editMessageText(message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '⬅️ Back', callback_data: 'help_main' }]
            ]
        }
    });
});


// ==================== HELP: ITEMS ====================

bot.action('help_items', async (ctx) => {

    const message =
`🎒 ALIENOID HUNT — ITEMS

🧪 HEALERX — ₹200
Restores HP during battle.

💊 BUFF — ₹150
Provides a battle advantage.
Selected before the battle starts.

🛡️ DEFENSE — ₹120
Provides a defensive advantage.
Selected before the battle starts.

🔍 NORMAL SCAN — ₹10
Used to capture Basic, Common and Rare aliens.

⚡ SUPER SCAN — ₹1,000
A powerful scan with better chances against higher rarities.

☣️ MEGA SCAN — ₹2,500
A stronger scan capable of reaching high-tier aliens.

☢️ ABSOLUTE SCAN — ₹10,000
The strongest scan.
It can capture Legendary and has a chance against Cosmic and Alien X.`;

    await ctx.answerCbQuery();
    await ctx.editMessageText(message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '⬅️ Back', callback_data: 'help_main' }]
            ]
        }
    });
});


// ==================== HELP: STAR SYSTEM ====================

bot.action('help_stars', async (ctx) => {

    const message =
`⭐ STAR SYSTEM

Merge identical aliens to increase their Star level.

3 Normal Aliens
        ↓
     ⭐ 1-Star
        ↓
3 × 1-Star Aliens
        ↓
    ⭐⭐ 2-Star
        ↓
3 × 2-Star Aliens
        ↓
   ⭐⭐⭐ 3-Star

⚡ POWER SCALING

Normal → 100%
⭐ 1-Star → 130%
⭐⭐ 2-Star → 160%
⭐⭐⭐ 3-Star → 200%

The Star System works across all rarities.

💰 MERGE FEES

Basic
₹200 → 1★
₹400 → 2★
₹600 → 3★

Common
₹400 → 1★
₹600 → 2★
₹800 → 3★

Rare
₹600 → 1★
₹800 → 2★
₹1,000 → 3★

Legendary
₹1,000 → 1★
₹1,200 → 2★
₹1,400 → 3★

Cosmic
₹2,000 → 1★
₹2,500 → 2★
₹3,000 → 3★`;

    await ctx.answerCbQuery();
    await ctx.editMessageText(message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '⬅️ Back', callback_data: 'help_main' }]
            ]
        }
    });
});


// ==================== HELP: SUPPORT ====================

bot.action('help_support', async (ctx) => {

    const message =
`🆘 ALIENOID HUNT — SUPPORT

Our official support group is currently being prepared.

Please check back soon! 🔱`;

    await ctx.answerCbQuery();
    await ctx.editMessageText(message, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '⬅️ Back', callback_data: 'help_main' }]
            ]
        }
    });
});


// ==================== HELP: BACK ====================

bot.action('help_main', async (ctx) => {

    const message =
`🔱 ALIENOID HUNT

👽 Hunt. Capture. Battle. Collect.

Welcome to Alienoid Hunt, Hunter!

Choose a category below to learn how the game works. 👇`;

    await ctx.answerCbQuery();
    await ctx.editMessageText(message, helpKeyboard);
});

bot.launch().then(() => console.log('🤖 Alienoid Hunt Bot is online!'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
