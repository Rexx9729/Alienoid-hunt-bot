const { Telegraf, session } = require('telegraf');
const mongoose = require('mongoose');
const express = require('express');
const { generateAlienStats } = require('./services/alienGenerator');
const Alien = require('./models/Alien');
const {
    spawnWildAlien,
    getCaptureChance,
    attemptCapture,
    getHuntReward,
    HUNT_COST
} = require('./services/huntEngine');

const {
    getFirstTurn,
    calculateDamage,
    getIncomingDamageMultiplier,
    calculateHealerxRecovery,
    createHpBar
} = require('./services/battleEngine');
const { registerHunt } = require('./services/hunt');
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
const ALIEN_DATABASE_CHANNEL_ID =
    process.env.ALIEN_DATABASE_CHANNEL_ID;
const OWNER_ID = Number(process.env.OWNER_ID);

if (
    !BOT_TOKEN ||
    !MONGO_URI ||
    !ALIEN_DATABASE_CHANNEL_ID ||
!OWNER_ID
) {
    console.error(
        '❌ Error: BOT_TOKEN, MONGO_URI or ALIEN_DATABASE_CHANNEL_ID is missing!'
    );
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
    huntProgress: {
    type: Number,
    default: 0
},
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
    deck: {
    type: [String],
    default: []
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
bot.use(
    session({
        defaultSession: () => ({})
    })
);
registerHunt(bot, User);
// ==================== ADD ALIEN SESSION CONTROL ====================

const ADD_ALIEN_TIMEOUT = 2 * 60 * 1000; // 2 minutes
const addAlienTimers = new Map();

function clearAddAlienSession(ctx) {
    const chatId = ctx.chat?.id;

    if (chatId && addAlienTimers.has(chatId)) {
        clearTimeout(addAlienTimers.get(chatId));
        addAlienTimers.delete(chatId);
    }

    if (ctx.session) {
        ctx.session.addAlien = null;
    }
}

function startAddAlienSession(ctx) {
    const chatId = ctx.chat.id;

    // Remove old timer/session
    if (addAlienTimers.has(chatId)) {
        clearTimeout(addAlienTimers.get(chatId));
    }

    ctx.session.addAlien = {
        step: 'name'
    };

    const timer = setTimeout(async () => {
        if (ctx.session?.addAlien) {
            ctx.session.addAlien = null;
            addAlienTimers.delete(chatId);

            try {
                await ctx.reply(
                    '⌛ SESSION EXPIRED\n\n' +
                    'The Add Alien session expired after 2 minutes.\n\n' +
                    'Please use /addalien to try again.'
                );
            } catch (error) {
                console.error('❌ Session expiry reply error:', error);
            }
        }
    }, ADD_ALIEN_TIMEOUT);

    addAlienTimers.set(chatId, timer);
                        }
// ==================== ALIENOID ECONOMY ====================



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
// ==================== ADD ALIEN — CANCEL ====================

bot.command('cancel', async (ctx) => {

    if (!ctx.session?.addAlien) {
        return ctx.reply(
            'ℹ️ No Add Alien operation is currently active.'
        );
    }

    clearAddAlienSession(ctx);

    await ctx.reply(
        '❌ ADD ALIEN CANCELLED\n\n' +
        'The current operation has been cancelled.'
    );
});
// ==================== ADD ALIEN — COMMAND INTERRUPT ====================

bot.use(async (ctx, next) => {

    const text = ctx.message?.text;

    if (
        ctx.session?.addAlien &&
        typeof text === 'string' &&
        text.startsWith('/')
    ) {

        const command = text
            .split(/\s+/)[0]
            .toLowerCase();

        // /addalien is allowed to restart the session
        // /cancel has its own handler
        if (
            command !== '/addalien' &&
            command !== '/cancel'
        ) {
            clearAddAlienSession(ctx);

            await ctx.reply(
                '❌ ADD ALIEN CANCELLED\n\n' +
                `Command ${command} was used, so the current Add Alien operation was cancelled.`
            );
        }
    }

    return next();
});
// ==================== ADD ALIEN ====================

bot.command('addalien', async (ctx) => {

    console.log('🔥 ADDALIEN COMMAND RECEIVED');
    if (ctx.from.id !== OWNER_ID) {
        return ctx.reply(
            '❌ ACCESS DENIED\n\n' +
            'Only the Alienoid owner can add new aliens.'
        );
    }
    ctx.session ??= {};

       startAddAlienSession(ctx);

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
            { text: '🌀 Gravity', callback_data: 'alien_element_Gravity' },
            { text: '☢️ Nuclear', callback_data: 'alien_element_Nuclear' }
        ],
        [
            { text: '🔆 Plasma', callback_data: 'alien_element_Plasma' }
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
        // ==================== POST TO ALIENOID DATABASE ====================

const databasePost =
`👽 <b>${generated.name}</b>

⭐ <b>Rarity:</b> ${generated.rarity}
🌌 <b>Element:</b> ${generated.element}

❤️ <b>HP:</b> ${generated.maxHp}
⚔️ <b>Base Attack:</b> ${generated.baseAttack}
🛡️ <b>Defense:</b> ${generated.defense}
⚡ <b>Speed:</b> ${generated.speed}

🥊 <b>ATTACKS</b>
1. ${generated.attacks[0].name} — ${generated.attacks[0].damage} DMG
2. ${generated.attacks[1].name} — ${generated.attacks[1].damage} DMG
3. ${generated.attacks[2].name} — ${generated.attacks[2].damage} DMG

💰 <b>Kill Reward:</b> ₹${economy.killReward}

🎯 <b>Spawn Threshold:</b> ${economy.spawnThreshold} hunts`;

await ctx.telegram.sendPhoto(
    ALIEN_DATABASE_CHANNEL_ID,
    imageFileId,
    {
        caption: databasePost,
        parse_mode: 'HTML'
    }
);

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

        clearAddAlienSession(ctx);

    } catch (error) {

        console.error('❌ Add Alien Error:', error);

        clearAddAlienSession(ctx);

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

    // ==================== STARTER ALIEN ====================

    const basicAliens =
        await Alien.find({
            rarity: 'Basic'
        });

    if (!basicAliens.length) {

        console.error(
            '❌ No Basic aliens found for starter reward.'
        );

        return ctx.reply(
            '❌ Starter alien could not be assigned.\n\n' +
            'Please contact the owner.'
        );
    }

    // Pick ONE random Basic alien
    const starter =
        basicAliens[
            Math.floor(
                Math.random() * basicAliens.length
            )
        ];

    // Create player's own copy
    const starterAlien = {

        alienId:
            new mongoose.Types.ObjectId().toString(),

        name:
            starter.name,

        nickname:
            starter.name,

        rarity:
            starter.rarity,

        star: 0,

        hp:
            Number(starter.maxHp || 1),

        maxHp:
            Number(starter.maxHp || 1),

        atk:
            Number(starter.baseAttack || 1),

        def:
            Number(starter.defense || 0),

        element:
            starter.element || 'Physical',

        fileId:
            starter.imageFileId || ''
    };

    user = new User({

        userId,
        username,

        rupees: 1000,

        aliens: [
            starterAlien
        ]
    });

    await user.save();

    return ctx.reply(
        `🔱 Hello ${username}, welcome to the Alienoid ||\n\n` +

        `🎉 New Login Rewards : ₹1,000\n` +

        `👽 Your First Companion : ` +
        `<b>${starter.name}</b>\n` +

        `⭐ Rarity : <b>${starter.rarity}</b>\n\n` +

        `START NOW YOUR THRILLER JOURNEY ⚡`,
        {
            parse_mode: 'HTML'
        }
    );
    }
    else {
    return ctx.reply(
        `🔱HELLO ${username} Welcome to Alienoid\n` +
        `How can I help you?\n` +
        `Type /for help !!`
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

// ==================== ALIEN COLLECTION / BAG ====================

const BAG_PAGE_SIZE = 15;

function buildBagMessage(user, page = 0) {

    const aliens = user.aliens || [];

    // Group same aliens together
    const grouped = new Map();

    for (const alien of aliens) {

        const name =
            String(
                alien.nickname ||
                alien.name ||
                'Unknown Alien'
            ).trim();

        if (!grouped.has(name)) {
            grouped.set(name, 0);
        }

        grouped.set(
            name,
            grouped.get(name) + 1
        );
    }

    const collection = Array.from(grouped.entries());

    const totalPages =
        Math.max(
            1,
            Math.ceil(collection.length / BAG_PAGE_SIZE)
        );

    // Safety
    page = Math.max(
        0,
        Math.min(page, totalPages - 1)
    );

    const start =
        page * BAG_PAGE_SIZE;

    const currentPage =
        collection.slice(
            start,
            start + BAG_PAGE_SIZE
        );

    let msg =
`👽 <b>ALIEN COLLECTION</b> [${collection.length}]
────────────────`;

    if (currentPage.length === 0) {

        msg +=
`\n🎒 Your alien collection is empty.`;

    } else {

        currentPage.forEach(
            ([name, count], index) => {

                msg +=
`\n${start + index + 1}. ${name} ${count}x`;
            }
        );
    }

    msg +=
`\n────────────────`;

    return {
        message: msg,
        page,
        totalPages
    };
}


// ==================== /BAG ====================

bot.command(['bag', 'aliens'], async (ctx) => {

    try {

        const user =
            await User.findOne({
                userId: ctx.from.id
            });

        if (!user) {
            return ctx.reply(
                '⚠️ Please send /start first!'
            );
        }

        const {
            message,
            page,
            totalPages
        } = buildBagMessage(user, 0);

        const buttons = [];

        if (totalPages > 1) {

            buttons.push([
                {
                    text: '⬅️ Previous',
                    callback_data: 'bag_page_0'
                },
                {
                    text: `Page 1/${totalPages}`,
                    callback_data: 'bag_current'
                },
                {
                    text: 'Next ➡️',
                    callback_data: 'bag_page_1'
                }
            ]);

        }

        return ctx.reply(
            message,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: buttons
                }
            }
        );

    } catch (error) {

        console.error(
            '❌ /bag error:',
            error
        );

        return ctx.reply(
            '❌ Could not load your alien collection.'
        );
    }
});


// ==================== BAG PAGINATION ====================

bot.action(/^bag_page_(\d+)$/, async (ctx) => {

    try {

        const page =
            Number(ctx.match[1]);

        const user =
            await User.findOne({
                userId: ctx.from.id
            });

        if (!user) {
            return ctx.answerCbQuery(
                '⚠️ User not found.',
                { show_alert: true }
            );
        }

        const {
            message,
            page: safePage,
            totalPages
        } = buildBagMessage(
            user,
            page
        );

        const buttons = [];

        const row = [];

        if (safePage > 0) {

            row.push({
                text: '⬅️ Previous',
                callback_data:
                    `bag_page_${safePage - 1}`
            });
        }

        row.push({
            text:
                `Page ${safePage + 1}/${totalPages}`,
            callback_data: 'bag_current'
        });

        if (safePage < totalPages - 1) {

            row.push({
                text: 'Next ➡️',
                callback_data:
                    `bag_page_${safePage + 1}`
            });
        }

        if (totalPages > 1) {
            buttons.push(row);
        }

        await ctx.answerCbQuery();

        return ctx.editMessageText(
            message,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: buttons
                }
            }
        );

    } catch (error) {

        console.error(
            '❌ Bag pagination error:',
            error
        );

        return ctx.answerCbQuery(
            '❌ Could not load this page.',
            { show_alert: true }
        );
    }
});


// ==================== BAG CURRENT PAGE ====================

bot.action('bag_current', async (ctx) => {

    return ctx.answerCbQuery(
        '📖 You are already on this page.'
    );
});
// ==================== ALIEN DECK — SET / OUT ====================

// /set alienname
// /set alienname 1s
// /set alienname 2s
// /set alienname 3s

bot.command('set', async (ctx) => {
    try {
        const userId = ctx.from.id;

        const user = await User.findOne({ userId });

        if (!user) {
            return ctx.reply('⚠️ Please send /start first!');
        }

        if (!user.aliens || user.aliens.length === 0) {
            return ctx.reply(
                '🎒 Your alien bag is empty!'
            );
        }

        // Maximum 4 aliens in deck
        if (user.deck.length >= 4) {
            return ctx.reply(
                '❌ Your deck is full!\n\n' +
                'Maximum 4 aliens can be set.'
            );
        }

        const input = ctx.message.text
            .trim()
            .replace(/^\/set(?:@\w+)?\s*/i, '');

        if (!input) {
            return ctx.reply(
                '⚠️ Enter an alien name.\n\n' +
                'Examples:\n' +
                '/set Atomix\n' +
                '/set Atomix 1s\n' +
                '/set Atomix 2s\n' +
                '/set Atomix 3s'
            );
        }

        // Check for star suffix
        let star = 0;
        let alienName = input;

        const starMatch = input.match(/\s+([123]s)$/i);

        if (starMatch) {
            star = Number(starMatch[1].charAt(0));
            alienName = input
                .replace(/\s+[123]s$/i, '')
                .trim();
        }

        if (!alienName) {
            return ctx.reply(
                '⚠️ Please enter a valid alien name.'
            );
        }

        // Find alien by name/nickname + exact star
        const alien = user.aliens.find(a => {

            const nameMatch =
                String(a.name || '').toLowerCase() ===
                alienName.toLowerCase();

            const nicknameMatch =
                String(a.nickname || '').toLowerCase() ===
                alienName.toLowerCase();

            return (
                (nameMatch || nicknameMatch) &&
                Number(a.star || 0) === star
            );
        });

        if (!alien) {
            const stars = star > 0
                ? `${'⭐'.repeat(star)} `
                : '';

            return ctx.reply(
                `❌ ${stars}${alienName} was not found in your bag.\n\n` +
                `Check the alien name and star level.`
            );
        }

        // Alien must have an ID
        if (!alien.alienId) {
            return ctx.reply(
                '❌ This alien is missing its Alien ID.\n\n' +
                'This alien cannot be added to the deck.'
            );
        }

        // Prevent same alien instance from being added twice
        if (user.deck.includes(alien.alienId)) {
            return ctx.reply(
                `❌ ${alien.star > 0 ? `${'⭐'.repeat(alien.star)} ` : ''}` +
                `${alien.nickname || alien.name} is already in your deck.`
            );
        }

        // Add alien ID to deck
        user.deck.push(alien.alienId);

        await user.save();

        const stars = alien.star > 0
            ? `${'⭐'.repeat(alien.star)} `
            : '';

        return ctx.reply(
            `✅ ALIEN SET!\n\n` +
            `${stars}${alien.nickname || alien.name}\n` +
            `⭐ Rarity: ${alien.rarity}\n` +
            `🌌 Element: ${alien.element}\n\n` +
            `🛸 Deck: ${user.deck.length}/4`
        );

    } catch (error) {
        console.error('❌ /set error:', error);

        return ctx.reply(
            '❌ Something went wrong while setting your alien.'
        );
    }
});


// ==================== REMOVE ALIEN FROM DECK ====================

// /out alienname
// /out alienname 1s
// /out alienname 2s
// /out alienname 3s

bot.command('out', async (ctx) => {
    try {
        const userId = ctx.from.id;

        const user = await User.findOne({ userId });

        if (!user) {
            return ctx.reply('⚠️ Please send /start first!');
        }

        if (!user.deck || user.deck.length === 0) {
            return ctx.reply(
                '🛸 Your deck is already empty!'
            );
        }

        // Minimum 1 alien must remain
        if (user.deck.length === 1) {
            return ctx.reply(
                '❌ Your deck must contain at least 1 alien.\n\n' +
                'You cannot remove your last deck alien.'
            );
        }

        const input = ctx.message.text
            .trim()
            .replace(/^\/out(?:@\w+)?\s*/i, '');

        if (!input) {
            return ctx.reply(
                '⚠️ Enter an alien name.\n\n' +
                'Examples:\n' +
                '/out Atomix\n' +
                '/out Atomix 1s\n' +
                '/out Atomix 2s\n' +
                '/out Atomix 3s'
            );
        }

        // Check for star suffix
        let star = 0;
        let alienName = input;

        const starMatch = input.match(/\s+([123]s)$/i);

        if (starMatch) {
            star = Number(starMatch[1].charAt(0));
            alienName = input
                .replace(/\s+[123]s$/i, '')
                .trim();
        }

        if (!alienName) {
            return ctx.reply(
                '⚠️ Please enter a valid alien name.'
            );
        }

        // Find the requested alien inside the deck
        let deckIndex = -1;
        let alien = null;

        for (let i = 0; i < user.deck.length; i++) {

            const deckAlienId = user.deck[i];

            const foundAlien = user.aliens.find(
                a => a.alienId === deckAlienId
            );

            if (!foundAlien) continue;

            const nameMatch =
                String(foundAlien.name || '').toLowerCase() ===
                alienName.toLowerCase();

            const nicknameMatch =
                String(foundAlien.nickname || '').toLowerCase() ===
                alienName.toLowerCase();

            if (
                (nameMatch || nicknameMatch) &&
                Number(foundAlien.star || 0) === star
            ) {
                deckIndex = i;
                alien = foundAlien;
                break;
            }
        }

        if (deckIndex === -1 || !alien) {
            const stars = star > 0
                ? `${'⭐'.repeat(star)} `
                : '';

            return ctx.reply(
                `❌ ${stars}${alienName} is not in your deck.`
            );
        }

        // Remove only from deck
        user.deck.splice(deckIndex, 1);

        await user.save();

        const stars = alien.star > 0
            ? `${'⭐'.repeat(alien.star)} `
            : '';

        return ctx.reply(
            `✅ ALIEN REMOVED FROM DECK!\n\n` +
            `${stars}${alien.nickname || alien.name}\n\n` +
            `🛸 Deck: ${user.deck.length}/4`
        );

    } catch (error) {
        console.error('❌ /out error:', error);

        return ctx.reply(
            '❌ Something went wrong while removing your alien.'
        );
    }
});
// ==================== HUNT — SPAWN ====================

/*bot.command('hunt', async (ctx) => {

    try {

        // Hunt is DM only
        if (ctx.chat.type !== 'private') {
            return ctx.reply(
                '⚠️ /hunt can only be used in bot DM.'
            );
        }

        const userId = ctx.from.id;

        const user =
            await User.findOne({ userId });

        if (!user) {
            return ctx.reply(
                '⚠️ Please send /start first!'
            );
        }

        // Check Rupees
        if (user.rupees < HUNT_COST) {
            return ctx.reply(
                `❌ Not enough Rupees!\n\n` +
                `💰 Your Balance: ₹${user.rupees}\n` +
                `🎯 Hunt Cost: ₹${HUNT_COST}`
            );
        }

        // Deck required
        if (!user.deck || user.deck.length === 0) {
            return ctx.reply(
                '⚠️ Your alien deck is empty!\n\n' +
                'Use /set <alienname> first.'
            );
        }

        // ==================== PROGRESSION ====================

        user.hunts += 1;

        user.huntProgress =
            (user.huntProgress || 0) + 1;

        // Pay hunt cost
        user.rupees -= HUNT_COST;

        await user.save();

        // ==================== SPAWN ====================

        const wildAlien =
            await spawnWildAlien(
                user.huntProgress
            );

        // ==================== HUNT SESSION ====================

        ctx.session ??= {};

        ctx.session.hunt = {
            wildAlienId: wildAlien._id.toString(),
            wildAlienName: wildAlien.name,
            rarity: wildAlien.rarity,
            currentHp: wildAlien.maxHp,
            maxHp: wildAlien.maxHp,
            huntProgress: user.huntProgress
        };

        await ctx.reply(
            `👽 WILD ALIEN SPOTTED!\n\n` +

            `👽 ${wildAlien.name}\n` +
            `⭐ Rarity: ${wildAlien.rarity}\n` +
            `🌌 Element: ${wildAlien.element}\n\n` +

            `❤️ HP: ${wildAlien.maxHp}\n\n` +

            `🎯 Hunt Progress: ${user.huntProgress}\n\n` +

            `What do you want to do?`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '⚔️ Hunt',
                                callback_data: 'hunt_start'
                            },
                            {
                                text: '🏃 Run',
                                callback_data: 'hunt_run'
                            },
                            {
                                text: '🔍 Scan',
                                callback_data: 'hunt_scan'
                            }
                        ]
                    ]
                }
            }
        );

    } catch (error) {

        console.error('❌ Hunt Spawn Error:', error);

        return ctx.reply(
            '❌ Failed to start hunt.\n\n' +
            `Error: ${error.message}`
        );
    }
});
// ==================== HUNT — RUN ====================

bot.action('hunt_run', async (ctx) => {

    if (!ctx.session?.hunt) {
        return ctx.answerCbQuery(
            '⚠️ No active hunt.'
        );
    }

    ctx.session.hunt = null;

    await ctx.answerCbQuery(
        '🏃 You escaped!'
    );

    await ctx.editMessageText(
        `🏃 HUNT CANCELLED\n\n` +
        `You ran away from the wild alien.\n\n` +
        `Use /hunt to search again.`
    );
});
// ==================== HUNT — SCAN MENU ====================

bot.action('hunt_scan', async (ctx) => {

    const hunt = ctx.session?.hunt;

    if (!hunt) {
        return ctx.answerCbQuery(
            '⚠️ No active hunt.'
        );
    }

    // Create scan counter for this hunt
    if (typeof hunt.scanAttempts !== 'number') {
        hunt.scanAttempts = 0;
    }

    // Maximum 3 scan attempts per hunt
    if (hunt.scanAttempts >= 3) {
        return ctx.answerCbQuery(
            '❌ Maximum 3 scans used in this hunt.',
            { show_alert: true }
        );
    }

    const alien =
        await Alien.findById(hunt.wildAlienId);

    if (!alien) {
        ctx.session.hunt = null;

        return ctx.answerCbQuery(
            '⚠️ Wild alien no longer exists.',
            { show_alert: true }
        );
    }

    await ctx.answerCbQuery();

    await ctx.editMessageText(
        `🔍 ALIEN SCAN\n\n` +

        `👽 ${alien.name}\n` +
        `🌌 Element: ${alien.element}\n` +
        `⭐ Rarity: ${alien.rarity}\n\n` +

        `🔎 Scans used: ${hunt.scanAttempts}/3\n\n` +

        `Choose a scan:`,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '🔎 Normal Scan',
                            callback_data: 'hunt_scan_normal'
                        }
                    ],
                    [
                        {
                            text: '⚠️ S.Scan',
                            callback_data: 'hunt_scan_super'
                        }
                    ],
                    [
                        {
                            text: '☣️ M.Scan',
                            callback_data: 'hunt_scan_mega'
                        }
                    ],
                    [
                        {
                            text: '☢️ A.Scan',
                            callback_data: 'hunt_scan_absolute'
                        }
                    ],
                    [
                        {
                            text: '🔙 Back',
                            callback_data: 'hunt_scan_back'
                        }
                    ]
                ]
            }
        }
    );
});
// ==================== HUNT — SCAN BACK ====================

bot.action('hunt_scan_back', async (ctx) => {

    const hunt = ctx.session?.hunt;

    if (!hunt) {
        return ctx.answerCbQuery(
            '⚠️ No active hunt.'
        );
    }

    const alien =
        await Alien.findById(hunt.wildAlienId);

    if (!alien) {
        ctx.session.hunt = null;

        return ctx.answerCbQuery(
            '⚠️ Wild alien no longer exists.'
        );
    }

    await ctx.answerCbQuery();

    await ctx.editMessageText(
        `👽 WILD ALIEN SPOTTED!\n\n` +

        `👽 ${alien.name}\n` +
        `⭐ Rarity: ${alien.rarity}\n` +
        `🌌 Element: ${alien.element}\n\n` +

        `❤️ HP: ${hunt.currentHp}/${hunt.maxHp}\n\n` +

        `What do you want to do?`,
        {
            reply_markup: {
                inline_keyboard: [
                    [
                        {
                            text: '⚔️ Hunt',
                            callback_data: 'hunt_start'
                        },
                        {
                            text: '🏃 Run',
                            callback_data: 'hunt_run'
                        },
                        {
                            text: '🔍 Scan',
                            callback_data: 'hunt_scan'
                        }
                    ]
                ]
            }
        }
    );
});
// ==================== HUNT — SCAN ATTEMPT ====================

bot.action(
    /^hunt_scan_(normal|super|mega|absolute)$/,
    async (ctx) => {

        try {

            const hunt = ctx.session?.hunt;

            if (!hunt) {
                return ctx.answerCbQuery(
                    '⚠️ No active hunt.',
                    { show_alert: true }
                );
            }

            // Maximum 3 scan attempts per hunt
            if (hunt.scanAttempts >= 3) {
                return ctx.answerCbQuery(
                    '❌ Maximum 3 scans used in this hunt.',
                    { show_alert: true }
                );
            }

            const scanType = ctx.match[1];

            const user =
                await User.findOne({
                    userId: ctx.from.id
                });

            if (!user) {
                return ctx.answerCbQuery(
                    '⚠️ Please send /start first.',
                    { show_alert: true }
                );
            }

            // Map scan type to inventory field
            const inventoryMap = {
                normal: null,
                super: 'superScan',
                mega: 'megaScan',
                absolute: 'absoluteScan'
            };

            const inventoryField =
                inventoryMap[scanType];

            // Normal Scan does not use inventory
            if (inventoryField) {

                if (
                    !user.inventory ||
                    user.inventory[inventoryField] <= 0
                ) {
                    return ctx.answerCbQuery(
                        '❌ You do not have this scan.',
                        { show_alert: true }
                    );
                }

                // Consume scan
                user.inventory[inventoryField] -= 1;

                await user.save();
            }

            // Count this attempt
            hunt.scanAttempts += 1;

            await ctx.answerCbQuery();

            const scanName = {
                normal: '🔎 Normal Scan',
                super: '⚠️ Super Scan',
                mega: '☣️ Mega Scan',
                absolute: '☢️ Absolute Scan'
            };

            await ctx.editMessageText(
                `${scanName[scanType]}\n\n` +
                `👽 ${hunt.wildAlienName}\n\n` +
                `🔍 Scan attempt: ` +
                `${hunt.scanAttempts}/3\n\n` +
                `Choose another scan or go back.`,
                {
                    reply_markup: {
                        inline_keyboard: [
                            [
                                {
                                    text: '🔎 Normal Scan',
                                    callback_data:
                                        'hunt_scan_normal'
                                }
                            ],
                            [
                                {
                                    text: '⚠️ S.Scan',
                                    callback_data:
                                        'hunt_scan_super'
                                }
                            ],
                            [
                                {
                                    text: '☣️ M.Scan',
                                    callback_data:
                                        'hunt_scan_mega'
                                }
                            ],
                            [
                                {
                                    text: '☢️ A.Scan',
                                    callback_data:
                                        'hunt_scan_absolute'
                                }
                            ],
                            [
                                {
                                    text: '🔙 Back',
                                    callback_data:
                                        'hunt_scan_back'
                                }
                            ]
                        ]
                    }
                }
            );

        } catch (error) {

            console.error(
                '❌ Scan Error:',
                error
            );

            return ctx.answerCbQuery(
                '❌ Scan failed.',
                { show_alert: true }
            );
        }
    }
);*/
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

// ==================== ALIEN GIFT ====================

bot.command('agive', async (ctx) => {

    try {

        const senderId = ctx.from.id;

        // Must reply to another player's message
        if (!ctx.message.reply_to_message) {
            return ctx.reply(
                '⚠️ Reply to a player\'s message and use:\n\n' +
                '/agive <alien name>\n\n' +
                'Example:\n' +
                '/agive Heatblast'
            );
        }

        const receiverId =
            ctx.message.reply_to_message.from.id;

        // Prevent gifting to yourself
        if (senderId === receiverId) {
            return ctx.reply(
                '❌ You cannot gift an alien to yourself.'
            );
        }

        // Get alien name
        const args =
            ctx.message.text
                .trim()
                .split(/\s+/);

        const alienName =
            args.slice(1).join(' ').trim();

        if (!alienName) {
            return ctx.reply(
                '⚠️ Enter the alien name.\n\n' +
                'Example:\n' +
                '/agive Heatblast'
            );
        }

        // Find both users
        const sender =
            await User.findOne({
                userId: senderId
            });

        const receiver =
            await User.findOne({
                userId: receiverId
            });

        if (!sender) {
            return ctx.reply(
                '⚠️ Please send /start first!'
            );
        }

        if (!receiver) {
            return ctx.reply(
                '❌ This player has not started Alienoid Hunt yet.'
            );
        }

        if (
            !sender.aliens ||
            sender.aliens.length === 0
        ) {
            return ctx.reply(
                '🎒 You do not have any aliens to gift.'
            );
        }

        // Find ONE matching alien
        const alienIndex =
            sender.aliens.findIndex(
                alien =>
                    String(
                        alien.nickname ||
                        alien.name ||
                        ''
                    ).toLowerCase() ===
                    alienName.toLowerCase()
            );

        if (alienIndex === -1) {
            return ctx.reply(
                `❌ You don't have "${alienName}" in your bag.`
            );
        }

        // Remove exactly ONE alien
        const giftedAlien =
            sender.aliens[alienIndex];

        sender.aliens.splice(
            alienIndex,
            1
        );

        // If this alien was in sender's deck,
        // remove it from the deck too.
        if (sender.deck?.length) {

            sender.deck =
                sender.deck.filter(
                    id =>
                        id !== giftedAlien.alienId
                );
        }

        // Create a new unique alien ID
        // so sender and receiver never share the same instance ID.
        const giftedAlienData = {

            alienId:
                new mongoose.Types.ObjectId().toString(),

            name:
                giftedAlien.name ||
                giftedAlien.nickname ||
                'Unknown Alien',

            nickname:
                giftedAlien.nickname ||
                giftedAlien.name ||
                'Unknown Alien',

            rarity:
                giftedAlien.rarity,

            star:
                Number(
                    giftedAlien.star || 0
                ),

            level:
                Number(
                    giftedAlien.level || 1
                ),

            hp:
                giftedAlien.hp,

            maxHp:
                giftedAlien.maxHp,

            atk:
                giftedAlien.atk,

            def:
                giftedAlien.def,

            element:
                giftedAlien.element,

            fileId:
                giftedAlien.fileId || ''
        };

        receiver.aliens.push(
            giftedAlienData
        );

        // Save both users
        await sender.save();
        await receiver.save();

        const senderName =
            sender.username ||
            ctx.from.first_name ||
            'Hunter';

        const receiverName =
            receiver.username ||
            ctx.message.reply_to_message
                .from.first_name ||
            'Hunter';

        return ctx.reply(
            `🎉 "${senderName}" Gifted ` +
            `"${giftedAlienData.nickname}" ` +
            `to "${receiverName}"\n` +
            `Successfully!!`
        );

    } catch (error) {

        console.error(
            '❌ /agive error:',
            error
        );

        return ctx.reply(
            '❌ Alien gift failed due to a temporary error.'
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
console.log('🚀 Starting Telegram Bot...');
bot.launch()
    .then(() => {
        console.log('🤖 Alienoid Telegram Bot Started Successfully!');
    })
    .catch((error) => {
        console.error('❌ Telegram Bot Launch Error:', error);
    });

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
