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
        admins: {
        type: [Number],
        default: []
    },
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
        speed: { type: Number, default: 0 },
        element: String,
        fileId: { type: String, default: '' }
    }]
});

const User = mongoose.model('User', userSchema);

// ==================== REDEEM CODE MODEL ====================

const redeemCodeSchema = new mongoose.Schema({

    code: {
        type: String,
        required: true,
        unique: true
    },

    reward: {
        type: Number,
        required: true,
        min: 1
    },

    redeemLimit: {
        type: Number,
        required: true,
        min: 1
    },

    redeemedUsers: {
        type: [Number],
        default: []
    },

    active: {
        type: Boolean,
        default: true
    }

}, {
    timestamps: true
});

const RedeemCode =
    mongoose.model(
        'RedeemCode',
        redeemCodeSchema
    );

// ==================== REDEEM CODE GENERATOR ====================

function generateRedeemCode() {

    const characters =
        'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    function makePart() {

        let part = '';

        for (let i = 0; i < 4; i++) {

            part +=
                characters[
                    Math.floor(
                        Math.random() *
                        characters.length
                    )
                ];
        }

        return part;
    }

    return (
        `${makePart()}-` +
        `${makePart()}-` +
        `${makePart()}`
    );
}

// ==================== ADMIN SYSTEM ====================

async function isAdmin(userId) {

    if (Number(userId) === OWNER_ID) {
        return true;
    }

    const owner =
        await User.findOne({
            userId: OWNER_ID
        });

    if (!owner) {
        return false;
    }

    return (
        Array.isArray(owner.admins) &&
        owner.admins.includes(Number(userId))
    );
}
// Bot Config
const bot = new Telegraf(BOT_TOKEN);
bot.use(
    session({
        defaultSession: () => ({})
    })
);

// ==================== GLOBAL CALLBACK DOUBLE-TAP GUARD ====================

const activeCallbacks = new Set();
const CALLBACK_COOLDOWN = 2000; // 2 seconds

bot.use(async (ctx, next) => {

    // Only protect Telegram inline-button callbacks
    if (!ctx.callbackQuery) {
        return next();
    }

    const userId = ctx.from?.id;
    const messageId =
        ctx.callbackQuery?.message?.message_id || 'inline';

    const guardKey = `${userId}:${messageId}`;

    // Ignore rapid repeated taps on the same message
    if (activeCallbacks.has(guardKey)) {

        try {
            await ctx.answerCbQuery(
                '⏳ Please wait...',
                {
                    show_alert: false
                }
            );
        } catch (error) {
            // Ignore callback answer errors
        }

        return;
    }

    // Lock callback
    activeCallbacks.add(guardKey);

    try {

        // Continue to the actual button handler
        await next();

    } catch (error) {

        console.error(
            '❌ Callback handler error:',
            error
        );

        try {
            await ctx.answerCbQuery(
                '❌ Something went wrong. Please try again.',
                {
                    show_alert: true
                }
            );
        } catch (answerError) {
            // Ignore callback answer errors
        }

    } finally {

        // Unlock after short cooldown
        setTimeout(() => {
            activeCallbacks.delete(guardKey);
        }, CALLBACK_COOLDOWN);
    }
});

// ==================== END GLOBAL CALLBACK GUARD ====================

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
// ==================== STAR MERGE CONFIG ====================

const STAR_MERGE_FEES = {
    Basic: {
        1: 200,
        2: 400,
        3: 600
    },

    Common: {
        1: 400,
        2: 600,
        3: 800
    },

    Rare: {
        1: 600,
        2: 800,
        3: 1000
    },

    Legendary: {
        1: 1000,
        2: 1200,
        3: 1400
    },

    Cosmic: {
        1: 2000,
        2: 2500,
        3: 3000
    },

    God: {
        1: 10000,
        2: 15000,
        3: 20000
    }
};

// Star power multiplier
const STAR_POWER_MULTIPLIER = {
    0: 1.00,
    1: 1.30,
    2: 1.60,
    3: 2.00
};

// ==================== TELEGRAM COMMAND MENU ====================

