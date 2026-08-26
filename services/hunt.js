// ==================== ALIENOID HUNT FLOW ====================

const {
    HUNT_COST,
    spawnWildAlien,
    getCaptureChance,
    attemptCapture,
    getHuntReward
} = require('./huntEngine');

const {
    calculateDamage,
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
        hp: Number(
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


    // ==================== RUN ====================

    bot.action('hunt_run', async (ctx) => {

        if (!ctx.session?.hunt) {
            return ctx.answerCbQuery(
                '⚠️ No active hunt.'
            );
        }

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

        const result =
            calculateDamage(
                player,
                wild,
                attack
            );

        wild.currentHp =
            Math.max(
                0,
                wild.currentHp - result.damage
            );

        await ctx.answerCbQuery(
            `⚔️ ${attack.name}: ${result.damage} DMG`
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

        player.currentHp =
            Math.max(
                0,
                player.currentHp -
                result.damage
            );

        // Player defeated
        if (player.currentHp <= 0) {

            clearHuntSession(ctx);

            try {

                await ctx.editMessageText(
                    `💀 <b>ALIEN DEFEATED!</b>\n\n` +

                    `👽 Wild: ${wild.name}\n\n` +

                    `🛸 Your Alien: ` +
                    `${getAlienDisplayName(player)}\n\n` +

                    `❌ Your selected alien was defeated.\n` +
                    `🏃 Hunt ended.`,
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
                `💥 Damage: <b>${result.damage}</b>`,
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
