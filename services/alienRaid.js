// ==================== ALIEN RAID UI ====================

const {
    createRaid,
    getRaid,
    joinRaid,
    playerAttack,
    playerGuard,
    playerDodge,
    playerHealerX,
    runFromRaid,
    calculateContributions,
    buildRaidResult,
    removeRaid
} = require('./alienRaidEngine');

const RAID_CONFIG =
    require('../Config/AlienRaid');


// ==================== RAID UI STORAGE ====================

const raidUiLocks = new Map();


// ==================== HELPERS ====================

function escapeHtml(value) {

    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}


function sleep(ms) {

    return new Promise(resolve =>
        setTimeout(resolve, ms)
    );
}


function getUsername(user) {

    return escapeHtml(
        user?.username ||
        user?.first_name ||
        'Hunter'
    );
}


function getDifficultyName(difficulty) {

    const key =
        String(difficulty || '')
            .toUpperCase();

    const names = {
        NORMAL: 'NORMAL',
        HARD: 'HARD',
        EXTREME: 'EXTREME'
    };

    return names[key] || key;
}


function getDifficultyCost(difficulty) {

    const key =
        String(difficulty || '')
            .toUpperCase();

    return Number(
        RAID_CONFIG[key]?.entryCost || 0
    );
}


function getRaidUiKey(raid) {

    return String(
        raid?.raidId || ''
    );
}


// ==================== OPENING LINES ====================

const OPENING_LINES = [

    'How did you dare to set foot in my area? You chose your own death.',

    'You have entered my territory. Now prepare to face the consequences.',

    'Another foolish hunter has come to challenge me. How amusing.',

    'You really thought you could survive here? Let us put that confidence to the test.',

    'This is my domain. Every step you take brings you closer to your defeat.',

    'You came looking for a battle. I hope you are ready for what you have found.',

    'Your courage brought you here. Unfortunately, courage alone will not save you.',

    'You disturbed my territory. Now you will pay the price for your mistake.',

    'So you wish to challenge me? Very well. Let the battle begin.',

    'You have walked straight into my territory. There will be no easy escape.'
];


// ==================== LOSING / ROASTING LINES ====================

const LOSING_LINES = [

    'Better luck next time! Hahahaha!',

    'You came with confidence and left with nothing!',

    'Was that really your best? How disappointing.',

    'You should have stayed away from my territory!',

    'All that courage just to end up defeated!',

    'You challenged me and learned the hard way!',

    'Come back when you are ready to lose again!',

    'Your journey ends here, little hunter!',

    'You almost had me... almost! 😂',

    'What happened? I thought you were supposed to be strong!'
];


function getRandomLine(lines) {

    return lines[
        Math.floor(
            Math.random() * lines.length
        )
    ];
}


// ==================== HP BAR ====================

function createHpBar(currentHp, maxHp) {

    const maxBlocks = 12;

    const safeMax =
        Math.max(
            1,
            Number(maxHp || 1)
        );

    const safeCurrent =
        Math.max(
            0,
            Math.min(
                Number(currentHp || 0),
                safeMax
            )
        );

    const percentage =
        safeCurrent / safeMax;

    const filled =
        Math.max(
            0,
            Math.round(
                percentage * maxBlocks
            )
        );

    const empty =
        maxBlocks - filled;

    return (
        '▰'.repeat(filled) +
        '▱'.repeat(empty)
    );
}


// ==================== ACTION BUTTONS ====================

function getSoloButtons(raidId) {

    return {

        inline_keyboard: [

            [
                {
                    text: '⚔️ ATK',
                    callback_data:
                        `araid_atk_${raidId}`
                },

                {
                    text: '💚 HEALERX',
                    callback_data:
                        `araid_heal_${raidId}`
                }
            ],

            [
                {
                    text: '💨 DODGE',
                    callback_data:
                        `araid_dodge_${raidId}`
                },

                {
                    text: '🛡 GUARD',
                    callback_data:
                        `araid_guard_${raidId}`
                },

                {
                    text: '🏃 RUN',
                    callback_data:
                        `araid_run_${raidId}`
                }
            ]

        ]

    };
}


