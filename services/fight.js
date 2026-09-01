// ==================== ALIENOID PVP / DUAL ====================

const Alien = require('../models/Alien');

const {
    DUAL_WIN_REWARD,
    DUAL_LOSE_REWARD
} = require('../Config/Reward');

const {
    calculateDamage,
    getIncomingDamageMultiplier,
    calculateHealerxRecovery,
    getFirstTurn,
    rollDodge,
    createHpBar
} = require('./battleEngine');


// ==================== CONFIG ====================

const MAX_DECK_SIZE = 4;

const MIN_GAMBLE = 50;
const MAX_GAMBLE = 10000;

const REQUEST_TIMEOUT = 2 * 60 * 1000;


// ==================== ACTIVE FIGHTS ====================

const fights = new Map();

const busyUsers = new Map();


// ==================== HELPERS ====================

function getUserName(user, telegramUser = null) {

    if (user?.username) {
        return `@${user.username}`;
    }

    if (telegramUser?.username) {
        return `@${telegramUser.username}`;
    }

    if (user?.first_name) {
        return user.first_name;
    }

    if (telegramUser?.first_name) {
        return telegramUser.first_name;
    }

    return 'Hunter';
}


function escapeHtml(value = '') {

    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


function getStars(star = 0) {

    const count =
        Number(star || 0);

    return count > 0
        ? '⭐'.repeat(count)
        : '';
}


// ==================== DECK ====================

function getDeckAliens(user) {

    if (
        !user ||
        !Array.isArray(user.deck) ||
        !Array.isArray(user.aliens)
    ) {
        return [];
    }

    return user.deck
        .slice(0, MAX_DECK_SIZE)
        .map((alienId, index) => {

            const alien =
                user.aliens.find(
                    item =>
                        String(item.alienId) ===
                        String(alienId)
                );

            if (!alien) {
                return null;
            }

            return {
                slot: index,
                alien
            };
        })
        .filter(Boolean);
}


function buildDeckSelectionMessage(
    user,
    playerName
) {

    const deck =
        getDeckAliens(user);

    let text =
`<b>SELECT YOUR COMPANION</b>

────────────────`;

    deck.forEach(item => {

        const alien =
            item.alien;

        const stars =
            getStars(alien.star);

        text +=
`\n${item.slot + 1}. ${stars} ${escapeHtml(
    alien.nickname || alien.name || 'Unknown Alien'
)}`;
    });

    text +=
`\n────────────────

${escapeHtml(playerName)}, choose your alien.`;

    return text;
}


function getDeckKeyboard(
    fightId,
    role,
    user
) {

    const deck =
        getDeckAliens(user);

    const buttons = [];

    deck.forEach(item => {

        buttons.push({
            text:
                String(item.slot + 1),

            callback_data:
                `fight_pick_${role}_${fightId}_${item.slot}`
        });
    });

    return {
        inline_keyboard: [
            buttons
        ]
    };
}


// ==================== LOAD BATTLE ALIEN ====================

async function buildBattleAlien(
    storedAlien
) {

    if (!storedAlien) {
        throw new Error(
            'Stored alien is missing.'
        );
    }

    const databaseAlien =
        await Alien.findOne({
            name: storedAlien.name
        });

    if (!databaseAlien) {
        throw new Error(
            `Alien not found in database: ${storedAlien.name}`
        );
    }

    if (
        !Array.isArray(databaseAlien.attacks) ||
        databaseAlien.attacks.length !== 3
    ) {
        throw new Error(
            `Alien must have exactly 3 attacks: ${storedAlien.name}`
        );
    }

    const maxHp =
        Number(
            storedAlien.maxHp ||
            databaseAlien.maxHp ||
            1
        );

    return {

        alienId:
            storedAlien.alienId,

        name:
            storedAlien.nickname ||
            storedAlien.name ||
            'Unknown Alien',

        baseName:
            storedAlien.name,

        rarity:
            storedAlien.rarity ||
            databaseAlien.rarity,

        element:
            storedAlien.element ||
            databaseAlien.element,

        star:
            Number(storedAlien.star || 0),

        level:
            Number(storedAlien.level || 1),

        maxHp,

        currentHp:
            maxHp,

        defense:
            Number(
                storedAlien.def ??
                databaseAlien.defense ??
                0
            ),

        speed:
            Number(
                storedAlien.speed ??
                databaseAlien.speed ??
                0
            ),

        attacks:
            databaseAlien.attacks.map(
                attack => ({
                    name:
                        attack.name,

                    damage:
                        Number(
                            attack.damage
                        )
                })
            )
    };
}


// ==================== BATTLE MESSAGE ====================

function buildBattleMessage(
    fight,
    extraMessage = ''
) {

    const challenger =
        fight.challengerAlien;

    const opponent =
        fight.opponentAlien;

    const challengerName =
        escapeHtml(
            fight.challengerName
        );

    const opponentName =
        escapeHtml(
            fight.opponentName
        );

    const challengerAlien =
        escapeHtml(
            challenger.name
        );

    const opponentAlien =
        escapeHtml(
            opponent.name
        );

    const currentTurnName =
        fight.turn === 'challenger'
            ? challengerName
            : opponentName;

    let text =
`────────────────
<b>${challengerName}</b>
${challengerAlien} ${getStars(challenger.star)}
${createHpBar(
    challenger.currentHp,
    challenger.maxHp
)}
${challenger.currentHp}/${challenger.maxHp} HP
────────────────
<b>${opponentName}</b>
${opponentAlien} ${getStars(opponent.star)}
${createHpBar(
    opponent.currentHp,
    opponent.maxHp
)}
${opponent.currentHp}/${opponent.maxHp} HP
────────────────`;

    if (extraMessage) {

        text +=
`\n\n${extraMessage}`;
    }

    text +=
`\n\n<b>${currentTurnName}'s Turn now :-</b>`;

    return text;
}


function getBattleKeyboard(
    fight
) {

    return {
        inline_keyboard: [

            [
                {
                    text: 'Atk 1',
                    callback_data:
                        `fight_atk_${fight.id}_0`
                },
                {
                    text: 'Atk 2',
                    callback_data:
                        `fight_atk_${fight.id}_1`
                }
            ],

            [
                {
                    text: 'Atk 3',
                    callback_data:
                        `fight_atk_${fight.id}_2`
                },
                {
                    text: 'Healerx',
                    callback_data:
                        `fight_heal_${fight.id}`
                }
            ],

            [
                {
                    text: 'Surrender',
                    callback_data:
                        `fight_surrender_${fight.id}`
                }
            ]
        ]
    };
}


// ==================== REQUEST MESSAGE ====================

function buildRequestMessage(
    challengerName,
    opponentName,
    gambleAmount
) {

    let gambleText = '';

    if (gambleAmount) {

        gambleText =
`\n\n💰 <b>Gamble Fight</b>
Stake: ₹${gambleAmount} each
Winner receives: ₹${gambleAmount * 2}`;
    }

    return (
`────────────────
<b>${escapeHtml(challengerName)}</b> Wants to fight with you
Are you ready for a thrilling dual ?

<b>${escapeHtml(opponentName)}</b>${gambleText}
────────────────`
    );
}


// ==================== FINISH FIGHT ====================

async function finishFight(
    ctx,
    User,
    fight,
    winnerId,
    loserId,
    finisherMove
) {

    if (!fight) {
        return;
    }

    if (fight.status === 'finished') {
        return;
    }

    fight.status = 'finished';

    let winner;
    let loser;

    try {

        winner =
            await User.findOne({
                userId: winnerId
            });

        loser =
            await User.findOne({
                userId: loserId
            });

        if (!winner || !loser) {
            throw new Error(
                'Winner or loser profile not found.'
            );
        }

        let reward;

        // ====================
        // NORMAL FIGHT
        // ====================

        if (fight.mode === 'normal') {

            const winReward =
                Number(DUAL_WIN_REWARD);

            const loseReward =
                Number(DUAL_LOSE_REWARD);

            if (
                !Number.isFinite(winReward) ||
                !Number.isFinite(loseReward)
            ) {
                throw new Error(
                    'Invalid Dual reward configuration.'
                );
            }

            winner.rupees +=
                winReward;

            loser.rupees +=
                loseReward;

            reward =
                `+₹${winReward}`;

        }

        // ====================
        // GAMBLE FIGHT
        // ====================

        else {

            const pot =
                Number(fight.pot);

            if (
                !Number.isFinite(pot) ||
                pot <= 0
            ) {
                throw new Error(
                    'Invalid gamble pot.'
                );
            }

            winner.rupees +=
                pot;

            reward =
                `+₹${pot}`;
        }

        // ====================
        // DUEL STATS
        // ====================

        winner.duels =
            Number(winner.duels || 0) + 1;

        loser.duels =
            Number(loser.duels || 0) + 1;

        winner.wins =
            Number(winner.wins || 0) + 1;

        await Promise.all([
            winner.save(),
            loser.save()
        ]);

        // Free both users BEFORE UI update.
        busyUsers.delete(
            fight.challengerId
        );

        busyUsers.delete(
            fight.opponentId
        );

        fights.delete(
            fight.id
        );

        const winnerName =
            getUserName(winner);

        const loserName =
            getUserName(loser);

        let resultText = '';

        if (fight.surrendered) {

            resultText +=
`<b>${escapeHtml(loserName)}</b> choose to Surrender

────────────────
`;
        } else {

            resultText +=
`────────────────
`;
        }

        resultText +=
`<b>${escapeHtml(winnerName)} is the champion 🏆</b>

Here is your reward :- <b>${reward}</b>

Finisher move :- <b>${escapeHtml(
    finisherMove || 'Unknown'
)}</b>
────────────────

<b>${escapeHtml(loserName)}</b> Better luck next time !!`;

        try {

            await ctx.editMessageText(
                resultText,
                {
                    parse_mode: 'HTML',
                    reply_markup: {
                        inline_keyboard: []
                    }
                }
            );

        } catch (editError) {

            console.error(
                '❌ Fight result UI error:',
                editError
            );
        }

    } catch (error) {

        console.error(
            '❌ finishFight error:',
            error
        );

        // Important:
        // Do NOT refund/alter anything here because
        // reward may already have been written.

        if (
            fight.status !== 'finished'
        ) {
            fight.status =
                'battle';
        }

        try {

            await ctx.answerCbQuery(
                '❌ Fight result processing failed.',
                {
                    show_alert: true
                }
            );

        } catch (callbackError) {

            console.error(
                '❌ Fight callback error:',
                callbackError
            );
        }
    }
}


// ==================== REGISTER FIGHT ====================

function registerFight(
    bot,
    User
) {

    // ====================
    // /FIGHT
    // ====================

    bot.command(
        'fight',
        async (ctx) => {

            try {

                const replied =
                    ctx.message
                        ?.reply_to_message;

                if (
                    !replied ||
                    !replied.from
                ) {

                    return ctx.reply(
`⚠️ Reply to another player's message with:

/fight

or

/fight <amount>

Example:

/fight 1000`
                    );
                }

                const challengerId =
                    Number(ctx.from.id);

                const opponentId =
                    Number(replied.from.id);

                if (
                    challengerId ===
                    opponentId
                ) {

                    return ctx.reply(
                        '❌ You cannot fight yourself.'
                    );
                }

                if (
                    replied.from.is_bot
                ) {

                    return ctx.reply(
                        '❌ You cannot challenge a bot.'
                    );
                }

                // ====================
                // PARSE AMOUNT
                // ====================

                const parts =
                    ctx.message.text
                        .trim()
                        .split(/\s+/);

                if (
                    parts.length > 2
                ) {

                    return ctx.reply(
`❌ Invalid format.

Use:

/fight

or

/fight <amount>

Gamble range: ₹50 - ₹10000`
                    );
                }

                let gambleAmount =
                    null;

                if (
                    parts.length === 2
                ) {

                    if (
                        !/^\d+$/.test(
                            parts[1]
                        )
                    ) {

                        return ctx.reply(
                            '❌ Gamble amount must be a whole number.'
                        );
                    }

                    gambleAmount =
                        Number(parts[1]);

                    if (
                        gambleAmount <
                            MIN_GAMBLE ||
                        gambleAmount >
                            MAX_GAMBLE
                    ) {

                        return ctx.reply(
`❌ Gamble amount must be between ₹${MIN_GAMBLE} and ₹${MAX_GAMBLE}.`
                        );
                    }
                }

                // ====================
                // FIND USERS
                // ====================

                const challenger =
                    await User.findOne({
                        userId:
                            challengerId
                    });

                const opponent =
                    await User.findOne({
                        userId:
                            opponentId
                    });

                if (!challenger) {

                    return ctx.reply(
                        '⚠️ You must send /start first.'
                    );
                }

                if (!opponent) {

                    return ctx.reply(
                        '⚠️ The challenged player must send /start first.'
                    );
                }

                // ====================
                // DECK CHECK
                // ====================

                if (
                    !Array.isArray(
                        challenger.deck
                    ) ||
                    challenger.deck.length === 0
                ) {

                    return ctx.reply(
                        '❌ Your deck is empty.'
                    );
                }

                if (
                    !Array.isArray(
                        opponent.deck
                    ) ||
                    opponent.deck.length === 0
                ) {

                    return ctx.reply(
                        '❌ The opponent has no alien in their deck.'
                    );
                }

                if (
                    challenger.deck.length >
                    MAX_DECK_SIZE
                ) {

                    return ctx.reply(
                        '❌ Your deck cannot contain more than 4 aliens.'
                    );
                }

                if (
                    opponent.deck.length >
                    MAX_DECK_SIZE
                ) {

                    return ctx.reply(
                        '❌ The opponent deck is invalid.'
                    );
                }

                // ====================
                // BUSY CHECK
                // ====================

                if (
                    busyUsers.has(
                        challengerId
                    )
                ) {

                    return ctx.reply(
                        '⚠️ You already have an active fight or fight request.'
                    );
                }

                if (
                    busyUsers.has(
                        opponentId
                    )
                ) {

                    return ctx.reply(
                        '⚠️ This player already has an active fight or fight request.'
                    );
                }

                // ====================
                // GAMBLE BALANCE
                // ====================

                if (gambleAmount) {

                    if (
                        Number(
                            challenger.rupees
                        ) <
                        gambleAmount
                    ) {

                        return ctx.reply(
`❌ You need ₹${gambleAmount} to start this gamble fight.

Your balance: ₹${challenger.rupees}`
                        );
                    }

                    if (
                        Number(
                            opponent.rupees
                        ) <
                        gambleAmount
                    ) {

                        return ctx.reply(
`❌ The opponent does not have enough Rupees for this gamble.`
                        );
                    }
                }

                // ====================
                // CREATE FIGHT
                // ====================

                const fightId =
                    `${Date.now().toString(36)}${Math.random()
                        .toString(36)
                        .slice(2, 7)}`;

                const challengerName =
                    getUserName(
                        challenger,
                        ctx.from
                    );

                const opponentName =
                    getUserName(
                        opponent,
                        replied.from
                    );

                const fight = {

                    id:
                        fightId,

                    status:
                        'pending',

                    mode:
                        gambleAmount
                            ? 'gamble'
                            : 'normal',

                    gambleAmount:
                        gambleAmount || 0,

                    pot:
                        gambleAmount
                            ? gambleAmount * 2
                            : 0,

                    chatId:
                        ctx.chat.id,

                    messageId:
                        null,

                    challengerId,
                    opponentId,

                  challengerName,
                    opponentName,

                    challengerAlien:
                        null,

                    opponentAlien:
                        null,

                    turn:
                        null,

                    processing:
                        false,

                    attackCount: {
                        challenger: 0,
                        opponent: 0
                    },

                    dodgeUsed: {
                        challenger: false,
                        opponent: false
                    },

                    surrendered:
                        false,

                    lastMove:
                        null,

                    createdAt:
                        Date.now()
                };

                fights.set(
                    fightId,
                    fight
                );

                busyUsers.set(
                    challengerId,
                    fightId
                );

                busyUsers.set(
                    opponentId,
                    fightId
                );

          // ====================
                // SEND REQUEST
                // ====================

                const sent =
                    await ctx.reply(
                        buildRequestMessage(
                            challengerName,
                            opponentName,
                            gambleAmount
                        ),
                        {
                            parse_mode: 'HTML',

                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        {
                                            text:
                                                'Accept',

                                            callback_data:
                                                `fight_accept_${fightId}`
                                        },

                                        {
                                            text:
                                                'Refuse',

                                            callback_data:
                                                `fight_refuse_${fightId}`
                                        }
                                    ]
                                ]
                            }
                        }
                    );

                fight.messageId =
                    sent.message_id;
              // ====================
                // AUTO EXPIRE
                // ====================

                setTimeout(
                    () => {

                        const current =
                            fights.get(
                                fightId
                            );

                        if (
                            current &&
                            current.status ===
                                'pending'
                        ) {

                            fights.delete(
                                fightId
                            );

                            busyUsers.delete(
                                current.challengerId
                            );

                            busyUsers.delete(
                                current.opponentId
                            );
                        }

                    },
                    REQUEST_TIMEOUT
                );

            } catch (error) {

                console.error(
                    '❌ /fight error:',
                    error
                );

                return ctx.reply(
                    '❌ Fight request failed. Please try again.'
                );
            }
        }
    );

