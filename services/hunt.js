// ==================== ALIENOID HUNT FLOW ====================
const Alien = require('../models/Alien');
const {
    HUNT_COST,
    spawnWildAlien,
    getCaptureChance,
    attemptCapture,
    getHuntReward
} = require('./huntEngine');

const {
    calculateDamage,
    getDodgeChance,
rollDodge,
    getIncomingDamageMultiplier,
    calculateHealerxRecovery,
    getFirstTurn,
    createHpBar
} = require('./battleEngine');


// ==================== HUNT CONFIG ====================

const MAX_DECK_SIZE = 4;
const MAX_SCANS_PER_HUNT = 3;


// ==================== HELPERS ====================

function getAlienDisplayName(alien) {
    return alien.nickname || alien.name || 'Unknown Alien';
}

function getStars(star = 0) {
    return star > 0 ? '⭐'.repeat(star) : '';
}

function getScanInventoryKey(scanType) {
    if (scanType === 'Super') return 'superScan';
    if (scanType === 'Mega') return 'megaScan';
    if (scanType === 'Absolute') return 'absoluteScan';

    return null;
}

function getBattlePlayerAttacks(alien) {
    const damage = Math.max(
        1,
        Number(alien.atk || alien.baseAttack || 1)
    );

    return [
        {
            name: 'Attack 1',
            damage
        },
        {
            name: 'Attack 2',
            damage
        },
        {
            name: 'Attack 3',
            damage
        }
    ];
}

function getPlayerBattleAlien(alien) {
    return {
        alienId: alien.alienId,
        name: getAlienDisplayName(alien),
        rarity: alien.rarity,
        element: alien.element,
        star: Number(alien.star || 0),
        level: Number(alien.level || 1),

        maxHp: Number(alien.maxHp || 1),
        currentHp: Number(
            alien.hp || alien.maxHp || 1
        ),

        defense: Number(alien.def || 0),
        speed: Number(alien.speed || 0),
        baseAttack: Number(alien.atk || 1),

        attacks: getBattlePlayerAttacks(alien)
    };
}


// ==================== SESSION CLEANUP ====================

function clearHuntSession(ctx) {
    if (ctx.session) {
        ctx.session.hunt = null;
    }
}


// ==================== HUNT MAIN MESSAGE ====================

function buildHuntMessage(hunt) {

    const wild = hunt.wildAlien;

    return (
        `👽 <b>WILD ALIEN SPAWNED!</b>\n\n` +

        `👽 <b>${wild.name}</b>\n` +
        `⭐ Rarity: ${wild.rarity}\n` +
        `🌌 Element: ${wild.element}\n\n` +

        `❤️ HP: ${wild.maxHp}\n\n` +

        `What do you want to do?`
    );
}


// ==================== DECK SELECTION ====================

function buildDeckSelectionMessage(user) {

    let text =
        `🛸 <b>SELECT YOUR ALIEN</b>\n\n`;

    user.deck.forEach((alienId, index) => {

        const alien =
            user.aliens.find(
                a => a.alienId === alienId
            );

        if (!alien) return;

        const stars = getStars(
            Number(alien.star || 0)
        );

        text +=
            `${index + 1}. ${stars} ` +
            `${getAlienDisplayName(alien)}\n`;
    });

    text +=
        `\nChoose one alien for this 1v1 battle.`;

    return text;
}


// ==================== BATTLE MESSAGE ====================

function buildBattleMessage(hunt) {

    const player = hunt.playerAlien;
    const wild = hunt.wildAlien;

    return (
        `👽 <b>${wild.name}</b>\n` +
        `${createHpBar(wild.currentHp, wild.maxHp)}\n` +
        `${wild.currentHp}/${wild.maxHp} HP\n\n` +

        `🛸 <b>${getAlienDisplayName(player)}</b> ` +
        `${getStars(player.star)}\n` +
        `${createHpBar(player.currentHp, player.maxHp)}\n` +
        `${player.currentHp}/${player.maxHp} HP\n\n` +

        `⚔️ <b>Turn:</b> ` +
        `${hunt.turn === 'player' ? 'Your turn' : 'Wild alien turn'}`
    );
}