function getMultiplayerButtons(
    raid,
    raidId
) {

    const cost =
        getDifficultyCost(
            raid.difficulty
        );

    return {

        inline_keyboard: [

            [
                {
                    text: '⚔️ ATK',
                    callback_data:
                        `araid_atk_${raidId}`
                },

                {
                    text: '💚 HEALERX',
                    callback_data:
                        `araid_heal_${raidId}`
                }
            ],

            [
                {
                    text: '💨 DODGE',
                    callback_data:
                        `araid_dodge_${raidId}`
                },

                {
                    text: '🛡 GUARD',
                    callback_data:
                        `araid_guard_${raidId}`
                },

                {
                    text: '🏃 RUN',
                    callback_data:
                        `araid_run_${raidId}`
                }
            ],

            [
                {
                    text:
                        `🤝 JOIN ${getDifficultyName(raid.difficulty)} ₹${cost}`,

                    callback_data:
                        `araid_join_${raidId}`
                }
            ]

        ]

    };
}


// ==================== CONTRIBUTION ====================

function buildContributionText(raid) {

    const contributions =
        calculateContributions(raid);

    if (!contributions.length) {
        return '';
    }

    let text =
        '📊 <b>CONTRIBUTION</b>\n\n';

    contributions
        .slice(0, 6)
        .forEach(player => {

            text +=
                `${escapeHtml(player.username)} — ` +
                `${player.damage} DMG ` +
                `(${Number(player.contribution || 0).toFixed(1)}%)\n`;

        });

    return text;
}


// ==================== BATTLE MESSAGE ====================