// Private DM command menu
bot.telegram.setMyCommands([
    { command: 'start', description: 'Start Alienoid Hunt' },
    { command: 'profile', description: 'View your Hunter profile' },
    { command: 'inventory', description: 'View your items and scans' },
    { command: 'alist', description: 'View your collected aliens' },
    { command: 'merge', description: 'Merge 3 identical aliens' },
    { command: 'stats', description: 'View your alien stats' },
    { command: 'check', description: 'Check alien database info' },
    { command: 'hunt', description: 'Hunt a wild alien' },
    { command: 'daily', description: 'Claim your daily ₹500 reward' },
    { command: 'redeem', description: 'Redeem an Alienoid reward code you can get codes from Alienoid support group' },
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
    { command: 'alist', description: 'View your collected aliens' },
    { command: 'merge', description: 'Merge 3 identical aliens' },
    { command: 'stats', description: 'View your alien stats' },
    { command: 'check', description: 'Check alien database info' },
    { command: 'daily', description: 'Claim your daily ₹500 reward' },
    { command: 'redeem', description: 'Redeem an Alienoid reward code. you can get codes from Alienoid support group' },
    { command: 'rpay', description: 'Send Rupees to another player' },
    { command: 'agive', description: 'Give an alien to another player' },
    { command: 'trade', description: 'Trade aliens with another player' },
    { command: 'give', description: 'Give an item to another player' },
    { command: 'donate', description: 'Donate a scan to another player' },
    { command: 'hunt', description: 'Hunt a wild alien' },
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

// ==================== /ADDADMIN ====================

bot.command('addadmin', async (ctx) => {

    try {

        // Only owner can add admins
        if (ctx.from.id !== OWNER_ID) {
            return ctx.reply(
                '❌ ACCESS DENIED\n\n' +
                'Only the Alienoid owner can manage admins.'
            );
        }

        const replied =
            ctx.message.reply_to_message?.from;

        if (!replied) {
            return ctx.reply(
                '⚠️ Reply to a user\'s message with:\n\n' +
                '/addadmin'
            );
        }

        const targetId =
            Number(replied.id);

        if (targetId === OWNER_ID) {
            return ctx.reply(
                'ℹ️ The owner already has admin access.'
            );
        }

        const owner =
            await User.findOne({
                userId: OWNER_ID
            });

        if (!owner) {
            return ctx.reply(
                '❌ Owner profile was not found in database.'
            );
        }

        if (!Array.isArray(owner.admins)) {
            owner.admins = [];
        }

        if (owner.admins.includes(targetId)) {
            return ctx.reply(
                'ℹ️ This user is already an Alienoid admin.'
            );
        }

        owner.admins.push(targetId);

        await owner.save();

        const name =
            replied.username
                ? `@${replied.username}`
                : replied.first_name || 'User';

        return ctx.reply(
            `✅ ADMIN ADDED\n\n` +
            `👤 ${name}\n` +
            `🆔 ${targetId}\n\n` +
            `This user can now use /addalien and /deletealien.`
        );

    } catch (error) {

        console.error(
            '❌ /addadmin error:',
            error
        );

        return ctx.reply(
            '❌ Failed to add admin.'
        );
    }
});


// ==================== /REMOVEADMIN ====================

bot.command('removeadmin', async (ctx) => {

    try {

        // Only owner can remove admins
        if (ctx.from.id !== OWNER_ID) {
            return ctx.reply(
                '❌ ACCESS DENIED\n\n' +
                'Only the Alienoid owner can manage admins.'
            );
        }

        const replied =
            ctx.message.reply_to_message?.from;

        if (!replied) {
            return ctx.reply(
                '⚠️ Reply to an admin\'s message with:\n\n' +
                '/removeadmin'
            );
        }

        const targetId =
            Number(replied.id);

        const owner =
            await User.findOne({
                userId: OWNER_ID
            });

        if (!owner) {
            return ctx.reply(
                '❌ Owner profile was not found in database.'
            );
        }

        if (!Array.isArray(owner.admins)) {
            owner.admins = [];
        }

        const index =
            owner.admins.indexOf(targetId);

        if (index === -1) {
            return ctx.reply(
                'ℹ️ This user is not an Alienoid admin.'
            );
        }

        owner.admins.splice(index, 1);

        await owner.save();

        const name =
            replied.username
                ? `@${replied.username}`
                : replied.first_name || 'User';

        return ctx.reply(
            `✅ ADMIN REMOVED\n\n` +
            `👤 ${name}\n` +
            `🆔 ${targetId}\n\n` +
            `This user no longer has uploader access.`
        );

    } catch (error) {

        console.error(
            '❌ /removeadmin error:',
            error
        );

        return ctx.reply(
            '❌ Failed to remove admin.'
        );
    }
});

// ==================== /REDEEMCODE ====================

bot.command('redeemcode', async (ctx) => {

    try {

        // OWNER ONLY
        if (ctx.from.id !== OWNER_ID) {
            return ctx.reply(
                '❌ ACCESS DENIED\n\n' +
                'Only the Alienoid owner can create redeem codes.'
            );
        }

        const args =
            ctx.message.text
                .trim()
                .split(/\s+/)
                .slice(1);

        if (args.length !== 2) {
            return ctx.reply(
                '⚠️ Invalid format.\n\n' +
                'Use:\n' +
                '/redeemcode <rupees> <user limit>\n\n' +
                'Example:\n' +
                '/redeemcode 1000 10'
            );
        }

        const reward =
            Number(args[0]);

        const redeemLimit =
            Number(args[1]);

        if (
            !Number.isInteger(reward) ||
            reward <= 0
        ) {
            return ctx.reply(
                '❌ Rupees must be a positive whole number.'
            );
        }

        if (
            !Number.isInteger(redeemLimit) ||
            redeemLimit <= 0
        ) {
            return ctx.reply(
                '❌ User redeem limit must be a positive whole number.'
            );
        }

        let code;
        let exists = true;

        while (exists) {

            code =
                generateRedeemCode();

            exists =
                await RedeemCode.exists({
                    code
                });
        }

        await RedeemCode.create({

            code,

            reward,

            redeemLimit,

            redeemedUsers: [],

            active: true
        });

        return ctx.reply(
            `🎁 <b>REDEEM CODE GENERATED!</b>\n\n` +
            `💰 Reward: <b>${reward.toLocaleString()} Rs</b>\n` +
            `👥 Redeem limit: <b>${redeemLimit} users</b>\n` +
            `🔒 One redeem per user\n\n` +
            `🎟 Code:\n` +
            `<code>${code}</code>\n\n` +
            `📢 Share this code with your users!`,
            {
                parse_mode: 'HTML'
            }
        );

    } catch (error) {

        console.error(
            '❌ /redeemcode error:',
            error
        );

        return ctx.reply(
            '❌ Failed to generate redeem code.'
        );
    }
});

// ==================== /REDEEM ====================

bot.command('redeem', async (ctx) => {

    try {

        const args =
            ctx.message.text
                .trim()
                .split(/\s+/)
                .slice(1);

        if (args.length !== 1) {
            return ctx.reply(
                '⚠️ Enter a valid redeem code.\n\n' +
                'Example:\n' +
                '/redeem XXXX-XXXX-XXXX'
            );
        }

        const code =
            args[0]
                .toUpperCase()
                .trim();

        const userId =
            Number(ctx.from.id);

        // Find active code
        const redeemCode =
            await RedeemCode.findOne({
                code,
                active: true
            });

        if (!redeemCode) {
            return ctx.reply(
                '❌ Invalid or expired redeem code.'
            );
        }

        // Same user already redeemed
        if (
            redeemCode.redeemedUsers.includes(
                userId
            )
        ) {
            return ctx.reply(
                '⚠️ You have already redeemed this code!'
            );
        }

        // Limit reached
        if (
            redeemCode.redeemedUsers.length >=
            redeemCode.redeemLimit
        ) {

            redeemCode.active = false;

            await redeemCode.save();

            return ctx.reply(
                '❌ Code limit reached!\n\n' +
                'Stay active to grab new codes.'
            );
        }

        /*
         * Reserve this user's redemption.
         *
         * The database condition checks:
         * - code is still active
         * - user has not redeemed it
         * - limit has not been reached
         *
         * This helps prevent two simultaneous
         * users from taking the same final slot.
         */

        const updatedCode =
            await RedeemCode.findOneAndUpdate(

                {
                    _id: redeemCode._id,

                    active: true,

                    redeemedUsers: {
                        $ne: userId
                    },

                    $expr: {
                        $lt: [
                            {
                                $size:
                                    '$redeemedUsers'
                            },
                            '$redeemLimit'
                        ]
                    }
                },

                {
                    $addToSet: {
                        redeemedUsers:
                            userId
                    }
                },

                {
                    new: true
                }
            );

        // Slot was taken by someone else
        if (!updatedCode) {

            const latestCode =
                await RedeemCode.findById(
                    redeemCode._id
                );

            if (
                latestCode &&
                latestCode.redeemedUsers.includes(
                    userId
                )
            ) {
                return ctx.reply(
                    '⚠️ You have already redeemed this code!'
                );
            }

            if (
                latestCode &&
                latestCode.redeemedUsers.length >=
                latestCode.redeemLimit
            ) {

                await RedeemCode.updateOne(
                    {
                        _id:
                            latestCode._id
                    },
                    {
                        $set: {
                            active: false
                        }
                    }
                );

                return ctx.reply(
                    '❌ Code limit reached!\n\n' +
                    'Stay active to grab new codes.'
                );
            }

            return ctx.reply(
                '❌ This code could not be redeemed. Please try again.'
            );
        }

        // Find user
        const user =
            await User.findOne({
                userId
            });

        if (!user) {

            // Roll back the reserved redemption
            await RedeemCode.updateOne(
                {
                    _id:
                        updatedCode._id
                },
                {
                    $pull: {
                        redeemedUsers:
                            userId
                    }
                }
            );

            return ctx.reply(
                '⚠️ Please send /start first!'
            );
        }

        // Give reward
        user.rupees +=
            redeemCode.reward;

        await user.save();

        // Mark code inactive when final slot is used
        if (
            updatedCode.redeemedUsers.length >=
            updatedCode.redeemLimit
        ) {

            await RedeemCode.updateOne(
                {
                    _id:
                        updatedCode._id
                },
                {
                    $set: {
                        active: false
                    }
                }
            );
        }

        const used =
            updatedCode.redeemedUsers.length;

        const remaining =
            Math.max(
                0,
                updatedCode.redeemLimit - used
            );

        return ctx.reply(
            `🎉 <b>REDEEM SUCCESSFUL!</b>\n\n` +
            `💰 You received <b>${redeemCode.reward.toLocaleString()} Rs</b>.\n\n` +
            `🎟 Code uses: <b>${used}/${redeemCode.redeemLimit}</b>\n` +
            `👥 Remaining: <b>${remaining}</b>`,
            {
                parse_mode: 'HTML'
            }
        );

    } catch (error) {

        console.error(
            '❌ /redeem error:',
            error
        );

        return ctx.reply(
            '❌ Something went wrong while redeeming this code.'
        );
    }
});

// ==================== ADD ALIEN ====================

bot.command('addalien', async (ctx) => {

    console.log('🔥 ADDALIEN COMMAND RECEIVED');
    if (!(await isAdmin(ctx.from.id))) {
    return ctx.reply(
        '❌ ACCESS DENIED\n\n' +
        'Only Alienoid admins can add new aliens.'
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
// ==================== /DELETEALIEN ====================

bot.command('deletealien', async (ctx) => {

    try {

        // Owner + Admins allowed
        if (!(await isAdmin(ctx.from.id))) {
            return ctx.reply(
                '❌ ACCESS DENIED\n\n' +
                'Only Alienoid admins can delete aliens.'
            );
        }

        const input =
            ctx.message.text
                .trim()
                .replace(
                    /^\/deletealien(?:@\w+)?\s*/i,
                    ''
                )
                .trim();

        if (!input) {
            return ctx.reply(
                '⚠️ Enter an alien name.\n\n' +
                'Example:\n' +
                '/deletealien Goop'
            );
        }

        const escapedName =
            input.replace(
                /[.*+?^${}()|[\]\\]/g,
                '\\$&'
            );

        const alien =
            await Alien.findOne({
                name: {
                    $regex: `^${escapedName}$`,
                    $options: 'i'
                }
            });

        if (!alien) {
            return ctx.reply(
                `❌ Alien "${input}" was not found in the Alienoid database.`
            );
        }

        const deletedName =
            alien.name;

        await Alien.deleteOne({
            _id: alien._id
        });

        return ctx.reply(
            `✅ ALIEN DELETED\n\n` +
            `👽 ${deletedName}\n\n` +
            `This alien has been removed from the Alienoid game database.`
        );

    } catch (error) {

        console.error(
            '❌ /deletealien error:',
            error
        );

        return ctx.reply(
            '❌ Failed to delete alien.'
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
        speed: Number(starter.speed || 0),

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
        `Type /help for help !!`
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

    // Group same alien + same star together
    const grouped = new Map();

    for (const alien of aliens) {

        const baseName =
            String(
                alien.nickname ||
                alien.name ||
                'Unknown Alien'
            ).trim();

        const star =
            Number(alien.star || 0);

        const displayName =
            star > 0
                ? `${'⭐'.repeat(star)} ${baseName}`
                : baseName;

        const key =
            `${baseName.toLowerCase()}_${star}`;

        if (!grouped.has(key)) {
            grouped.set(
                key,
                {
                    name: displayName,
                    count: 0
                }
            );
        }

        grouped.get(key).count += 1;
    }

    const collection =
        Array.from(
            grouped.values()
        ).map(item => [
            item.name,
            item.count
        ]);

    const totalPages =
        Math.max(
            1,
            Math.ceil(
                collection.length /
                BAG_PAGE_SIZE
            )
        );

    // Safety
    page = Math.max(
        0,
        Math.min(
            page,
            totalPages - 1
        )
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




// ==================== /alist ====================

bot.command(['alist', 'aliens'], async (ctx) => {

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
                    callback_data: 'alist_page_0'
                },
                {
                    text: `Page 1/${totalPages}`,
                    callback_data: 'alist_current'
                },
                {
                    text: 'Next ➡️',
                    callback_data: 'alist_page_1'
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
            '❌ /alist error:',
            error
        );

        return ctx.reply(
            '❌ Could not load your alien collection.'
        );
    }
});


// ==================== ALINE LIST PAGINATION ====================

bot.action(/^alist_page_(\d+)$/, async (ctx) => {

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
                    `alist_page_${safePage - 1}`
            });
        }

        row.push({
            text:
                `Page ${safePage + 1}/${totalPages}`,
            callback_data: 'alist_current'
        });

        if (safePage < totalPages - 1) {

            row.push({
                text: 'Next ➡️',
                callback_data:
                    `alist_page_${safePage + 1}`
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
            '❌ alist pagination error:',
            error
        );

        return ctx.answerCbQuery(
            '❌ Could not load this page.',
            { show_alert: true }
        );
    }
});


// ==================== BAG CURRENT PAGE ====================

bot.action('alist_current', async (ctx) => {

    return ctx.answerCbQuery(
        '📖 You are already on this page.'
    );
});

// ==================== STAR MERGE ====================

// ==================== STAR MERGE ====================

// /merge Stinkfly
// /merge Stinkfly⭐
// /merge Stinkfly⭐⭐

bot.command('merge', async (ctx) => {

    try {

        const userId = ctx.from.id;

        const user =
            await User.findOne({ userId });

        if (!user) {
            return ctx.reply(
                '⚠️ Please send /start first!'
            );
        }

        if (!user.aliens || user.aliens.length === 0) {
            return ctx.reply(
                '🎒 Your alien collection is empty!'
            );
        }

        const input =
            ctx.message.text
                .trim()
                .replace(
                    /^\/merge(?:@\w+)?\s*/i,
                    ''
                );

        if (!input) {
            return ctx.reply(
                '⚠️ Enter an alien name.\n\n' +
                'Examples:\n' +
                '/merge Stinkfly\n' +
                '/merge Stinkfly⭐\n' +
                '/merge Stinkfly⭐⭐'
            );
        }

        // ==================== READ STAR ====================

        let star = 0;
        let alienName = input;

        const starMatch =
            input.match(/(⭐{1,3})$/);

        if (starMatch) {

            star =
                starMatch[1].length;

            alienName =
                input
                    .replace(/⭐{1,3}$/, '')
                    .trim();
        }

        if (!alienName) {
            return ctx.reply(
                '⚠️ Please enter a valid alien name.'
            );
        }

        // ==================== MAX STAR ====================

        if (star >= 3) {

            return ctx.reply(
                `❌ ⭐⭐⭐ ${alienName} is already MAX STAR.`
            );
        }

        const targetStar =
            star + 1;

        // ==================== FIND ALIENS ====================

        const matchingAliens =
            user.aliens.filter(alien => {

                const nameMatch =
                    String(
                        alien.name || ''
                    ).toLowerCase() ===
                    alienName.toLowerCase();

                const nicknameMatch =
                    String(
                        alien.nickname || ''
                    ).toLowerCase() ===
                    alienName.toLowerCase();

                return (
                    (nameMatch || nicknameMatch) &&
                    Number(alien.star || 0) === star
                );
            });

        // ==================== NEED 3 ====================

        if (matchingAliens.length < 3) {

            const currentStars =
                star > 0
                    ? `${'⭐'.repeat(star)} `
                    : '';

            return ctx.reply(
                `❌ Not enough ${currentStars}${alienName} to merge.\n\n` +
                `You have: ${matchingAliens.length}x\n` +
                `Required: 3x`
            );
        }

        // ==================== RARITY ====================

        const rarity =
            matchingAliens[0].rarity;

        const mergeFee =
            STAR_MERGE_FEES[rarity]?.[targetStar];

        if (mergeFee === undefined) {

            return ctx.reply(
                `❌ Merge fee is not configured for ` +
                `${rarity} ${'⭐'.repeat(targetStar)}.`
            );
        }

        // ==================== BALANCE ====================

        if (user.rupees < mergeFee) {

            return ctx.reply(
                `❌ LOW BALANCE\n\n` +
                `💰 Your Balance: ₹${user.rupees}\n` +
                `💸 Required: ₹${mergeFee}\n\n` +
                `You need ₹${mergeFee - user.rupees} more.`
            );
        }

        // ==================== DECK PROTECTION ====================

        const mergeIds =
            matchingAliens
                .slice(0, 3)
                .map(
                    alien => alien.alienId
                );

        const protectedAlien =
            mergeIds.some(
                id =>
                    user.deck.includes(id)
            );

        if (protectedAlien) {

            return ctx.reply(
                `❌ One of the ${alienName} aliens ` +
                `needed for this merge is currently in your deck.\n\n` +
                `Remove it from your deck first using /out.`
            );
        }

        // ==================== POWER PREVIEW ====================

        const baseAtk =
            Number(
                matchingAliens[0].atk || 1
            );

        const baseHp =
            Number(
                matchingAliens[0].maxHp ||
                matchingAliens[0].hp ||
                1
            );

        const baseDef =
            Number(
                matchingAliens[0].def || 0
            );
        const baseSpeed =
    Number(
        matchingAliens[0].speed || 0
    );

        const multiplier =
            STAR_POWER_MULTIPLIER[targetStar];

        const newAtk =
            Math.round(
                baseAtk * multiplier
            );

        const newMaxHp =
            Math.round(
                baseHp * multiplier
            );

        const newDef =
            Math.round(
                baseDef * multiplier
            );
        const newSpeed =
    Math.round(
        baseSpeed * multiplier
    );

        const currentStars =
            star > 0
                ? '⭐'.repeat(star)
                : 'Normal';

        const targetStars =
            '⭐'.repeat(targetStar);

        // ==================== SAVE PENDING MERGE ====================

        ctx.session ??= {};

        ctx.session.pendingMerge = {
            alienIds: mergeIds,

            alienName:
                matchingAliens[0].name,

            nickname:
                matchingAliens[0].nickname ||
                matchingAliens[0].name,

            rarity,

            sourceStar: star,

            targetStar,

            mergeFee,

            newAtk,
            newMaxHp,
            newDef,
            newSpeed,

            sourceAlien: {
                name:
                    matchingAliens[0].name,

                nickname:
                    matchingAliens[0].nickname ||
                    matchingAliens[0].name,

                rarity:
                    matchingAliens[0].rarity,

                level:
                    Number(
                        matchingAliens[0].level || 1
                    ),

                element:
                    matchingAliens[0].element,

                fileId:
                    matchingAliens[0].fileId || ''
            },

            userId
        };

        // ==================== CONFIRMATION ====================

        return ctx.reply(

            `✨ <b>MERGE PREVIEW</b>\n\n` +

            `👽 <b>${matchingAliens[0].name}</b>\n\n` +

            `🔹 ${currentStars} × 3\n` +
            `⬇️\n` +
            `🔹 ${targetStars}\n\n` +

            `⚡ Power: ` +
            `<b>${Math.round(multiplier * 100)}%</b>\n\n` +

            `⚔️ ATK: ` +
            `${baseAtk} → <b>${newAtk}</b>\n` +

            `❤️ HP: ` +
            `${baseHp} → <b>${newMaxHp}</b>\n` +

            `🛡️ DEF: ` +
            `${baseDef} → <b>${newDef}</b>\n\n` +

            `💸 Merge Fee: <b>₹${mergeFee}</b>\n` +
            `💰 Balance After: ` +
            `<b>₹${user.rupees - mergeFee}</b>\n\n` +

            `⚠️ 3 ${currentStars} aliens will be consumed.\n` +
            `Do you want to continue?`,

            {
                parse_mode: 'HTML',

                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '✅ MERGE',
                                callback_data:
                                    'merge_confirm'
                            },
                            {
                                text: '❌ CANCEL',
                                callback_data:
                                    'merge_cancel'
                            }
                        ]
                    ]
                }
            }
        );

    } catch (error) {

        console.error(
            '❌ /merge error:',
            error
        );

        return ctx.reply(
            '❌ Something went wrong while preparing the merge.'
        );
    }
});


// ==================== MERGE CANCEL ====================

bot.action('merge_cancel', async (ctx) => {

    ctx.session ??= {};

    ctx.session.pendingMerge = null;

    await ctx.answerCbQuery(
        '❌ Merge cancelled.'
    );

    try {

        return await ctx.editMessageText(
            '❌ <b>MERGE CANCELLED</b>\n\n' +
            'No aliens or Rupees were changed.',
            {
                parse_mode: 'HTML'
            }
        );

    } catch (error) {

        console.error(
            '❌ Merge cancel message error:',
            error
        );
    }
});


// ==================== MERGE CONFIRM ====================

bot.action('merge_confirm', async (ctx) => {

    try {

        const pending =
            ctx.session?.pendingMerge;

        if (!pending) {

            return ctx.answerCbQuery(
                '⚠️ Merge session expired.',
                { show_alert: true }
            );
        }

        if (
            pending.userId !==
            ctx.from.id
        ) {

            return ctx.answerCbQuery(
                '❌ This merge belongs to another user.',
                { show_alert: true }
            );
        }

        const user =
            await User.findOne({
                userId: ctx.from.id
            });

        if (!user) {

            ctx.session.pendingMerge = null;

            return ctx.answerCbQuery(
                '⚠️ User not found.',
                { show_alert: true }
            );
        }

        // Re-check balance
        if (
            user.rupees <
            pending.mergeFee
        ) {

            ctx.session.pendingMerge = null;

            return ctx.answerCbQuery(
                '❌ Your Rupees are no longer enough.',
                { show_alert: true }
            );
        }

        // Re-check exact 3 aliens still exist
        const available =
            user.aliens.filter(
                alien =>
                    pending.alienIds.includes(
                        alien.alienId
                    )
            );

        if (available.length !== 3) {

            ctx.session.pendingMerge = null;

            return ctx.answerCbQuery(
                '❌ Required aliens are no longer available.',
                { show_alert: true }
            );
        }

        // ==================== REMOVE 3 ====================

        user.aliens =
            user.aliens.filter(
                alien =>
                    !pending.alienIds.includes(
                        alien.alienId
                    )
            );

        // ==================== CREATE MERGED ALIEN ====================

        const mergedAlien = {

            alienId:
                new mongoose.Types.ObjectId()
                    .toString(),

            name:
                pending.sourceAlien.name,

            nickname:
                pending.sourceAlien.nickname,

            rarity:
                pending.sourceAlien.rarity,

            star:
                pending.targetStar,

            level:
                pending.sourceAlien.level,

            hp:
                pending.newMaxHp,

            maxHp:
                pending.newMaxHp,

            atk:
                pending.newAtk,

            def:
                pending.newDef,
            speed:
    pending.newSpeed,

            element:
                pending.sourceAlien.element,

            fileId:
                pending.sourceAlien.fileId
        };

        user.aliens.push(
            mergedAlien
        );

        // ==================== PAY ====================

        user.rupees -=
            pending.mergeFee;

        await user.save();

        const stars =
            '⭐'.repeat(
                pending.targetStar
            );

        ctx.session.pendingMerge = null;

        await ctx.answerCbQuery(
            '✨ Merge successful!'
        );

        return ctx.editMessageText(

            `✨ <b>MERGE SUCCESSFUL!</b>\n\n` +

            `👽 <b>${pending.sourceAlien.name}</b>\n` +
            `${stars}\n\n` +

            `3 × ` +
            `${pending.sourceStar > 0
                ? '⭐'.repeat(pending.sourceStar)
                : 'Normal'}\n` +

            `↓\n` +

            `${stars} ` +
            `${pending.sourceAlien.name}\n\n` +

            `⚡ Power: ` +
            `<b>${Math.round(
                STAR_POWER_MULTIPLIER[
                    pending.targetStar
                ] * 100
            )}%</b>\n` +

            `💸 Merge Fee: ` +
            `<b>₹${pending.mergeFee}</b>\n` +

            `💰 Balance: ` +
            `<b>₹${user.rupees}</b>`,

            {
                parse_mode: 'HTML'
            }
        );

    } catch (error) {

        console.error(
            '❌ merge confirmation error:',
            error
        );

        ctx.session.pendingMerge = null;

        return ctx.answerCbQuery(
            '❌ Merge failed. No safe confirmation could be completed.',
            { show_alert: true }
        );
    }
});
// ==================== ALIEN STATS ====================

// /stats alienname
// /stats alienname 1s
// /stats alienname 2s
// /stats alienname 3s

bot.command('stats', async (ctx) => {

    try {

        const userId = ctx.from.id;

        const user =
            await User.findOne({ userId });

        if (!user) {
            return ctx.reply(
                '⚠️ Please send /start first!'
            );
        }

        if (!user.aliens || user.aliens.length === 0) {
            return ctx.reply(
                '🎒 Your alien collection is empty!'
            );
        }

        const input =
            ctx.message.text
                .trim()
                .replace(/^\/stats(?:@\w+)?\s*/i, '');

        if (!input) {

            return ctx.reply(
                '⚠️ Enter an alien name.\n\n' +
                'Examples:\n' +
                '/stats Goop\n' +
                '/stats Goop 1s\n' +
                '/stats Goop 2s\n' +
                '/stats Goop 3s'
            );
        }

        // ==================== STAR LEVEL ====================

        let star = 0;

        let alienName =
            input;

        const starMatch =
            input.match(/\s+([123]s)$/i);

        if (starMatch) {

            star =
                Number(
                    starMatch[1].charAt(0)
                );

            alienName =
                input
                    .replace(
                        /\s+[123]s$/i,
                        ''
                    )
                    .trim();
        }

        if (!alienName) {

            return ctx.reply(
                '⚠️ Please enter a valid alien name.'
            );
        }

        // ==================== FIND USER'S ALIEN ====================

        const alien =
            user.aliens.find(a => {

                const nameMatch =
                    String(
                        a.name || ''
                    ).toLowerCase() ===
                    alienName.toLowerCase();

                const nicknameMatch =
                    String(
                        a.nickname || ''
                    ).toLowerCase() ===
                    alienName.toLowerCase();

                return (
                    (nameMatch || nicknameMatch) &&
                    Number(a.star || 0) === star
                );
            });

        if (!alien) {

            const stars =
                star > 0
                    ? `${'⭐'.repeat(star)} `
                    : '';

            return ctx.reply(
                `❌ ${stars}${alienName} was not found in your collection.\n\n` +
                `Check the alien name and star level.`
            );
        }

        // ==================== DISPLAY ====================

        const displayName =
            star > 0
                ? `${'⭐'.repeat(star)} ${alien.name}`
                : alien.name;

        // Get attack names + base damage from Alien database
const databaseAlien =
    await Alien.findOne({
        name: alien.name
    });

let attackText = '';

if (
    databaseAlien &&
    Array.isArray(databaseAlien.attacks) &&
    databaseAlien.attacks.length
) {

    const star =
        Number(alien.star || 0);

    const starMultiplier =
        star === 0 ? 1 :
        star === 1 ? 1.30 :
        star === 2 ? 1.60 :
        star === 3 ? 2.00 :
        1;

    attackText =
        databaseAlien.attacks
            .map((attack, index) => {

                const damage =
                    Math.round(
                        Number(attack.damage || 0) *
                        starMultiplier
                    );

                return (
                    `${index + 1}. ` +
                    `${attack.name} — ` +
                    `${damage} DMG`
                );
            })
            .join('\n');

} else {

    attackText =
        'No attacks available.';
}

        const statsMessage =
`<b>${displayName} INFO</b>
──────────────────
⭐ Rarity: ${alien.rarity || 'Unknown'}
🌌 Element: ${alien.element || 'Unknown'}

❤️ HP                : ${Number(alien.maxHp || alien.hp || 0)}
⚔️ Base Attack: ${Number(alien.atk || alien.baseAttack || 0)}
🛡️ Defense       : ${Number(alien.def || alien.defense || 0)}
⚡ Speed           : ${Number(alien.speed || 0)}
──────────────────
🥊 <b>ATTACKS</b>

${attackText}
──────────────────`;

        // ==================== IMAGE ====================

        const imageFileId =
            alien.fileId ||
            alien.imageFileId ||
            '';

        if (imageFileId) {

            return ctx.replyWithPhoto(
                imageFileId,
                {
                    caption:
                        statsMessage,

                    parse_mode:
                        'HTML'
                }
            );
        }

        return ctx.reply(
            statsMessage,
            {
                parse_mode:
                    'HTML'
            }
        );

    } catch (error) {

        console.error(
            '❌ /stats error:',
            error
        );

        return ctx.reply(
            '❌ Could not load alien stats.'
        );
    }
});

// ==================== /CHECK — GLOBAL ALIEN INFO ====================

bot.command('check', async (ctx) => {

    try {

        const input =
            ctx.message.text
                .trim()
                .replace(
                    /^\/check(?:@\w+)?\s*/i,
                    ''
                )
                .trim();

        if (!input) {

            return ctx.reply(
                '⚠️ Enter an alien name.\n\n' +
                'Example:\n' +
                '/check Goop'
            );
        }

        // ==================== FIND ALIEN IN DATABASE ====================

        const alien =
            await Alien.findOne({
                name: {
                    $regex:
                        `^${input.replace(
                            /[.*+?^${}()|[\]\\]/g,
                            '\\$&'
                        )}$`,
                    $options: 'i'
                }
            });

        if (!alien) {

            return ctx.reply(
                `❌ Alien "${input}" was not found in the Alienoid database.`
            );
        }

        // ==================== GLOBAL OWNED ====================
        // Counts UNIQUE USERS who own this alien.
        // Multiple copies by the same user count only once.

        const safeName =
            String(alien.name)
                .replace(
                    /[.*+?^${}()|[\]\\]/g,
                    '\\$&'
                );

        const globalOwned =
            await User.countDocuments({
                aliens: {
                    $elemMatch: {
                        name: {
                            $regex:
                                `^${safeName}$`,
                            $options: 'i'
                        }
                    }
                }
            });

        // ==================== ATTACKS ====================

        let attackText =
            'No attacks available.';

        if (
            Array.isArray(alien.attacks) &&
            alien.attacks.length
        ) {

            attackText =
                alien.attacks
                    .map(
                        (attack, index) =>
                            `${index + 1}. ` +
                            `${attack.name} — ` +
                            `${Number(
                                attack.damage || 0
                            )} DMG`
                    )
                    .join('\n');
        }

        // ==================== DISPLAY ====================

        const statsMessage =
`<b>${alien.name} INFO</b>
──────────────────
⭐ Rarity: ${alien.rarity || 'Unknown'}
🌌 Element: ${alien.element || 'Unknown'}

❤️ HP                : ${Number(alien.maxHp || 0)}
⚔️ Base Attack: ${Number(alien.baseAttack || 0)}
🛡️ Defense       : ${Number(alien.defense || 0)}
⚡ Speed           : ${Number(alien.speed || 0)}
──────────────────
🥊 <b>ATTACKS</b>

${attackText}
──────────────────
🌍 <b>Global Owned:</b> ${globalOwned} users`;

        // ==================== IMAGE ====================

        const imageFileId =
            alien.imageFileId ||
            alien.fileId ||
            '';

        if (imageFileId) {

            return ctx.replyWithPhoto(
                imageFileId,
                {
                    caption:
                        statsMessage,

                    parse_mode:
                        'HTML'
                }
            );
        }

        return ctx.reply(
            statsMessage,
            {
                parse_mode:
                    'HTML'
            }
        );

    } catch (error) {

        console.error(
            '❌ /check error:',
            error
        );

        return ctx.reply(
            '❌ Could not load alien database information.'
        );
    }
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
        // Get alien name + optional star selector
const args =
    ctx.message.text
        .trim()
        .split(/\s+/);

let alienName =
    args.slice(1).join(' ').trim();

let star = 0;

// /agive Goop 1s
// /agive Goop 2s
// /agive Goop 3s
const starMatch =
    alienName.match(/\s+([123]s)$/i);

if (starMatch) {

    star =
        Number(
            starMatch[1].charAt(0)
        );

    alienName =
        alienName
            .replace(
                /\s+[123]s$/i,
                ''
            )
            .trim();
}

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
        // Find ONE matching alien by name + exact star
const alienIndex =
    sender.aliens.findIndex(
        alien => {

            const nameMatch =
                String(
                    alien.nickname ||
                    alien.name ||
                    ''
                ).toLowerCase() ===
                alienName.toLowerCase();

            const starMatch =
                Number(
                    alien.star || 0
                ) === star;

            return (
                nameMatch &&
                starMatch
            );
        }
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
            speed:
    giftedAlien.speed,

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
            `────────────────🎉 ${senderName} Gifted ` +
            `${giftedAlienData.nickname} ` +
            `to ${receiverName}\n` +
            `Successfully!!────────────────`
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
// ==================== ALIEN TRADE ====================

// /trade <giving alien> <taking alien>
// Reply to another player's message.
//
// Examples:
// /trade Fourarms Stinkfly
// /trade Fourarms 1s Stinkfly
// /trade Fourarms 2s Stinkfly 1s
// /trade Fourarms 3s Stinkfly 2s

const pendingTrades = new Map();

const TRADE_TIMEOUT = 2 * 60 * 1000;


// ==================== PARSE TRADE ALIEN ====================

function parseTradeAlienPart(text) {

    const match =
        text.match(/\s+([123]s)$/i);

    if (!match) {

        return {
            name: text.trim(),
            star: 0
        };
    }

    return {
        name:
            text
                .replace(/\s+[123]s$/i, '')
                .trim(),

        star:
            Number(
                match[1].charAt(0)
            )
    };
}


// ==================== FIND TRADE SPLIT ====================

function findTradePair(
    args,
    sender,
    receiver
) {

    if (!args.length) {
        return null;
    }

    /*
     * Try every possible split.
     *
     * This allows multi-word alien names too.
     *
     * Example:
     * /trade Alien X 1s Four Arms
     */

    for (
        let split = 1;
        split < args.length;
        split++
    ) {

        const givingText =
            args
                .slice(0, split)
                .join(' ')
                .trim();

        const takingText =
            args
                .slice(split)
                .join(' ')
                .trim();

        const giving =
            parseTradeAlienPart(
                givingText
            );

        const taking =
            parseTradeAlienPart(
                takingText
            );

        if (
            !giving.name ||
            !taking.name
        ) {
            continue;
        }

        const senderAlien =
            sender.aliens.find(alien => {

                const nameMatch =
                    String(
                        alien.nickname ||
                        alien.name ||
                        ''
                    ).toLowerCase() ===
                    giving.name.toLowerCase();

                return (
                    nameMatch &&
                    Number(alien.star || 0) ===
                        giving.star
                );
            });

        if (!senderAlien) {
            continue;
        }

        const receiverAlien =
            receiver.aliens.find(alien => {

                const nameMatch =
                    String(
                        alien.nickname ||
                        alien.name ||
                        ''
                    ).toLowerCase() ===
                    taking.name.toLowerCase();

                return (
                    nameMatch &&
                    Number(alien.star || 0) ===
                        taking.star
                );
            });

        if (!receiverAlien) {
            continue;
        }

        return {
            senderAlien,
            receiverAlien,
            giving,
            taking
        };
    }

    return null;
}


// ==================== TRADE COMMAND ====================

bot.command('trade', async (ctx) => {

    try {

        const senderId =
            ctx.from.id;

        // Trade must be made by replying
        // to another player's message.
        if (
            !ctx.message.reply_to_message ||
            !ctx.message.reply_to_message.from
        ) {

            return ctx.reply(
                `⚠️ Reply to the player you want to trade with.\n\n` +

                `Use:\n` +
                `/trade <your alien> <their alien>\n\n` +

                `Examples:\n` +
                `/trade Fourarms Stinkfly\n` +
                `/trade Fourarms 1s Stinkfly`
            );
        }

        const receiverId =
            ctx.message.reply_to_message.from.id;

        // Prevent self trade
        if (
            senderId === receiverId
        ) {

            return ctx.reply(
                '❌ You cannot trade with yourself.'
            );
        }

        const rawArgs =
            ctx.message.text
                .trim()
                .replace(
                    /^\/trade(?:@\w+)?\s*/i,
                    ''
                );

        if (!rawArgs) {

            return ctx.reply(
                `⚠️ Enter both aliens.\n\n` +

                `/trade Fourarms Stinkfly\n` +
                `/trade Fourarms 1s Stinkfly\n` +
                `/trade Fourarms 2s Stinkfly 1s`
            );
        }

        const args =
            rawArgs.split(/\s+/);

        if (args.length < 2) {

            return ctx.reply(
                `⚠️ Enter both aliens.\n\n` +
                `/trade Fourarms Stinkfly`
            );
        }

        // Load both users
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
                '🎒 You do not have any aliens to trade.'
            );
        }

        if (
            !receiver.aliens ||
            receiver.aliens.length === 0
        ) {

            return ctx.reply(
                `❌ ${receiver.username || 'This player'} does not have any aliens to trade.`
            );
        }

        // Find exact two aliens + star levels
        const tradePair =
            findTradePair(
                args,
                sender,
                receiver
            );

        if (!tradePair) {

            return ctx.reply(
                `❌ Trade could not be created.\n\n` +

                `Make sure:\n` +
                `• You own the first alien.\n` +
                `• The other player owns the second alien.\n` +
                `• Star level is correct.\n\n` +

                `Example:\n` +
                `/trade Fourarms 1s Stinkfly 2s`
            );
        }

        const {
            senderAlien,
            receiverAlien,
            giving,
            taking
        } = tradePair;

        // ==================== TRADE ID ====================

        const tradeId =
            new mongoose.Types.ObjectId()
                .toString();

        // ==================== STORE REQUEST ====================

        pendingTrades.set(
            tradeId,
            {
                status: 'pending',

                senderId,
                receiverId,

                senderAlienId:
                    senderAlien.alienId,

                receiverAlienId:
                    receiverAlien.alienId,

                createdAt:
                    Date.now()
            }
        );

        // Auto-expire after 2 minutes
        setTimeout(() => {

            const trade =
                pendingTrades.get(
                    tradeId
                );

            if (
                trade &&
                trade.status === 'pending'
            ) {

                pendingTrades.delete(
                    tradeId
                );
            }

        }, TRADE_TIMEOUT);

        const senderName =
            sender.username ||
            ctx.from.first_name ||
            'Hunter';

        const receiverName =
            receiver.username ||
            ctx.message.reply_to_message
                .from
                .first_name ||
            'Hunter';

        const senderStar =
            Number(
                senderAlien.star || 0
            ) > 0
                ? `${'⭐'.repeat(
                    Number(senderAlien.star || 0)
                )} `
                : '';

        const receiverStar =
            Number(
                receiverAlien.star || 0
            ) > 0
                ? `${'⭐'.repeat(
                    Number(receiverAlien.star || 0)
                )} `
                : '';

        const tradeMessage =
`🔄 <b>TRADE REQUEST</b>

${senderName}
offers:
<b>${senderStar}${senderAlien.nickname || senderAlien.name}</b>

in exchange for:

${receiverName}
offers:
<b>${receiverStar}${receiverAlien.nickname || receiverAlien.name}</b>

Do you accept this trade?`;

        return ctx.reply(
            tradeMessage,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '✅ Accept',
                                callback_data:
                                    `trade_accept_${tradeId}`
                            },
                            {
                                text: '❌ Refuse',
                                callback_data:
                                    `trade_refuse_${tradeId}`
                            }
                        ]
                    ]
                }
            }
        );

    } catch (error) {

        console.error(
            '❌ /trade error:',
            error
        );

        return ctx.reply(
            '❌ Trade request failed due to a temporary error.'
        );
    }
});