// ==================== BATTLE KEYBOARD ====================

function getBattleKeyboard(hunt) {

    const buttons = [
        [
            {
                text: '⚔️ Atk 1',
                callback_data: 'hunt_attack_0'
            },
            {
                text: '⚔️ Atk 2',
                callback_data: 'hunt_attack_1'
            }
        ],
        [
            {
                text: '⚔️ Atk 3',
                callback_data: 'hunt_attack_2'
            },
            {
                text: '🧪 Healerx',
                callback_data: 'hunt_healerx'
            }
        ],
        [
            {
                text: '🔙 Back',
                callback_data: 'hunt_battle_back'
            }
        ]
    ];

    return {
        inline_keyboard: buttons
    };
}


// ==================== MAIN HUNT KEYBOARD ====================

function getMainHuntKeyboard() {

    return {
        inline_keyboard: [
            [
                {
                    text: '⚔️ Hunt',
                    callback_data: 'hunt_start_fight'
                },
                {
                    text: '🏃 Run',
                    callback_data: 'hunt_run'
                }
            ],
            [
                {
                    text: '🔍 Scan',
                    callback_data: 'hunt_scan'
                }
            ]
        ]
    };
}


// ==================== SCAN KEYBOARD ====================

function getScanKeyboard(user, hunt) {

    const buttons = [];

    const inventory = user.inventory || {};

    buttons.push([
        {
            text: '🔍 Normal Scan',
            callback_data: 'hunt_scan_Normal'
        }
    ]);

    buttons.push([
        {
            text: `⚡ S.Scan (${inventory.superScan || 0})`,
            callback_data: 'hunt_scan_Super'
        },
        {
            text: `☣️ M.Scan (${inventory.megaScan || 0})`,
            callback_data: 'hunt_scan_Mega'
        }
    ]);

    buttons.push([
        {
            text: `☢️ A.Scan (${inventory.absoluteScan || 0})`,
            callback_data: 'hunt_scan_Absolute'
        }
    ]);

    buttons.push([
        {
            text: '🔙 Back',
            callback_data: 'hunt_scan_back'
        }
    ]);

    return {
        inline_keyboard: buttons
    };
}


// ==================== SCAN INFORMATION ====================

function buildScanMessage(hunt) {

    const wild = hunt.wildAlien;

    return (
        `🔍 <b>ALIEN SCAN</b>\n\n` +

        `👽 <b>${wild.name}</b>\n` +
        `🌌 Element: ${wild.element}\n` +
        `⭐ Rarity: ${wild.rarity}\n\n` +

        `❤️ Current HP: ` +
        `${wild.currentHp}/${wild.maxHp}\n\n` +

        `📡 Scans used: ` +
        `${hunt.scansUsed}/${MAX_SCANS_PER_HUNT}\n\n` +

        `Choose a scan to attempt capture.`
    );
}

// ==================== CAPTURE SUCCESS ====================