function buildBattleMessage(
    raid,
    activePlayerId = null,
    actionResult = null,
    openingLine = null
) {

    const boss =
        raid.boss;

    const player =
        activePlayerId
            ? raid.players.get(
                Number(activePlayerId)
            )
            : Array.from(
                raid.players.values()
            )[0];

    if (!player) {
        return '❌ Raid player data could not be found.';
    }

    let message =
`🏰------- <b>${escapeHtml(boss.name)}</b> --------🏰

<b>DIFFICULTY = ${escapeHtml(getDifficultyName(raid.difficulty))}</b>

❤️ ${boss.currentHp}/${boss.maxHp} HP
${createHpBar(boss.currentHp, boss.maxHp)}
`;

    if (openingLine) {

        message +=
            `\n${escapeHtml(openingLine)}\n`;

    }

    message +=
        '\n━━━━━━━━━━━━━━━━\n';

    // ==================== ACTION RESULT ====================

    if (actionResult) {

        if (
            actionResult.action ===
            'attack'
        ) {

            message +=
                `⚔️ <b>Your action</b> = ATK\n`;

            if (
                actionResult.bossAttack
            ) {

                message +=
                    `👑 <b>Boss atk</b> = ` +
                    `${escapeHtml(actionResult.bossAttack.name)}\n`;

            }

        }

        else if (
            actionResult.action ===
            'guard'
        ) {

            message +=
                `🛡 <b>Your action</b> = GUARD\n`;

            if (
                actionResult.bossAttack
            ) {

                message +=
                    `👑 <b>Boss atk</b> = ` +
                    `${escapeHtml(actionResult.bossAttack.name)}\n`;

            }

        }

        else if (
            actionResult.action ===
            'dodge'
        ) {

            message +=
                `💨 <b>Your action</b> = DODGE\n`;

            if (
                actionResult.bossAttack
            ) {

                message +=
                    `👑 <b>Boss atk</b> = ` +
                    `${escapeHtml(actionResult.bossAttack.name)}\n`;

            }

        }

        else if (
            actionResult.action ===
            'healerx'
        ) {

            message +=
                `💚 <b>Your action</b> = HEALERX\n`;

        }

        message +=
            '\n';

        if (
            actionResult.action ===
            'attack'
        ) {

            message +=
                `🔥 <b>Your dmg</b> = ` +
                `${actionResult.damage} DMG\n`;

        }

        if (
            actionResult.action ===
            'guard'
        ) {

            message +=
                `🛡 <b>You guarded the atk</b>\n`;

        }

        if (
            actionResult.action ===
            'dodge'
        ) {

            if (actionResult.dodged) {

                message +=
                    `💨 <b>You dodged the atk</b>\n`;

            }

        }

        if (
            actionResult.action ===
            'healerx'
        ) {

            message +=
                `💚 <b>You used HealerX</b> ` +
                `[+${actionResult.recovery} HP]\n`;

        }

        if (
            actionResult.bossAttack &&
            !actionResult.dodged
        ) {

            message +=
                `👑 <b>Boss used</b> = ` +
                `${escapeHtml(actionResult.bossAttack.name)} ` +
                `[💥 ${actionResult.bossDamage} DMG]\n`;

        }

    }

    message +=
        '\n━━━━━━━━━━━━━━━━\n';

    // ==================== MULTIPLAYER CONTRIBUTION ====================

    if (
        raid.mode ===
        'MULTIPLAYER'
    ) {

        message +=
            buildContributionText(raid) +
            '\n━━━━━━━━━━━━━━━━\n';

    }

    message +=
        `👽 <b>${escapeHtml(player.alienName)}</b>\n` +
        `👤 <b>${escapeHtml(player.username)}</b>\n` +
        `❤️ ${player.currentHp}/${player.maxHp} HP\n` +
        `${createHpBar(player.currentHp, player.maxHp)}\n`;

    if (player.defeated) {

        message +=
            `\n💀 <b>${escapeHtml(player.username)} has been defeated.</b>\n`;

    }

    message +=
        '\n━━━━━━━━━━━━━━━━\n' +
        'Choose your next move ✅';

    return message;
}


// ==================== RAID RESULT ====================

function buildWinMessage(
    raid,
    result
) {

    let message =
`YAHOO!! AND A REMARKABLE WIN 🔥

BOSS HAS ADMITTED HIS DEFEAT AND
CHOOSEN TO RUN AWAY WHILE CRYING 😂

HERE IS YOUR REWARD 💖

`;

    if (
        raid.mode ===
        'SOLO'
    ) {

        const reward =
            result.rewards;

        message +=
            `⭐ XP = <b>${reward.xp}</b>\n`;

        if (
            reward.money > 0
        ) {

            message +=
                `💰 Rupees = <b>₹${reward.money}</b>\n`;

        }

        else if (
            reward.item
        ) {

            message +=
                `🎁 ${escapeHtml(reward.item.name)} ×${reward.item.quantity}\n`;

        }

        return message;
    }

    // ==================== MULTIPLAYER WIN ====================

    message +=
        buildContributionText(raid) +
        '\n━━━━━━━━━━━━━━━━\n\n';

    message +=
        '<b>🎁 REWARDS</b>\n\n';

    for (
        const reward of
        result.rewards
    ) {

        message +=
            `👤 <b>${escapeHtml(reward.username)}</b>\n` +
            `🔥 ${reward.damage} DMG ` +
            `(${Number(reward.contribution || 0).toFixed(1)}%)\n` +
            `⭐ XP = <b>${reward.xp}</b>\n` +
            `💰 Rupees = <b>₹${reward.money}</b>\n\n`;

    }

    return message;
}