// ==================== TRADE ACCEPT ====================

bot.action(
    /^trade_accept_(.+)$/,
    async (ctx) => {

        const tradeId =
            ctx.match[1];

        const trade =
            pendingTrades.get(
                tradeId
            );

        if (!trade) {

            return ctx.answerCbQuery(
                '⚠️ This trade request has expired.',
                {
                    show_alert: true
                }
            );
        }

        // Only receiver can accept
        if (
            ctx.from.id !==
            trade.receiverId
        ) {

            return ctx.answerCbQuery(
                '❌ Only the receiving player can accept this trade.',
                {
                    show_alert: true
                }
            );
        }

        // Duplicate-click guard
        if (
            trade.status !== 'pending'
        ) {

            return ctx.answerCbQuery(
                '⚠️ This trade has already been processed.'
            );
        }

        // Lock immediately
        trade.status =
            'processing';

        pendingTrades.set(
            tradeId,
            trade
        );

        try {

            const sender =
                await User.findOne({
                    userId:
                        trade.senderId
                });

            const receiver =
                await User.findOne({
                    userId:
                        trade.receiverId
                });

            if (
                !sender ||
                !receiver
            ) {

                pendingTrades.delete(
                    tradeId
                );

                return ctx.answerCbQuery(
                    '❌ One of the players could not be found.',
                    {
                        show_alert: true
                    }
                );
            }

            // Find exact alien instances again
            // so the request cannot trade stale data.
            const senderIndex =
                sender.aliens.findIndex(
                    alien =>
                        alien.alienId ===
                        trade.senderAlienId
                );

            const receiverIndex =
                receiver.aliens.findIndex(
                    alien =>
                        alien.alienId ===
                        trade.receiverAlienId
                );

            if (
                senderIndex === -1 ||
                receiverIndex === -1
            ) {

                pendingTrades.delete(
                    tradeId
                );

                return ctx.answerCbQuery(
                    '❌ One of the aliens is no longer available.',
                    {
                        show_alert: true
                    }
                );
            }

            const senderAlien =
                sender.aliens[
                    senderIndex
                ];

            const receiverAlien =
                receiver.aliens[
                    receiverIndex
                ];

            // Save copies for final message
            const senderAlienName =
                senderAlien.nickname ||
                senderAlien.name ||
                'Unknown Alien';

            const receiverAlienName =
                receiverAlien.nickname ||
                receiverAlien.name ||
                'Unknown Alien';

            const senderStar =
                Number(
                    senderAlien.star || 0
                ) > 0
                    ? `${'⭐'.repeat(
                        Number(senderAlien.star || 0)
                    )} `
                    : '';

            const receiverStar =
                Number(
                    receiverAlien.star || 0
                ) > 0
                    ? `${'⭐'.repeat(
                        Number(receiverAlien.star || 0)
                    )} `
                    : '';

            const senderName =
                sender.username ||
                'Hunter';

            const receiverName =
                receiver.username ||
                'Hunter';

            // ==================== REMOVE FROM DECK ====================

            if (
                sender.deck?.length
            ) {

                sender.deck =
                    sender.deck.filter(
                        id =>
                            id !==
                            senderAlien.alienId
                    );
            }

            if (
                receiver.deck?.length
            ) {

                receiver.deck =
                    receiver.deck.filter(
                        id =>
                            id !==
                            receiverAlien.alienId
                    );
            }

            // ==================== SWAP ALIENS ====================

            sender.aliens.splice(
                senderIndex,
                1
            );

            receiver.aliens.splice(
                receiverIndex,
                1
            );

            // New unique IDs
            const senderReceivedAlien = {

                alienId:
                    new mongoose.Types.ObjectId()
                        .toString(),

                name:
                    receiverAlien.name ||
                    receiverAlien.nickname ||
                    'Unknown Alien',

                nickname:
                    receiverAlien.nickname ||
                    receiverAlien.name ||
                    'Unknown Alien',

                rarity:
                    receiverAlien.rarity,

                star:
                    Number(
                        receiverAlien.star || 0
                    ),

                level:
                    Number(
                        receiverAlien.level || 1
                    ),

                hp:
                    receiverAlien.hp,

                maxHp:
                    receiverAlien.maxHp,

                atk:
                    receiverAlien.atk,

                def:
                    receiverAlien.def,

                speed:
                    Number(
                        receiverAlien.speed || 0
                    ),

                element:
                    receiverAlien.element,

                fileId:
                    receiverAlien.fileId || ''
            };

            const receiverReceivedAlien = {

                alienId:
                    new mongoose.Types.ObjectId()
                        .toString(),

                name:
                    senderAlien.name ||
                    senderAlien.nickname ||
                    'Unknown Alien',

                nickname:
                    senderAlien.nickname ||
                    senderAlien.name ||
                    'Unknown Alien',

                rarity:
                    senderAlien.rarity,

                star:
                    Number(
                        senderAlien.star || 0
                    ),

                level:
                    Number(
                        senderAlien.level || 1
                    ),

                hp:
                    senderAlien.hp,

                maxHp:
                    senderAlien.maxHp,

                atk:
                    senderAlien.atk,

                def:
                    senderAlien.def,

                speed:
                    Number(
                        senderAlien.speed || 0
                    ),

                element:
                    senderAlien.element,

                fileId:
                    senderAlien.fileId || ''
            };

            sender.aliens.push(
                senderReceivedAlien
            );

            receiver.aliens.push(
                receiverReceivedAlien
            );

            // Save both users
            await sender.save();
            await receiver.save();

            // Mark completed BEFORE editing message
            trade.status =
                'completed';

            pendingTrades.delete(
                tradeId
            );

            await ctx.answerCbQuery(
                '✅ Trade completed!'
            );

            return ctx.editMessageText(
`🎊 <b>TRADE IS SUCCESSFUL</b>

ℹ️ <b>Trade info:</b>

🔄 ${senderName}
gave ${senderStar}${senderAlienName} to
•『 ${receiverName} 』•

🔄 •『 ${receiverName} 』•
gave ${receiverStar}${receiverAlienName} to
${senderName}`,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: []
                    }
                }
            );

        } catch (error) {

            console.error(
                '❌ Trade accept error:',
                error
            );

            // Unlock only if trade was not completed
            const currentTrade =
                pendingTrades.get(
                    tradeId
                );

            if (
                currentTrade &&
                currentTrade.status ===
                    'processing'
            ) {

                currentTrade.status =
                    'pending';

                pendingTrades.set(
                    tradeId,
                    currentTrade
                );
            }

            return ctx.answerCbQuery(
                '❌ Trade failed. Nothing was confirmed.',
                {
                    show_alert: true
                }
            );
        }
    }
);