// ====================
    // ACCEPT
    // ====================

    bot.action(
        /^fight_accept_(.+)$/,
        async (ctx) => {

            const fight =
                fights.get(
                    ctx.match[1]
                );

            if (!fight) {

                return ctx.answerCbQuery(
                    '⚠️ Fight request expired.',
                    {
                        show_alert: true
                    }
                );
            }

            if (
                ctx.from.id !==
                fight.opponentId
            ) {

                return ctx.answerCbQuery(
                    '❌ Only the challenged player can accept.',
                    {
                        show_alert: true
                    }
                );
            }

            if (
                fight.status !==
                'pending'
            ) {

                return ctx.answerCbQuery(
                    '⚠️ This request is no longer active.'
                );
            }

            fight.status =
                'selecting_challenger';

            await ctx.answerCbQuery();

            const challenger =
                await User.findOne({
                    userId:
                        fight.challengerId
                });

            if (!challenger) {

                fights.delete(
                    fight.id
                );

                busyUsers.delete(
                    fight.challengerId
                );

                busyUsers.delete(
                    fight.opponentId
                );

                return ctx.editMessageText(
                    '❌ Challenger profile not found.'
                );
            }

            return ctx.editMessageText(
                buildDeckSelectionMessage(
                    challenger,
                    fight.challengerName
                ),
                {
                    parse_mode: 'HTML',

                    reply_markup:
                        getDeckKeyboard(
                            fight.id,
                            'challenger',
                            challenger
                        )
                }
            );
        }
    );