function buildLoseMessage(
    raid
) {

    const roast =
        getRandomLine(
            LOSING_LINES
        );

    let message =
`AAH! THE WIN WAS TOO CLOSE 😭
BETTER LUCK NEXT TIME 🤞🏻

${roast}

━━━━━━━━━━━━━━━━
`;

    if (
        raid.mode ===
        'MULTIPLAYER'
    ) {

        message +=
            buildContributionText(raid) +
            '\n━━━━━━━━━━━━━━━━\n';

    }

    message +=
        '\n💰 REWARD = 0\n' +
        '🎁 ITEMS = 0\n' +
        '⭐ XP = 0';

    return message;
}


// ==================== SET MESSAGE DATA ====================

function setRaidMessageData(
    raid,
    chatId,
    messageId
) {

    raid.chatId =
        chatId;

    raid.messageId =
        messageId;

    raid.updatedAt =
        Date.now();
}


// ==================== EDIT RAID MESSAGE ====================

async function editRaidMessage(
    ctx,
    raid,
    text,
    keyboard
) {

    try {

        await ctx.telegram.editMessageCaption(
            raid.chatId,
            raid.messageId,
            undefined,
            text,
            {
                parse_mode: 'HTML',
                reply_markup: keyboard
            }
        );

    } catch (error) {

        // If the caption did not change,
        // Telegram can return an error.
        if (
            !String(error.message || '')
                .toLowerCase()
                .includes('message is not modified')
        ) {

            console.error(
                '❌ Raid message edit error:',
                error
            );

            throw error;
        }

    }
}


// ==================== FINISH RAID ====================

async function finishRaid(
    ctx,
    raid
) {

    if (!raid) {
        return;
    }

    if (
        raid.status !==
        'boss_defeated'
    ) {

        return;
    }

    try {

        const result =
            buildRaidResult(raid);

        const text =
            buildWinMessage(
                raid,
                result
            );

        await editRaidMessage(
            ctx,
            raid,
            text,
            {
                inline_keyboard: []
            }
        );

        // ==================== GIVE REWARDS ====================

        if (
            raid.mode ===
            'SOLO'
        ) {

            const reward =
                result.rewards;

            const user =
                await ctx.state
                    ?.User
                    ?.findOne({
                        userId:
                            Number(
                                reward.userId
                            )
                    });

            // User model is normally passed
            // through registerAlienRaid.
            // Actual reward saving is handled
            // below through the registered User model.

        }

    } catch (error) {

        console.error(
            '❌ finishRaid error:',
            error
        );

    }
}


// ==================== REWARD PROCESSING ====================

async function applyRaidRewards(
    User,
    raid,
    result
) {

    if (
        raid.mode ===
        'SOLO'
    ) {

        const reward =
            result.rewards;

        const user =
            await User.findOne({
                userId:
                    Number(
                        reward.userId
                    )
            });

        if (!user) {
            return;
        }

        // XP reward is stored separately
        // through raidXp.
        user.raidXp =
            Number(
                user.raidXp || 0
            ) +
            Number(
                reward.xp || 0
            );

        if (
            Number(reward.money || 0) > 0
        ) {

            user.rupees +=
                Number(
                    reward.money
                );

        }

        else if (
            reward.item
        ) {

            const itemName =
                String(
                    reward.item.name ||
                    ''
                ).toLowerCase();

            const quantity =
                Number(
                    reward.item.quantity || 0
                );

            if (
                itemName ===
                'healerx'
            ) {

                user.inventory.healerx =
                    Number(
                        user.inventory.healerx || 0
                    ) +
                    quantity;

            }

            else if (
                itemName ===
                'buff'
            ) {

                user.inventory.buff =
                    Number(
                        user.inventory.buff || 0
                    ) +
                    quantity;

            }

            else if (
                itemName ===
                'deff' ||
                itemName ===
                'defense' ||
                itemName ===
                'defence'
            ) {

                user.inventory.defense =
                    Number(
                        user.inventory.defense || 0
                    ) +
                    quantity;

            }

        }

        await user.save();

        return;
    }

    // ==================== MULTIPLAYER ====================

    for (
        const reward of
        result.rewards
    ) {

        const user =
            await User.findOne({
                userId:
                    Number(
                        reward.userId
                    )
            });

        if (!user) {
            continue;
        }

        user.raidXp =
            Number(
                user.raidXp || 0
            ) +
            Number(
                reward.xp || 0
            );

        user.rupees +=
            Number(
                reward.money || 0
            );

        await user.save();

    }
}