async function captureWildAlien(ctx, User, scanType) {

    const hunt = ctx.session?.hunt;

    if (!hunt) {
        return ctx.answerCbQuery(
            '⚠️ Hunt session expired.',
            { show_alert: true }
        );
    }

    const wild = hunt.wildAlien;

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

    // Calculate final capture chance using existing Hunt Engine
    const chance =
        getCaptureChance(
            scanType,
            wild.rarity,
            wild.maxHp,
            wild.currentHp
        );

    const success =
        attemptCapture(chance);

    // ==================== CAPTURE SUCCESS ====================

    if (success) {

        user.aliens.push({
            alienId: wild.alienId,
            name: wild.name,
            nickname: '',
            rarity: wild.rarity,
            star: 0,
            level: 1,

            hp: wild.maxHp,
            maxHp: wild.maxHp,

            atk: wild.baseAttack,
            def: wild.defense,
            speed: wild.speed,

            element: wild.element,

            fileId: wild.imageFileId || ''
        });

        // SUCCESS = RESET PROGRESSION
        // ==================== PROGRESSION RESET RULE ====================

// Legendary capture → reset
// Cosmic capture → reset
// God capture → reset
// Basic/Common/Rare capture → continue

const shouldResetProgress =
    wild.rarity === 'Legendary' ||
    wild.rarity === 'Cosmic' ||
    wild.rarity === 'God';

if (shouldResetProgress) {
    user.huntProgress = 0;
}

await user.save();

        await ctx.answerCbQuery(
            '🎉 CAPTURE SUCCESS!',
            { show_alert: true }
        );

        await ctx.editMessageText(
            `🎉 <b>ALIEN CAPTURED!</b>\n\n` +

            `👽 <b>${wild.name}</b>\n` +
            `⭐ Rarity: ${wild.rarity}\n` +
            `🌌 Element: ${wild.element}\n\n` +

            `🔍 Scan: ${scanType}\n` +
            `🎯 Capture Chance: ${chance}%\n\n` +

            `${
    shouldResetProgress
        ? `🔥 Hunt progression has been reset.\n` +
          `📈 Progress: 0`
        : `📈 Hunt progression continues.\n` +
          `📈 Progress: ${user.huntProgress}`
}`,
            {
                parse_mode: 'HTML'
            }
        );

        clearHuntSession(ctx);

        return;
    }

    // ==================== CAPTURE FAILED ====================
// God capture failed → progression resets
if (wild.rarity === 'God') {

    user.huntProgress = 0;

    await user.save();
}
    await ctx.answerCbQuery(
        '❌ Capture failed.',
        { show_alert: true }
    );

    await ctx.editMessageText(
        buildScanMessage(hunt) +
        `\n\n❌ <b>Capture failed.</b>\n` +
        `🎯 Capture Chance: <b>${chance}%</b>\n\n` +
        `The wild alien escaped the scan.`,
        {
            parse_mode: 'HTML',
            reply_markup:
                getScanKeyboard(user, hunt)
        }
    );
}
// ==================== WILD ALIEN DEFEATED ====================

async function finishWildDefeated(ctx) {

    const hunt = ctx.session?.hunt;

    if (!hunt || !hunt.wildAlien) {
        return ctx.answerCbQuery(
            '⚠️ Hunt session expired.',
            { show_alert: true }
        );
    }

    const wild = hunt.wildAlien;

    try {

        // Get original alien from database
        const alien = await Alien.findById(
            wild.alienId
        );

        if (!alien) {

            clearHuntSession(ctx);

            return ctx.editMessageText(
                '❌ Wild alien data could not be found.\n\n' +
                'The hunt has ended.'
            );
        }

        // Calculate reward using existing Hunt Engine
        const reward =
            getHuntReward(alien);

        // Get user
        const user =
            await User.findOne({
                userId: ctx.from.id
            });

        if (!user) {

            clearHuntSession(ctx);

            return ctx.editMessageText(
                '❌ User not found.\n\n' +
                'The hunt has ended.'
            );
        }

        // Give Rupee reward
        // Give Rupee reward
user.rupees += reward;

// ==================== PROGRESSION ====================

// God encounter completed without capture → reset
// Other rarities → progression continues

if (wild.rarity === 'God') {
    user.huntProgress = 0;
}

await user.save();

        await ctx.answerCbQuery(
            '🎉 Wild alien defeated!',
            { show_alert: true }
        );

        await ctx.editMessageText(
            `⚔️ <b>WILD ALIEN DEFEATED!</b>\n\n` +

            `👽 <b>${wild.name}</b>\n` +
            `⭐ Rarity: <b>${wild.rarity}</b>\n` +
            `🌌 Element: <b>${wild.element}</b>\n\n` +

            `💰 Hunt Reward: <b>+₹${reward}</b>\n` +
            `💵 Balance: <b>₹${user.rupees}</b>\n\n` +

            `📈 Hunt Progress: <b>${user.huntProgress || 0}</b>\n` +
            `➡️ Progress continues.\n\n` +

            `🏁 Hunt completed.`
        );

        // End this hunt only.
        // huntProgress remains in database.
        clearHuntSession(ctx);

    } catch (error) {

        console.error(
            '❌ finishWildDefeated error:',
            error
        );

        clearHuntSession(ctx);

        try {
            await ctx.editMessageText(
                '❌ Reward processing failed.\n\n' +
                'The hunt has been ended safely.'
            );
        } catch (editError) {
            console.error(
                '❌ Hunt defeat message error:',
                editError
            );
        }
    }
}
// ==================== REGISTER HUNT ====================