// ====================
    // REFUSE
    // ====================

    bot.action(
        /^fight_refuse_(.+)$/,
        async (ctx) => {

            const fight =
                fights.get(
                    ctx.match[1]
                );

            if (!fight) {

                return ctx.answerCbQuery(
                    '⚠️ Fight request expired.'
                );
            }

            if (
                ctx.from.id !==
                fight.opponentId
            ) {

                return ctx.answerCbQuery(
                    '❌ Only the challenged player can refuse.',
                    {
                        show_alert: true
                    }
                );
            }

            if (
                fight.status !==
                'pending'
            ) {

                return ctx.answerCbQuery(
                    '⚠️ This request is no longer active.'
                );
            }

            fight.status =
                'refused';

            fights.delete(
                fight.id
            );

            busyUsers.delete(
                fight.challengerId
            );

            busyUsers.delete(
                fight.opponentId
            );

            await ctx.answerCbQuery(
                'Fight refused.'
            );

            return ctx.editMessageText(
`❌ <b>FIGHT REFUSED</b>

${escapeHtml(
    fight.opponentName
)} refused the fight request.`,
                {
                    parse_mode: 'HTML',

                    reply_markup: {
                        inline_keyboard: []
                    }
                }
            );
        }
    );


// ====================
    // ALIEN SELECTION
    // ====================

    bot.action(
        /^fight_pick_(challenger|opponent)_(.+)_(\d+)$/,
        async (ctx) => {

            const role =
                ctx.match[1];

            const fightId =
                ctx.match[2];

            const slot =
                Number(ctx.match[3]);

            const fight =
                fights.get(
                    fightId
                );

            if (!fight) {

                return ctx.answerCbQuery(
                    '⚠️ Fight session expired.',
                    {
                        show_alert: true
                    }
                );
            }

            const expectedUserId =
                role === 'challenger'
                    ? fight.challengerId
                    : fight.opponentId;

            if (
                ctx.from.id !==
                expectedUserId
            ) {

                return ctx.answerCbQuery(
                    '❌ This selection is not for you.',
                    {
                        show_alert: true
                    }
                );
            }

            const expectedStatus =
                role === 'challenger'
                    ? 'selecting_challenger'
                    : 'selecting_opponent';

            if (
                fight.status !==
                expectedStatus
            ) {

                return ctx.answerCbQuery(
                    '⚠️ It is not your selection turn.'
                );
            }

            if (
                fight.processing
            ) {

                return ctx.answerCbQuery(
                    '⏳ Processing...'
                );
            }

            fight.processing =
                true;

            try {

                const user =
                    await User.findOne({
                        userId:
                            expectedUserId
                    });

                if (!user) {

                    return ctx.answerCbQuery(
                        '❌ User profile not found.',
                        {
                            show_alert: true
                        }
                    );
                }

                const deck =
                    getDeckAliens(user);

                const selected =
                    deck.find(
                        item =>
                            item.slot === slot
                    );

                if (!selected) {

                    return ctx.answerCbQuery(
                        '❌ Invalid deck slot.',
                        {
                            show_alert: true
                        }
                    );
                }

                const battleAlien =
                    await buildBattleAlien(
                        selected.alien
                    );

          // ====================
                // CHALLENGER SELECTED
                // ====================

                if (
                    role ===
                    'challenger'
                ) {

                    fight.challengerAlien =
                        battleAlien;

                    fight.status =
                        'selecting_opponent';

                    await ctx.answerCbQuery();

                    const opponent =
                        await User.findOne({
                            userId:
                                fight.opponentId
                        });

                    if (!opponent) {

                        return ctx.editMessageText(
                            '❌ Opponent profile not found.'
                        );
                    }

                    return ctx.editMessageText(
                        buildDeckSelectionMessage(
                            opponent,
                            fight.opponentName
                        ),
                        {
                            parse_mode:
                                'HTML',

                            reply_markup:
                                getDeckKeyboard(
                                    fight.id,
                                    'opponent',
                                    opponent
                                )
                        }
                    );
                }

          // ====================
                // OPPONENT SELECTED
                // ====================

                fight.opponentAlien =
                    battleAlien;

                // ====================
                // GAMBLE MONEY
                // ====================

                if (
                    fight.mode ===
                    'gamble'
                ) {

                    // Atomic deduction from
                    // challenger.
                    const challenger =
                        await User.findOneAndUpdate(
                            {
                                userId:
                                    fight.challengerId,

                                rupees: {
                                    $gte:
                                        fight.gambleAmount
                                }
                            },

                            {
                                $inc: {
                                    rupees:
                                        -fight.gambleAmount
                                }
                            },

                            {
                                new: true
                            }
                        );

                    if (!challenger) {

                        return ctx.answerCbQuery(
                            '❌ Challenger no longer has enough Rupees.',
                            {
                                show_alert: true
                            }
                        );
                    }

                    // Atomic deduction from
                    // opponent.
                    const opponent =
                        await User.findOneAndUpdate(
                            {
                                userId:
                                    fight.opponentId,

                                rupees: {
                                    $gte:
                                        fight.gambleAmount
                                }
                            },

                            {
                                $inc: {
                                    rupees:
                                        -fight.gambleAmount
                                }
                            },

                            {
                                new: true
                            }
                        );

                    if (!opponent) {

                        // Refund challenger.
                        await User.updateOne(
                            {
                                userId:
                                    fight.challengerId
                            },

                            {
                                $inc: {
                                    rupees:
                                        fight.gambleAmount
                                }
                            }
                        );

                        return ctx.answerCbQuery(
                            '❌ Opponent no longer has enough Rupees.',
                            {
                                show_alert: true
                            }
                        );
                    }
                              }

          // ====================
                // START BATTLE
                // ====================

                fight.status =
                    'battle';

                const firstTurn =
                    getFirstTurn(
                        fight.challengerAlien,
                        fight.opponentAlien
                    );

                fight.turn =
                    firstTurn === 'player'
                        ? 'challenger'
                        : 'opponent';

                fight.lastMove =
                    'Battle started.';

                await ctx.answerCbQuery();

                return ctx.editMessageText(
                    buildBattleMessage(
                        fight
                    ),
                    {
                        parse_mode:
                            'HTML',

                        reply_markup:
                            getBattleKeyboard(
                                fight
                            )
                    }
                );

            } catch (error) {

                console.error(
                    '❌ Fight selection error:',
                    error
                );

                return ctx.answerCbQuery(
                    '❌ Could not select this alien.',
                    {
                        show_alert: true
                    }
                );

            } finally {

                fight.processing =
                    false;
            }
        }
    );


    // ====================
    // ATTACK
    // ====================

    bot.action(
        /^fight_atk_(.+)_(\d+)$/,
        async (ctx) => {

            const fightId =
                ctx.match[1];

            const attackIndex =
                Number(ctx.match[2]);

            const fight =
                fights.get(
                    fightId
                );

            if (!fight) {

                return ctx.answerCbQuery(
                    '⚠️ Fight session expired.',
                    {
                        show_alert: true
                    }
                );
            }

            if (
                fight.status !==
                'battle'
            ) {

                return ctx.answerCbQuery(
                    '⚠️ Battle is not active.'
                );
            }

            const role =
                ctx.from.id ===
                    fight.challengerId
                    ? 'challenger'
                    : ctx.from.id ===
                      fight.opponentId
                        ? 'opponent'
                        : null;

            if (!role) {

                return ctx.answerCbQuery(
                    '❌ You are not part of this fight.',
                    {
                        show_alert: true
                    }
                );
            }

            if (
                fight.turn !==
                role
            ) {

                return ctx.answerCbQuery(
                    '⏳ Wait for your turn.'
                );
            }

            if (
                fight.processing
            ) {

                return ctx.answerCbQuery(
                    '⏳ Processing...'
                );
            }

            const attacker =
                role === 'challenger'
                    ? fight.challengerAlien
                    : fight.opponentAlien;

            const defender =
                role === 'challenger'
                    ? fight.opponentAlien
                    : fight.challengerAlien;

            if (
                !attacker ||
                !defender ||
                !attacker.attacks ||
                !attacker.attacks[
                    attackIndex
                ]
            ) {

                return ctx.answerCbQuery(
                    '❌ Invalid attack.',
                    {
                        show_alert: true
                    }
                );
            }

            fight.processing =
                true;

            try {

                const attack =
                    attacker.attacks[
                        attackIndex
                    ];

          // ====================
                // DAMAGE
                // ====================

                let result =
                    calculateDamage(
                        attacker,
                        defender,
                        attack
                    );

                const incomingMultiplier =
                    getIncomingDamageMultiplier(
                        attacker.element,
                        defender.element
                    );

                result.damage =
                    Math.max(
                        1,
                        Math.round(
                            result.damage *
                            incomingMultiplier
                        )
                    );

                // ====================
                // DODGE
                // ====================

                let dodged =
                    false;

                const defenderRole =
                    role === 'challenger'
                        ? 'opponent'
                        : 'challenger';

                if (
                    fight.attackCount[
                        role
                    ] > 0 &&
                    !fight.dodgeUsed[
                        defenderRole
                    ]
                ) {

                    const dodgeResult =
                        rollDodge(
                            defender,
                            attacker
                        );

                    if (
                        dodgeResult.dodged
                    ) {

                        dodged =
                            true;

                        fight.dodgeUsed[
                            defenderRole
                        ] = true;

                        result.damage =
                            0;
                    }
                }

          // ====================
                // APPLY DAMAGE
                // ====================

                if (!dodged) {

                    defender.currentHp =
                        Math.max(
                            0,
                            defender.currentHp -
                            result.damage
                        );
                }

                fight.attackCount[
                    role
                ] += 1;

                fight.lastMove =
                    attack.name;

                // ====================
                // CALLBACK
                // ====================

                await ctx.answerCbQuery(
                    dodged
                        ? `💨 ${defender.name} dodged!`
                        : `💥 Damage: ${result.damage}`
                );

                // ====================
                // DEFEATED
                // ====================

                if (
                    defender.currentHp <= 0
                ) {

                    const winnerId =
                        role === 'challenger'
                            ? fight.challengerId
                            : fight.opponentId;

                    const loserId =
                        role === 'challenger'
                            ? fight.opponentId
                            : fight.challengerId;

                    fight.processing =
                        false;

                    return finishFight(
                        ctx,
                        User,
                        fight,
                        winnerId,
                        loserId,
                        attack.name
                    );
                }

                // ====================
                // NEXT TURN
                // ====================

                fight.turn =
                    role === 'challenger'
                        ? 'opponent'
                        : 'challenger';

                const attackerName =
                    role === 'challenger'
                        ? fight.challengerName
                        : fight.opponentName;

                const defenderName =
                    role === 'challenger'
                        ? fight.opponentName
                        : fight.challengerName;

                const battleEvent =
                    dodged
                        ? `💨 <b>${escapeHtml(
                            defenderName
                        )}</b> dodged <b>${escapeHtml(
                            attack.name
                        )}</b>!`
                        : `👽 <b>${escapeHtml(
                            attackerName
                        )}</b> used <b>${escapeHtml(
                            attack.name
                        )}</b>\n` +
                          `💥 Damage: <b>${result.damage}</b>`;

                return ctx.editMessageText(
                    buildBattleMessage(
                        fight,
                        battleEvent
                    ),
                    {
                        parse_mode:
                            'HTML',

                        reply_markup:
                            getBattleKeyboard(
                                fight
                            )
                    }
                );

            } catch (error) {

                console.error(
                    '❌ Fight attack error:',
                    error
                );

                try {

                    await ctx.answerCbQuery(
                        '❌ Something went wrong.',
                        {
                            show_alert: true
                        }
                    );

                } catch (callbackError) {

                    console.error(
                        '❌ Attack callback error:',
                        callbackError
                    );
                }

            } finally {

                if (
                    fight.status ===
                    'battle'
                ) {
                    fight.processing =
                        false;
                }
            }
        }
    );