// ==================== RAID DEFEAT CHECK ====================

function allPlayersDefeated(
    raid
) {

    const players =
        Array.from(
            raid.players.values()
        );

    if (!players.length) {
        return true;
    }

    return players.every(
        player =>
            player.defeated
    );
}


// ==================== REGISTER ====================

function registerAlienRaid(
    bot,
    User
) {

    // ==================== /ARAID ====================

    bot.command(
        'araid',
        async ctx => {

            try {

                const user =
                    await User.findOne({
                        userId:
                            ctx.from.id
                    });

                if (!user) {

                    return ctx.reply(
                        '⚠️ Please send /start first!'
                    );

                }

                if (!user.raidAlien) {

                    return ctx.reply(
                        '❌ You have not set your Raid Alien yet.\n\n' +
                        'Set a Raid Alien first.'
                    );

                }

                return ctx.reply(

`🕊️ <b>PLEASE CHOOSE YOUR RAID MODE!!</b>`,

                    {
                        parse_mode:
                            'HTML',

                        reply_markup: {

                            inline_keyboard: [

                                [
                                    {
                                        text:
                                            'SOLO',

                                        callback_data:
                                            'araid_mode_SOLO'
                                    },
                                  {
                                        text:
                                            'MULTIPLAYER',

                                        callback_data:
                                            'araid_mode_MULTIPLAYER'
                                    }
                                ]

                            ]

                        }

                    }
                );

            } catch (error) {

                console.error(
                    '❌ /araid error:',
                    error
                );

                return ctx.reply(
                    '❌ Could not open Alien Raid.'
                );

            }

        }
    );

  // ==================== MODE ====================

    bot.action(
        /^araid_mode_(SOLO|MULTIPLAYER)$/,
        async ctx => {

            try {

                await ctx.answerCbQuery();

                const mode =
                    ctx.match[1];

                return ctx.editMessageText(

`<b>HOW STRONG ARE YOU?</b>
CHOOSE WISELY 🍀

NORMAL - ₹500
HARD - ₹800
EXTREME - ₹1600`,

                    {
                        parse_mode:
                            'HTML',

                        reply_markup: {

                            inline_keyboard: [

                                [
                                    {
                                        text:
                                            'NORMAL',

                                        callback_data:
                                            `araid_difficulty_${mode}_NORMAL`
                                    },

                                    {
                                        text:
                                            'HARD',

                                        callback_data:
                                            `araid_difficulty_${mode}_HARD`
                                    },

                                    {
                                        text:
                                            'EXTREME',

                                        callback_data:
                                            `araid_difficulty_${mode}_EXTREME`
                                    }
                                ]

                            ]

                        }

                    }
                );

            } catch (error) {

                console.error(
                    '❌ Raid mode error:',
                    error
                );

                try {
                    await ctx.answerCbQuery(
                        '❌ Could not select raid mode.',
                        {
                            show_alert:
                                true
                        }
                    );
                } catch {}

            }

        }
    );

  // ==================== DIFFICULTY ====================

    bot.action(
        /^araid_difficulty_(SOLO|MULTIPLAYER)_(NORMAL|HARD|EXTREME)$/,
        async ctx => {

            try {

                await ctx.answerCbQuery();

                const mode =
                    ctx.match[1];

                const difficulty =
                    ctx.match[2];

                const user =
                    await User.findOne({
                        userId:
                            ctx.from.id
                    });

                if (!user) {

                    return ctx.reply(
                        '⚠️ Please send /start first!'
                    );

                }

                if (!user.raidAlien) {

                    return ctx.reply(
                        '❌ Your Raid Alien is not set.'
                    );

                }

                const raid =
                    await createRaid({
                        user,
                        difficulty,
                        mode
                    });

                // Initial boss line
                raid.openingLine =
                    getRandomLine(
                        OPENING_LINES
                    );

                // Send boss image
                const sent =
                    await ctx.replyWithPhoto(
                        raid.boss.imageFileId,
                        {
                            caption:
                                buildBattleMessage(
                                    raid,
                                    ctx.from.id,
                                    null,
                                    raid.openingLine
                                ),

                            parse_mode:
                                'HTML',

                            reply_markup:
                                mode ===
                                'MULTIPLAYER'
                                    ? getMultiplayerButtons(
                                        raid,
                                        raid.raidId
                                    )
                                    : getSoloButtons(
                                        raid.raidId
                                    )
                        }
                    );

                setRaidMessageData(
                    raid,
                    sent.chat.id,
                    sent.message_id
                );

                // Small safety lock so another
                // action cannot immediately
                // be queued after the first action.
                raidUiLocks.set(
                    getRaidUiKey(raid),
                    false
                );

            } catch (error) {

                console.error(
                    '❌ Raid difficulty error:',
                    error
                );

                try {

                    await ctx.answerCbQuery(
                        `❌ ${error.message || 'Could not start raid.'}`,
                        {
                            show_alert:
                                true
                        }
                    );

                } catch {}

            }

        }
    );


    // ==================== JOIN ====================

    bot.action(
        /^araid_join_(.+)$/,
        async ctx => {

            const raidId =
                ctx.match[1];

            try {

                const raid =
                    getRaid(raidId);

                if (!raid) {

                    return ctx.answerCbQuery(
                        '❌ This raid is no longer active.',
                        {
                            show_alert:
                                true
                        }
                    );

                }

                const user =
                    await User.findOne({
                        userId:
                            ctx.from.id
                    });

                if (!user) {

                    return ctx.answerCbQuery(
                        '⚠️ Please send /start first.',
                        {
                            show_alert:
                                true
                        }
                    );

                }

                const result =
                    await joinRaid({
                        raidId,
                        user
                    });

                if (!result.ok) {

                    const messages = {

                        not_found:
                            '❌ This raid is no longer active.',

                        finished:
                            '❌ This raid has already ended.',

                        solo:
                            '❌ This is a solo raid.',

                        already_joined:
                            '⚠️ You are already a part of this raid.',

                        full:
                            "❌ You can't join this raid. The size is already full."

                    };

                    return ctx.answerCbQuery(
                        messages[
                            result.reason
                        ] ||
                        '❌ You cannot join this raid.',
                        {
                            show_alert:
                                true
                        }
                    );

                }

                await ctx.answerCbQuery(
                    '🤝 You joined the raid!'
                );

                const currentRaid =
                    getRaid(raidId);

                if (!currentRaid) {
                    return;
                }

                await editRaidMessage(
                    ctx,
                    currentRaid,

                    buildBattleMessage(
                        currentRaid,
                        ctx.from.id,
                        null,
                        null
                    ),

                    getMultiplayerButtons(
                        currentRaid,
                        raidId
                    )
                );

            } catch (error) {

                console.error(
                    '❌ Raid join error:',
                    error
                );

                try {

                    await ctx.answerCbQuery(
                        '❌ Could not join the raid.',
                        {
                            show_alert:
                                true
                        }
                    );

                } catch {}

            }

        }
    );

  // ==================== ACTION HANDLER ====================

    async function handleAction(
        ctx,
        action
    ) {

        const raidId =
            ctx.match[1];

        const userId =
            Number(
                ctx.from.id
            );

        const raid =
            getRaid(raidId);
        if (
    raid &&
    Date.now() -
    Number(raid.updatedAt || raid.createdAt || 0)
    >=
    10 * 60 * 1000
) {

    raid.status =
        'expired';

    removeRaid(
        raidId
    );

    return ctx.answerCbQuery(
        '⏰ This raid expired due to 10 minutes of inactivity.',
        {
            show_alert: true
        }
    );

        }

        if (!raid) {

            return ctx.answerCbQuery(
                '❌ This raid is no longer active.',
                {
                    show_alert:
                        true
                }
            );

        }

        const player =
            raid.players.get(
                userId
            );

        if (!player) {

            return ctx.answerCbQuery(
                '❌ You are not a part of this raid.',
                {
                    show_alert:
                        true
                }
            );

        }

        if (player.defeated) {

            return ctx.answerCbQuery(
                '💀 You have been defeated.',
                {
                    show_alert:
                        true
                }
            );

        }

        const uiKey =
            getRaidUiKey(raid);

        if (
            raidUiLocks.get(uiKey)
        ) {

            return ctx.answerCbQuery(
                '⏳ Please wait for the current move to finish.',
                {
                    show_alert:
                        false
                }
            );

        }

        raidUiLocks.set(
            uiKey,
            true
        );

        try {

            await ctx.answerCbQuery();

            let result;

            if (
                action ===
                'attack'
            ) {

                result =
                    await playerAttack({
                        raidId,
                        userId
                    });

            }

            else if (
                action ===
                'guard'
            ) {

                result =
                    await playerGuard({
                        raidId,
                        userId
                    });

            }

            else if (
                action ===
                'dodge'
            ) {

                result =
                    await playerDodge({
                        raidId,
                        userId
                    });

            }

            else if (
                action ===
                'healerx'
            ) {

                const user =
                    await User.findOne({
                        userId
                    });

                if (!user) {

                    throw new Error(
                        'User not found.'
                    );

                }

                result =
                    await playerHealerX({
                        raidId,
                        user
                    });

            }

            else {

                return;
            }

            if (!result?.ok) {

                const errorMessages = {

                    processing:
                        '⏳ Another player is already making a move.',

                    defeated:
                        '💀 You have been defeated.',

                    not_participant:
                        '❌ You are not a part of this raid.',

                    no_healerx:
                        '❌ You do not have any HealerX.',

                    boss_defeated:
                        '👑 The boss has already been defeated.'

                };

                return ctx.answerCbQuery(
                    errorMessages[
                        result?.reason
                    ] ||
                    '❌ This move could not be completed.',
                    {
                        show_alert:
                            false
                    }
                );

            }

            const currentRaid =
                getRaid(raidId);

            if (!currentRaid) {
                return;
            }

          
  // ==================== BOSS DEFEATED ====================

            if (
                currentRaid.status ===
                'boss_defeated'
            ) {

                const finalResult =
                    buildRaidResult(
                        currentRaid
                    );

                await applyRaidRewards(
                    User,
                    currentRaid,
                    finalResult
                );

                await editRaidMessage(
                    ctx,
                    currentRaid,

                    buildWinMessage(
                        currentRaid,
                        finalResult
                    ),

                    {
                        inline_keyboard:
                            []
                    }
                );

                removeRaid(
                    raidId
                );

                return;
            }

            // ==================== PLAYER DEFEATED ====================

            if (
                result.playerDefeated
            ) {

                if (
                    allPlayersDefeated(
                        currentRaid
                    )
                ) {

                    currentRaid.status =
                        'defeated';

                    await editRaidMessage(
                        ctx,
                        currentRaid,
                        buildLoseMessage(
                            currentRaid
                        ),
                        {
                            inline_keyboard:
                                []
                        }
                    );

                    removeRaid(
                        raidId
                    );

                    return;
                }

            }

            // ==================== NORMAL UPDATE ====================

            await sleep(2000);

            const updatedRaid =
                getRaid(raidId);

            if (!updatedRaid) {
                return;
            }

            const activePlayer =
                updatedRaid.players.get(
                    userId
                );

            await editRaidMessage(
                ctx,
                updatedRaid,

                buildBattleMessage(
                    updatedRaid,
                    userId,
                    result,
                    null
                ),

                updatedRaid.mode ===
                'MULTIPLAYER'
                    ? getMultiplayerButtons(
                        updatedRaid,
                        raidId
                    )
                    : getSoloButtons(
                        raidId
                    )
            );

        } catch (error) {

            console.error(
                '❌ Raid action error:',
                error
            );

            try {

                await ctx.answerCbQuery(
                    '❌ Something went wrong with this move.',
                    {
                        show_alert:
                            true
                    }
                );

            } catch {}

        } finally {

            // Keep the UI locked for the
            // full update cycle.
            await sleep(2000);

            raidUiLocks.set(
                uiKey,
                false
            );

        }

    }


    // ==================== ATTACK ====================

    bot.action(
        /^araid_atk_(.+)$/,
        ctx =>
            handleAction(
                ctx,
                'attack'
            )
    );


    // ==================== GUARD ====================

    bot.action(
        /^araid_guard_(.+)$/,
        ctx =>
            handleAction(
                ctx,
                'guard'
            )
    );


    // ==================== DODGE ====================

    bot.action(
        /^araid_dodge_(.+)$/,
        ctx =>
            handleAction(
                ctx,
                'dodge'
            )
    );


    // ==================== HEALERX ====================

    bot.action(
        /^araid_heal_(.+)$/,
        ctx =>
            handleAction(
                ctx,
                'healerx'
            )
    );


    // ==================== RUN ====================

    bot.action(
        /^araid_run_(.+)$/,
        async ctx => {

            const raidId =
                ctx.match[1];

            try {

                const raid =
                    getRaid(raidId);

                if (!raid) {

                    return ctx.answerCbQuery(
                        '❌ This raid is no longer active.',
                        {
                            show_alert:
                                true
                        }
                    );

                }

                const player =
                    raid.players.get(
                        Number(
                            ctx.from.id
                        )
                    );

                if (!player) {

                    return ctx.answerCbQuery(
                        '❌ You are not a part of this raid.',
                        {
                            show_alert:
                                true
                        }
                    );

                }

                const result =
                    runFromRaid({
                        raidId,
                        userId:
                            ctx.from.id
                    });

                if (!result.ok) {

                    return ctx.answerCbQuery(
                        '❌ Could not leave the raid.',
                        {
                            show_alert:
                                true
                        }
                    );

                }

                await ctx.answerCbQuery(
                    '🏃 You left the raid.'
                );

                const updatedRaid =
                    getRaid(raidId);

                if (!updatedRaid) {
                    return;
                }

                // If solo player runs,
                // raid ends with 0 reward.
                if (
                    updatedRaid.mode ===
                    'SOLO'
                ) {

                    updatedRaid.status =
                        'defeated';

                    await editRaidMessage(
                        ctx,
                        updatedRaid,
                        buildLoseMessage(
                            updatedRaid
                        ),
                        {
                            inline_keyboard:
                                []
                        }
                    );

                    removeRaid(
                        raidId
                    );

                    return;
                }

                await editRaidMessage(
                    ctx,
                    updatedRaid,

                    buildBattleMessage(
                        updatedRaid,
                        Array.from(
                            updatedRaid.players.keys()
                        )[0],
                        null,
                        null
                    ),

                    getMultiplayerButtons(
                        updatedRaid,
                        raidId
                    )
                );

            } catch (error) {

                console.error(
                    '❌ Raid run error:',
                    error
                );

                try {

                    await ctx.answerCbQuery(
                        '❌ Could not leave the raid.',
                        {
                            show_alert:
                                true
                        }
                    );

                } catch {}

            }

        }
    );

}


module.exports = {
    registerAlienRaid
};

                      