// ==================== TRADE REFUSE ====================

bot.action(
    /^trade_refuse_(.+)$/,
    async (ctx) => {

        const tradeId =
            ctx.match[1];

        const trade =
            pendingTrades.get(
                tradeId
            );

        if (!trade) {

            return ctx.answerCbQuery(
                '⚠️ This trade request has expired.',
                {
                    show_alert: true
                }
            );
        }

        // Only receiver can refuse
        if (
            ctx.from.id !==
            trade.receiverId
        ) {

            return ctx.answerCbQuery(
                '❌ Only the receiving player can refuse this trade.',
                {
                    show_alert: true
                }
            );
        }

        // Duplicate-click guard
        if (
            trade.status !== 'pending'
        ) {

            return ctx.answerCbQuery(
                '⚠️ This trade has already been processed.'
            );
        }

        // Lock immediately
        trade.status =
            'refused';

        pendingTrades.set(
            tradeId,
            trade
        );

        pendingTrades.delete(
            tradeId
        );

        await ctx.answerCbQuery(
            'Trade refused.'
        );

        return ctx.editMessageText(
`❌ <b>TRADE REFUSED</b>

${ctx.from.first_name || 'Hunter'} refused the trade request.`,
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: []
                }
            }
        );
    }
);
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

/alist
View your collected aliens.

/merge <alien>
Merge 3 identical aliens to increase Star level.

/set <aline> for adding alien to active deck use use /set <alien 1s> for adding star aliens in deck 1s = ⭐ 2s = ⭐⭐ 3s = ⭐⭐⭐.
/hunt
Hunt a wild alien, capture it or defeat it.

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
₹3,000 → 3★

God
10000-> 1⭐
15000-> 2⭐
20000-> 3⭐
`;

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