// ====================
    // HEALERX
    // ====================

    bot.action(
        /^fight_heal_(.+)$/,
        async (ctx) => {

            const fight =
                fights.get(
                    ctx.match[1]
                );

            if (!fight) {

                return ctx.answerCbQuery(
                    '⚠️ Fight session expired.',
                    {
                        show_alert: true
                    }
                );
            }

            if (
                fight.status !==
                'battle'
            ) {

                return ctx.answerCbQuery(
                    '⚠️ Battle is not active.'
                );
            }

            const role =
                ctx.from.id ===
                    fight.challengerId
                    ? 'challenger'
                    : ctx.from.id ===
                      fight.opponentId
                        ? 'opponent'
                        : null;

            if (!role) {

                return ctx.answerCbQuery(
                    '❌ You are not part of this fight.',
                    {
                        show_alert: true
                    }
                );
            }

            if (
                fight.turn !==
                role
            ) {

                return ctx.answerCbQuery(
                    '⏳ Wait for your turn.'
                );
            }

            if (
                fight.processing
            ) {

                return ctx.answerCbQuery(
                    '⏳ Processing...'
                );
            }

            fight.processing =
                true;

            try {

                const user =
                    await User.findOne({
                        userId:
                            ctx.from.id
                    });

                if (!user) {

                    return ctx.answerCbQuery(
                        '❌ User profile not found.',
                        {
                            show_alert: true
                        }
                    );
                }

                const healerx =
                    Number(
                        user.inventory?.healerx ||
                        0
                    );

                if (
                    healerx <= 0
                ) {

                    return ctx.answerCbQuery(
                        '❌ You have no HealerX.',
                        {
                            show_alert: true
                        }
                    );
                }

                const playerAlien =
                    role === 'challenger'
                        ? fight.challengerAlien
                        : fight.opponentAlien;

                if (!playerAlien) {

                    return ctx.answerCbQuery(
                        '❌ Your alien is missing.',
                        {
                            show_alert: true
                        }
                    );
                }

                const recovery =
                    calculateHealerxRecovery(
                        playerAlien.maxHp
                    );

                const oldHp =
                    playerAlien.currentHp;

                playerAlien.currentHp =
                    Math.min(
                        playerAlien.maxHp,
                        playerAlien.currentHp +
                        recovery
                    );

                const actualRecovery =
                    playerAlien.currentHp -
                    oldHp;

                // Consume HealerX.
                user.inventory.healerx =
                    healerx - 1;

                await user.save();

                // HealerX consumes turn.
                fight.turn =
                    role === 'challenger'
                        ? 'opponent'
                        : 'challenger';

                fight.lastMove =
                    'HealerX';

                const playerName =
                    role === 'challenger'
                        ? fight.challengerName
                        : fight.opponentName;

                await ctx.answerCbQuery(
                    `🧪 HealerX +${actualRecovery} HP`
                );

                return ctx.editMessageText(
                    buildBattleMessage(
                        fight,
`🧪 <b>${escapeHtml(
    playerName
)}</b> used HealerX
💚 Recovered: <b>${actualRecovery} HP</b>`
                    ),
                    {
                        parse_mode:
                            'HTML',

                        reply_markup:
                            getBattleKeyboard(
                                fight
                            )
                    }
                );

            } catch (error) {

                console.error(
                    '❌ Fight HealerX error:',
                    error
                );

                try {

                    await ctx.answerCbQuery(
                        '❌ HealerX could not be used.',
                        {
                            show_alert: true
                        }
                    );

                } catch (callbackError) {

                    console.error(
                        '❌ HealerX callback error:',
                        callbackError
                    );
                }

            } finally {

                if (
                    fight.status ===
                    'battle'
                ) {
                    fight.processing =
                        false;
                }
            }
        }
    );