function registerHunt(bot, User) {

    // ==================== /HUNT ====================

    bot.command('hunt', async (ctx) => {

        try {

            const userId = ctx.from.id;

            const user =
                await User.findOne({ userId });

            if (!user) {
                return ctx.reply(
                    '⚠️ Please send /start first!'
                );
            }

            // Prevent multiple hunts
            if (ctx.session?.hunt) {
                return ctx.reply(
                    '⚠️ You already have an active hunt.\n\n' +
                    'Finish it or use Run first.'
                );
            }

            if (user.rupees < HUNT_COST) {
                return ctx.reply(
                    `❌ Not enough Rupees!\n\n` +
                    `💰 Required: ₹${HUNT_COST}\n` +
                    `💵 Your Balance: ₹${user.rupees}`
                );
            }

            if (!user.deck || user.deck.length === 0) {
                return ctx.reply(
                    '❌ Your deck is empty!\n\n' +
                    'Set at least 1 alien before hunting.'
                );
            }

            if (user.deck.length > MAX_DECK_SIZE) {
                return ctx.reply(
                    '❌ Your deck contains more than 4 aliens.'
                );
            }

            // Check that deck aliens actually exist
            const deckAliens =
                user.deck
                    .map(id =>
                        user.aliens.find(
                            alien => alien.alienId === id
                        )
                    )
                    .filter(Boolean);

            if (!deckAliens.length) {
                return ctx.reply(
                    '❌ No valid aliens were found in your deck.'
                );
            }

            // Deduct hunt cost
user.rupees -= HUNT_COST;

// Progress total hunt count separately
user.hunts += 1;
user.huntProgress =
    (user.huntProgress || 0) + 1;

await user.save();

// Spawn wild alien according to progression
const spawned =
    await spawnWildAlien(user.huntProgress);

            ctx.session.hunt = {
                stage: 'spawned',

                wildAlien: {
                    alienId: String(spawned._id),
                    name: spawned.name,
                    rarity: spawned.rarity,
                    element: spawned.element,

                    maxHp: Number(spawned.maxHp),
                    currentHp: Number(spawned.maxHp),

                    defense: Number(spawned.defense || 0),
                    speed: Number(spawned.speed || 0),
                    baseAttack: Number(spawned.baseAttack || 1),

                    attacks: spawned.attacks || [],

                    imageFileId:
                        spawned.imageFileId || ''
                },

                playerAlien: null,

                turn: null,

                scansUsed: 0,

                paused: false,
                dodgeUsed: {
    player: false,
    wild: false
},
                playerAttackCount: 0,
wildAttackCount: 0,

                startedAt: Date.now()
            };

            return ctx.replyWithHTML(
                buildHuntMessage(ctx.session.hunt),
                {
                    reply_markup:
                        getMainHuntKeyboard()
                }
            );

        } catch (error) {

            console.error(
                '❌ /hunt error:',
                error
            );

            clearHuntSession(ctx);

            return ctx.reply(
                '❌ Hunt failed to start.\n\n' +
                'Please try again.'
            );
        }
    });

// ==================== SCAN MENU ====================

bot.action('hunt_scan', async (ctx) => {

    const hunt = ctx.session?.hunt;

    if (!hunt) {
        return ctx.answerCbQuery(
            '⚠️ Hunt session expired.'
        );
    }

    if (hunt.scansUsed >= MAX_SCANS_PER_HUNT) {
        return ctx.answerCbQuery(
            '❌ You have already used all 3 scans for this hunt.',
            { show_alert: true }
        );
    }

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

    await ctx.answerCbQuery();

    await ctx.editMessageText(
        buildScanMessage(hunt),
        {
            parse_mode: 'HTML',
            reply_markup:
                getScanKeyboard(user, hunt)
        }
    );
});
    // ==================== SCAN ATTEMPT ====================

bot.action(
    /^hunt_scan_(Normal|Super|Mega|Absolute)$/,
    async (ctx) => {

        try {

            const hunt = ctx.session?.hunt;

            if (!hunt) {
                return ctx.answerCbQuery(
                    '⚠️ Hunt session expired.',
                    { show_alert: true }
                );
            }
            if (hunt.stage === 'battle') {
    hunt.paused = true;
            }

            // FINAL RULE: maximum 3 scans per hunt
            if (hunt.scansUsed >= MAX_SCANS_PER_HUNT) {
                return ctx.answerCbQuery(
                    '❌ Maximum 3 scans used in this hunt.',
                    { show_alert: true }
                );
            }

            const scanType =
                ctx.match[1];

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

            // ====================
            // CHECK SCAN INVENTORY
            // ====================

            const inventoryKey =
                getScanInventoryKey(scanType);

            if (inventoryKey) {

                const amount =
                    Number(
                        user.inventory?.[inventoryKey] || 0
                    );

                if (amount <= 0) {
                    return ctx.answerCbQuery(
                        `❌ You don't have a ${scanType} Scan.`,
                        { show_alert: true }
                    );
                }

                // Consume scan
                user.inventory[inventoryKey] =
                    amount - 1;
            }

            // One attempt consumed
            hunt.scansUsed += 1;

            await user.save();

            // Existing Hunt Engine handles
            // base rate + HP damage bonus.
            await captureWildAlien(
                ctx,
                User,
                scanType
            );

        } catch (error) {

            console.error(
                '❌ Scan/Capture error:',
                error
            );

            return ctx.answerCbQuery(
                '❌ Scan failed. Please try again.',
                { show_alert: true }
            );
        }
    }
);
    // ==================== SCAN BACK ====================

bot.action('hunt_scan_back', async (ctx) => {

    const hunt = ctx.session?.hunt;

    if (!hunt) {
        return ctx.answerCbQuery(
            '⚠️ Hunt session expired.'
        );
    }

    await ctx.answerCbQuery();

    // If scan was opened during battle,
    // resume the paused battle.
    if (hunt.stage === 'battle') {

        hunt.paused = false;

        await ctx.editMessageText(
            buildBattleMessage(hunt),
            {
                parse_mode: 'HTML',
                reply_markup:
                    getBattleKeyboard(hunt)
            }
        );

        return;
    }

    // Scan from spawn screen
    await ctx.editMessageText(
        buildHuntMessage(hunt),
        {
            parse_mode: 'HTML',
            reply_markup:
                getMainHuntKeyboard()
        }
    );
});
    // ==================== RUN ====================

    bot.action('hunt_run', async (ctx) => {

        if (!ctx.session?.hunt) {
            return ctx.answerCbQuery(
                '⚠️ No active hunt.'
            );
        }
        const hunt =
    ctx.session.hunt;

if (hunt.wildAlien?.rarity === 'God') {

    const user =
        await User.findOne({
            userId: ctx.from.id
        });

    if (user) {
        user.huntProgress = 0;
        await user.save();
    }
}

clearHuntSession(ctx);

        clearHuntSession(ctx);

        await ctx.answerCbQuery(
            '🏃 Hunt cancelled.'
        );

        try {
            await ctx.editMessageText(
                '🏃 <b>YOU RAN AWAY!</b>\n\n' +
                'The wild alien escaped.',
                {
                    parse_mode: 'HTML'
                }
            );
        } catch (error) {
            console.error(
                'Run message error:',
                error
            );
        }
    });


    // ==================== START FIGHT ====================

    bot.action('hunt_start_fight', async (ctx) => {

        const hunt = ctx.session?.hunt;
        if (!hunt) {
    return ctx.answerCbQuery(
        '⚠️ Hunt session expired.'
    );
                }

        // Resume paused battle
if (
    hunt.stage === 'battle' &&
    hunt.paused
) {

    hunt.paused = false;

    await ctx.answerCbQuery();

    await ctx.editMessageText(
        buildBattleMessage(hunt),
        {
            parse_mode: 'HTML',
            reply_markup:
                getBattleKeyboard(hunt)
        }
    );

    // If somehow it is wild's turn,
    // continue it.
    if (hunt.turn === 'wild') {
        await executeWildTurn(ctx);
    }

    return;
}

// Normal first-time Hunt
if (hunt.stage !== 'spawned') {
    return ctx.answerCbQuery(
        '⚠️ Invalid hunt state.'
    );
}

        const user =
            await User.findOne({
                userId: ctx.from.id
            });

        if (!user || !user.deck.length) {
            return ctx.answerCbQuery(
                '❌ Your deck is empty.',
                { show_alert: true }
            );
        }

        hunt.stage = 'selecting';

        await ctx.answerCbQuery();

        await ctx.editMessageText(
            buildDeckSelectionMessage(user),
            {
                parse_mode: 'HTML',
                reply_markup: {
                    inline_keyboard: [
                        [
                            {
                                text: '1',
                                callback_data: 'hunt_select_0'
                            },
                            {
                                text: '2',
                                callback_data: 'hunt_select_1'
                            },
                            {
                                text: '3',
                                callback_data: 'hunt_select_2'
                            },
                            {
                                text: '4',
                                callback_data: 'hunt_select_3'
                            }
                        ],
                        [
                            {
                                text: '🏃 Run',
                                callback_data: 'hunt_run'
                            }
                        ]
                    ]
                }
            }
        );
    });


    // ==================== SELECT DECK ALIEN ====================

    bot.action(/^hunt_select_(\d+)$/, async (ctx) => {

        const hunt = ctx.session?.hunt;

        if (!hunt) {
            return ctx.answerCbQuery(
                '⚠️ Hunt session expired.'
            );
        }

        const index =
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

        if (
            index < 0 ||
            index >= user.deck.length ||
            index >= MAX_DECK_SIZE
        ) {
            return ctx.answerCbQuery(
                '❌ Invalid deck slot.',
                { show_alert: true }
            );
        }

        const alienId =
            user.deck[index];

        const storedAlien =
            user.aliens.find(
                alien => alien.alienId === alienId
            );

        if (!storedAlien) {
            return ctx.answerCbQuery(
                '❌ Alien not found in your collection.',
                { show_alert: true }
            );
        }

        const playerAlien =
            getPlayerBattleAlien(storedAlien);

        hunt.playerAlien =
            playerAlien;

        hunt.stage = 'battle';

        hunt.paused = false;

        const firstTurn =
            getFirstTurn(
                playerAlien,
                hunt.wildAlien
            );

        hunt.turn = firstTurn;

        await ctx.answerCbQuery();

        await ctx.editMessageText(
            buildBattleMessage(hunt),
            {
                parse_mode: 'HTML',
                reply_markup:
                    getBattleKeyboard(hunt)
            }
        );

        // Wild alien attacks immediately
        // if it has the higher speed.
        if (hunt.turn === 'wild') {
            await executeWildTurn(ctx);
        }
    });


    // ==================== PLAYER ATTACK ====================

    bot.action(/^hunt_attack_(\d+)$/, async (ctx) => {

        const hunt = ctx.session?.hunt;

        if (!hunt) {
            return ctx.answerCbQuery(
                '⚠️ Hunt session expired.'
            );
        }

        if (hunt.stage !== 'battle') {
            return ctx.answerCbQuery(
                '⚠️ Battle is not active.'
            );
        }

        if (hunt.paused) {
            return ctx.answerCbQuery(
                '⚠️ Battle is paused.'
            );
        }

        if (hunt.turn !== 'player') {
            return ctx.answerCbQuery(
                '⏳ Wait for your turn.'
            );
        }

        const attackIndex =
            Number(ctx.match[1]);

        const player =
            hunt.playerAlien;

        const wild =
            hunt.wildAlien;

        if (
            !player ||
            !wild ||
            !player.attacks[attackIndex]
        ) {
            return ctx.answerCbQuery(
                '❌ Invalid attack.'
            );
        }

        const attack =
            player.attacks[attackIndex];

        let result =
    calculateDamage(
        player,
        wild,
        attack
    );

let dodged = false;

if (
    hunt.playerAttackCount > 0 &&
    !hunt.dodgeUsed.wild
) {

    const dodgeResult =
        rollDodge(
            wild,
            player
        );

    if (dodgeResult.dodged) {

        dodged = true;

        hunt.dodgeUsed.wild = true;

        result.damage = 0;
    }
}

if (!dodged) {

    wild.currentHp =
        Math.max(
            0,
            wild.currentHp - result.damage
        );
}
hunt.playerAttackCount += 1;
        await ctx.answerCbQuery(
    dodged
        ? `💨 ${wild.name} dodged the attack!`
        : `⚔️ ${attack.name}: ${result.damage} DMG`
);

        // Wild defeated
        if (wild.currentHp <= 0) {

            await finishWildDefeated(ctx);

            return;
        }

        // Player used turn
        hunt.turn = 'wild';

        await ctx.editMessageText(
            buildBattleMessage(hunt) +
            `\n\n⚔️ You dealt <b>${result.damage}</b> damage.`,
            {
                parse_mode: 'HTML',
                reply_markup:
                    getBattleKeyboard(hunt)
            }
        );

        // Wild turn
        await executeWildTurn(ctx);
    });


    // ==================== WILD TURN ====================

    async function executeWildTurn(ctx) {

        const hunt = ctx.session?.hunt;

        if (!hunt || hunt.stage !== 'battle') {
            return;
        }

        if (hunt.paused) {
            return;
        }

        if (hunt.turn !== 'wild') {
            return;
        }

        const player =
            hunt.playerAlien;

        const wild =
            hunt.wildAlien;

        if (!player || !wild) {
            return;
        }

        if (wild.currentHp <= 0) {
            return;
        }

        const attacks =
            wild.attacks || [];

        let attack;

        if (attacks.length) {

            attack =
                attacks[
                    Math.floor(
                        Math.random() *
                        attacks.length
                    )
                ];

        } else {

            attack = {
                name: 'Wild Attack',
                damage: wild.baseAttack
            };
        }

        let result =
            calculateDamage(
                wild,
                player,
                attack
            );

        const incomingMultiplier =
            getIncomingDamageMultiplier(
                wild.element,
                player.element
            );

        result.damage =
            Math.max(
                1,
                Math.round(
                    result.damage *
                    incomingMultiplier
                )
            );

        let dodged = false;

if (
    hunt.wildAttackCount > 0 &&
    !hunt.dodgeUsed.player
) {

    const dodgeResult =
        rollDodge(
            player,
            wild
        );

    if (dodgeResult.dodged) {

        dodged = true;

        hunt.dodgeUsed.player = true;

        result.damage = 0;
    }
}

if (!dodged) {

    player.currentHp =
        Math.max(
            0,
            player.currentHp -
            result.damage
        );
}
hunt.wildAttackCount += 1;
        // Player defeated
        if (player.currentHp <= 0) {

            clearHuntSession(ctx);

try {

    await ctx.editMessageText(
        `👎🏻 <b>LOSE!! BETTER LUCK NEXT TIME</b>\n\n` +

        `🎊 <b>WINNER:</b> "${wild.name}"\n` +

        `🎉 <b>REWARD:</b> —`,
        {
            parse_mode: 'HTML'
        }
    );

} catch (error) {

    console.error(
        'Player defeat message error:',
        error
    );
}

return;
        }

        hunt.turn = 'player';

        try {

            await ctx.editMessageText(
                buildBattleMessage(hunt) +
                `\n\n` +
                `👽 Wild alien used ` +
                `<b>${attack.name}</b>\n` +
                (
            dodged
    ? `💨 <b>${getAlienDisplayName(player)}</b> dodged the attack!`
    : `💥 Damage: <b>${result.damage}</b>`
                    ),
                {
                    parse_mode: 'HTML',
                    reply_markup:
                        getBattleKeyboard(hunt)
                }
            );

        } catch (error) {

            console.error(
                'Wild turn message error:',
                error
            );
        }
    }


    // ==================== HEALERX =========
    // ==================== HEALERX ====================

bot.action('hunt_healerx', async (ctx) => {

    const hunt = ctx.session?.hunt;

    if (!hunt) {
        return ctx.answerCbQuery(
            '⚠️ Hunt session expired.'
        );
    }

    if (hunt.stage !== 'battle') {
        return ctx.answerCbQuery(
            '⚠️ Battle is not active.'
        );
    }

    if (hunt.paused) {
        return ctx.answerCbQuery(
            '⚠️ Battle is paused.'
        );
    }

    if (hunt.turn !== 'player') {
        return ctx.answerCbQuery(
            '⏳ Wait for your turn.'
        );
    }

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

    const healerx =
        Number(user.inventory?.healerx || 0);

    if (healerx <= 0) {
        return ctx.answerCbQuery(
            '❌ You have no HealerX.',
            { show_alert: true }
        );
    }

    const player =
        hunt.playerAlien;

    if (!player) {
        return ctx.answerCbQuery(
            '❌ Your alien is missing.'
        );
    }

    const recovery =
        calculateHealerxRecovery(
            player.maxHp
        );

    const oldHp =
        player.currentHp;

    player.currentHp =
        Math.min(
            player.maxHp,
            player.currentHp + recovery
        );

    const actualRecovery =
        player.currentHp - oldHp;

    // Consume HealerX
    user.inventory.healerx =
        healerx - 1;

    await user.save();

    // HealerX consumes the player's turn
    hunt.turn = 'wild';

    await ctx.answerCbQuery(
        `🧪 HealerX used! +${actualRecovery} HP`
    );

    await ctx.editMessageText(
        buildBattleMessage(hunt) +
        `\n\n🧪 <b>HealerX</b> restored ` +
        `<b>${actualRecovery} HP</b>.`,
        {
            parse_mode: 'HTML',
            reply_markup:
                getBattleKeyboard(hunt)
        }
    );

    // Wild gets the next turn
    await executeWildTurn(ctx);
});


// ==================== BATTLE BACK ====================

bot.action('hunt_battle_back', async (ctx) => {

    const hunt = ctx.session?.hunt;

    if (!hunt) {
        return ctx.answerCbQuery(
            '⚠️ Hunt session expired.'
        );
    }

    if (hunt.stage !== 'battle') {
        return ctx.answerCbQuery(
            '⚠️ Battle is not active.'
        );
    }

    // Pause battle
    hunt.paused = true;

    await ctx.answerCbQuery(
        '⏸️ Battle paused.'
    );

    await ctx.editMessageText(
        buildHuntMessage(hunt) +
        `\n\n⏸️ <b>Battle Paused</b>`,
        {
            parse_mode: 'HTML',
            reply_markup:
                getMainHuntKeyboard()
        }
    );
});

}
// ==================== EXPORT ====================

module.exports = {
    registerHunt
};
    