// ====================
    // SURRENDER
    // ====================

    bot.action(
        /^fight_surrender_(.+)$/,
        async (ctx) => {

            const fight =
                fights.get(
                    ctx.match[1]
                );

            if (!fight) {

                return ctx.answerCbQuery(
                    '⚠️ Fight session expired.',
                    {
                        show_alert: true
                    }
                );
            }

            if (
                fight.status !==
                'battle'
            ) {

                return ctx.answerCbQuery(
                    '⚠️ Battle is not active.'
                );
            }

            const surrendererId =
                Number(ctx.from.id);

            if (
                surrendererId !==
                    fight.challengerId &&
                surrendererId !==
                    fight.opponentId
            ) {

                return ctx.answerCbQuery(
                    '❌ You are not part of this fight.',
                    {
                        show_alert: true
                    }
                );
            }

            if (
                fight.processing
            ) {

                return ctx.answerCbQuery(
                    '⏳ Processing...'
                );
            }

            fight.processing =
                true;

            const winnerId =
                surrendererId ===
                    fight.challengerId
                    ? fight.opponentId
                    : fight.challengerId;

            fight.surrendered =
                true;

            const loserId =
                surrendererId;

            try {

                await ctx.answerCbQuery(
                    '🏳️ You surrendered.'
                );

            } catch (error) {

                console.error(
                    '❌ Surrender callback error:',
                    error
                );
            }

            fight.processing =
                false;

            return finishFight(
                ctx,
                User,
                fight,
                winnerId,
                loserId,
                'Surrender'
            );
        }
    );
}


// ==================== EXPORT ====================

module.exports = {
    registerFight
};
