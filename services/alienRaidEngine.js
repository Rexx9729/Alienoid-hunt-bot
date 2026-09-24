// ==================== ALIEN RAID ENGINE ====================

const Alien = require('../models/Alien');

const {
    calculateDamage,
    getIncomingDamageMultiplier,
    calculateHealerxRecovery,
    rollDodge,
    createHpBar
} = require('./battleEngine');

const RAID_CONFIG =
    require('../Config/AlienRaid');
const {
    getLevelData,
    getRaidXp
} = require('./levelSystem');

// ==================== ACTIVE RAID STORAGE ====================

const activeRaids = new Map();

const raidCreationLocks = new Set();

function getActiveRaidForUser(userId) {
    const id = Number(userId);

    for (const raid of activeRaids.values()) {
        if (
            raid.status === 'active' &&
            raid.players.has(id)
        ) {
            return raid;
        }
    }

    return null;
}

function expireRaidIfInactive(raid) {
    if (!raid || raid.status !== 'active') {
        return false;
    }

    const inactiveFor =
        Date.now() - Number(raid.updatedAt || raid.createdAt || Date.now());

    if (inactiveFor < 10 * 60 * 1000) {
        return false;
    }

    raid.status = 'expired';

    activeRaids.delete(raid.raidId);

    return true;
}
// ==================== HELPERS ====================

function randomNumber(min, max) {

    min = Number(min || 0);
    max = Number(max || min);

    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;
}


function getDifficultyConfig(difficulty) {

    const key =
        String(difficulty || '')
            .toUpperCase();

    return RAID_CONFIG[key] || null;
}


function getBossRarity(difficulty) {

    const rarityMap = {

        NORMAL: 'Legendary',
        HARD: 'Cosmic',
        EXTREME: 'God'

    };

    return rarityMap[
        String(difficulty || '')
            .toUpperCase()
    ] || null;
}


function getRaidKey(chatId, messageId) {

    return `${chatId}:${messageId}`;
}


function getPlayerName(user) {

    return (
        user?.username ||
        'Hunter'
    );
}


function getOwnedRaidAlien(user) {

    const raidAlien =
        user?.raidAlien;

    if (!raidAlien) {
        return null;
    }

    const alienId =
        String(
            raidAlien.alienId ||
            raidAlien.id ||
            ''
        );

    const alienName =
        String(
            raidAlien.name ||
            ''
        ).toLowerCase();

    if (!alienId && !alienName) {
        return null;
    }

    const ownedAlien =
        (user.aliens || []).find(
            alien => {

                if (
                    alienId &&
                    String(alien.alienId) ===
                    alienId
                ) {
                    return true;
                }

                if (
                    alienName &&
                    String(alien.name || '')
                        .toLowerCase() ===
                    alienName
                ) {
                    return true;
                }

                return false;
            }
        );

    return ownedAlien || null;
}


// ==================== BOSS CREATION ====================

async function createBoss(difficulty) {

    const rarity =
        getBossRarity(difficulty);

    if (!rarity) {
        throw new Error(
            'Invalid raid difficulty.'
        );
    }

    const bosses =
        await Alien.find({
            rarity
        });

    if (!bosses.length) {
        throw new Error(
            `No ${rarity} raid boss found.`
        );
    }

    const databaseBoss =
        bosses[
            Math.floor(
                Math.random() *
                bosses.length
            )
        ];

    return {

        alienId:
            String(databaseBoss._id),

        name:
            databaseBoss.name,

        rarity:
            databaseBoss.rarity,

        element:
            databaseBoss.element,

        imageFileId:
            databaseBoss.imageFileId,

        // RAID BOSS HP = DATABASE HP × 2
        maxHp:
            Math.max(
                1,
                Number(databaseBoss.maxHp || 1) * 2
            ),

        currentHp:
            Math.max(
                1,
                Number(databaseBoss.maxHp || 1) * 2
            ),

        // ALL OTHER STATS SAME AS DATABASE

        defense:
            Number(databaseBoss.defense || 0),

        speed:
            Number(databaseBoss.speed || 0),

        baseAttack:
            Number(databaseBoss.baseAttack || 1),

        attacks:
            Array.isArray(databaseBoss.attacks)
                ? databaseBoss.attacks.map(
                    attack => ({
                        name: attack.name,
                        damage:
                            Number(
                                attack.damage || 1
                            )
                    })
                )
                : []

    };
}


// ==================== PLAYER CREATION ====================

async function createRaidPlayer(user) {

    const ownedAlien =
        getOwnedRaidAlien(user);

    if (!ownedAlien) {
        throw new Error(
            'Raid Alien is not set.'
        );
    }

    const databaseAlien =
        await Alien.findOne({
            name: ownedAlien.name
        });

    if (!databaseAlien) {
        throw new Error(
            'Raid Alien was not found in Alien database.'
        );
    }

    if (
        !Array.isArray(databaseAlien.attacks) ||
        databaseAlien.attacks.length < 3
    ) {
        throw new Error(
            'Raid Alien does not have 3 attacks.'
        );
    }

    return {

        userId:
            Number(user.userId),

        username:
            getPlayerName(user),

        alienId:
            String(
                ownedAlien.alienId ||
                databaseAlien._id
            ),

        alienName:
            ownedAlien.nickname ||
            ownedAlien.name ||
            databaseAlien.name,

        rarity:
            ownedAlien.rarity ||
            databaseAlien.rarity,

        element:
            ownedAlien.element ||
            databaseAlien.element,

        star:
            Number(
                ownedAlien.star || 0
            ),

        maxHp:
            Math.max(
                1,
                Number(
                    ownedAlien.maxHp ||
                    databaseAlien.maxHp ||
                    1
                )
            ),

        currentHp:
            Math.max(
                1,
                Number(
                    ownedAlien.hp ||
                    ownedAlien.maxHp ||
                    databaseAlien.maxHp ||
                    1
                )
            ),

        defense:
            Number(
                ownedAlien.def ??
                databaseAlien.defense ??
                0
            ),

        speed:
            Number(
                ownedAlien.speed ??
                databaseAlien.speed ??
                0
            ),

        baseAttack:
            Number(
                ownedAlien.atk ??
                databaseAlien.baseAttack ??
                1
            ),

        // ONLY 3RD DATABASE ATTACK IS USED
        attack: {

            name:
                databaseAlien.attacks[2].name,

            damage:
                Number(
                    databaseAlien.attacks[2].damage ||
                    1
                )

        },

        damageDealt: 0,

        damageTaken: 0,

        contribution: 0,

        guarding: false,

        dodging: false,

        defeated: false,
        deathCount: 0,

reviveAt: 0,
        
        raidEntryPaid: false,

        joinedAt:
            Date.now(),

        lastActionAt: 0
    };
}

function markPlayerDefeated(
    raid,
    player
) {
    player.currentHp = 0;
    player.defeated = true;

    player.deathCount =
        Number(player.deathCount || 0) + 1;

    if (player.deathCount === 1) {

        player.reviveAt =
            Date.now() + 59000;

        setTimeout(() => {

            const currentRaid =
                getRaid(raid.raidId);

            const currentPlayer =
                currentRaid?.players.get(
                    Number(player.userId)
                );

            if (
                currentRaid &&
                currentPlayer &&
                currentPlayer.deathCount === 1 &&
                currentPlayer.defeated &&
                Date.now() >=
                    Number(currentPlayer.reviveAt || 0)
            ) {

                currentPlayer.currentHp =
                    Math.max(
                        1,
                        Number(
                            currentPlayer.maxHp || 1
                        )
                    );

                currentPlayer.defeated = false;
                currentPlayer.reviveAt = 0;

                currentRaid.updatedAt =
                    Date.now();
            }

        }, 59000);

    } else {

        player.reviveAt = 0;
    }
}

function getDeathCooldownSeconds(player) {

    if (
        !player ||
        Number(player.deathCount || 0) !== 1 ||
        !player.defeated
    ) {
        return 0;
    }

    const remaining =
        Number(player.reviveAt || 0) -
        Date.now();

    return Math.max(
        0,
        Math.ceil(remaining / 1000)
    );
}
// ==================== CREATE RAID ====================

async function createRaid({
    user,
    difficulty,
    mode
}) {
    const userId = Number(user.userId);

    if (raidCreationLocks.has(userId)) {
        throw new Error(
            'You are already starting a raid. Please wait.'
        );
    }

    const existingRaid =
        getActiveRaidForUser(userId);

    if (existingRaid) {
        throw new Error(
            '⚠️ You are already in an ongoing raid.'
        );
    }


    
    const difficultyKey =
        String(difficulty || '')
            .toUpperCase();

    const modeKey =
        String(mode || 'SOLO')
            .toUpperCase();

    const config =
        getDifficultyConfig(
            difficultyKey
        );

    if (!config) {
        throw new Error(
            'Invalid raid difficulty.'
        );
    }

    if (
        modeKey !== 'SOLO' &&
        modeKey !== 'MULTIPLAYER'
    ) {
        throw new Error(
            'Invalid raid mode.'
        );
    }

    const profileLevel =
    getLevelData(user).level;

if (
    profileLevel <
    Number(
            RAID_CONFIG.LEVEL_REQUIREMENTS[
                difficultyKey
            ] || 1
        )
    ) {
        throw new Error(
            `Level ${RAID_CONFIG.LEVEL_REQUIREMENTS[difficultyKey]} required.`
        );
    }
    raidCreationLocks.add(userId);

    const player =
        await createRaidPlayer(user);

    const boss =
        await createBoss(
            difficultyKey
        );

    const cost =
        Number(
            config.entryCost || 0
        );

    if (
        Number(user.rupees || 0) <
        cost
    ) {
        throw new Error(
            `You need ₹${cost} to enter this raid.`
        );
    }

    // Deduct entry cost
    user.rupees -= cost;
    player.raidEntryPaid = true;

    await user.save();

    const raidId =
        `${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 10)}`;

    const raid = {

        raidId,

        mode:
            modeKey,

        difficulty:
            difficultyKey,

        cost,

        boss,

        players:
            new Map(),

        status:
            'active',

        processing:
            false,

        processingUserId:
            null,

        createdAt:
            Date.now(),

        updatedAt:
            Date.now(),

        messageId:
            null,

        chatId:
            null

    };

    raid.players.set(
        player.userId,
        player
    );

    activeRaids.set(
        raidId,
        raid
    );

        raidCreationLocks.delete(userId);

    return raid;
}


// ==================== RAID LOOKUP ====================

function getRaid(raidId) {

    return activeRaids.get(
        raidId
    ) || null;
}


// ==================== JOIN RAID ====================

async function joinRaid({
    raidId,
    user
}) {

    const raid =
        getRaid(raidId);

    if (!raid) {

        return {
            ok: false,
            reason: 'not_found'
        };

    }

    if (
        raid.status !== 'active'
    ) {

        return {
            ok: false,
            reason: 'finished'
        };

    }

    if (
        raid.mode !== 'MULTIPLAYER'
    ) {

        return {
            ok: false,
            reason: 'solo'
        };

    }

    if (
        raid.players.has(
            Number(user.userId)
        )
    ) {

        return {
            ok: false,
            reason: 'already_joined'
        };

    }

    if (
        raid.players.size >=
        Number(
            RAID_CONFIG.MAX_PLAYERS || 6
        )
    ) {

        return {
            ok: false,
            reason: 'full'
        };

    }
    const cost =
        Number(raid.cost || 0);

    if (
        Number(user.rupees || 0) < cost
    ) {
        return {
            ok: false,
            reason: 'insufficient_funds'
        };
    }

    user.rupees -= cost;

    await user.save();
    const player =
        await createRaidPlayer(user);
player.raidEntryPaid = true;
    raid.players.set(
        player.userId,
        player
    );

    raid.updatedAt =
        Date.now();

    return {
        ok: true,
        player
    };
}


// ==================== ACTION LOCK ====================

function lockAction(
    raid,
    userId
) {

    if (
        raid.processing
    ) {

        return false;

    }

    raid.processing =
        true;

    raid.processingUserId =
        Number(userId);

    return true;
}


function unlockAction(raid) {

    raid.processing =
        false;

    raid.processingUserId =
        null;

    raid.updatedAt =
        Date.now();
}


// ==================== PLAYER ATTACK ====================

async function playerAttack({
    raidId,
    userId
}) {

    const raid =
        getRaid(raidId);

    if (!raid) {

        return {
            ok: false,
            reason: 'not_found'
        };

    }

    if (
        raid.status !== 'active'
    ) {

        return {
            ok: false,
            reason: 'finished'
        };

    }

    const player =
        raid.players.get(
            Number(userId)
        );

    if (!player) {

        return {
            ok: false,
            reason: 'not_participant'
        };

    }

    if (player.defeated) {

    const cooldown =
        getDeathCooldownSeconds(player);

    return {
        ok: false,
        reason:
            cooldown > 0
                ? 'death_cooldown'
                : 'defeated',
        seconds:
            cooldown
    };

}

    if (
        raid.processing
    ) {

        return {
            ok: false,
            reason: 'processing'
        };

    }

    if (
        raid.boss.currentHp <= 0
    ) {

        return {
            ok: false,
            reason: 'boss_defeated'
        };

    }

    lockAction(
        raid,
        userId
    );

    try {

        const attack =
            player.attack;

        let result =
            calculateDamage(
                {
                    star:
                        player.star,

                    element:
                        player.element,

                    defense:
                        player.defense
                },
                {
                    element:
                        raid.boss.element,

                    defense:
                        raid.boss.defense
                },
                attack
            );

        const damage =
            Math.max(
                1,
                Number(
                    result.damage || 1
                )
            );

        raid.boss.currentHp =
            Math.max(
                0,
                raid.boss.currentHp -
                damage
            );

        player.damageDealt +=
            damage;

        raid.updatedAt =
            Date.now();

        // Boss defeated
        if (
            raid.boss.currentHp <= 0
        ) {

            raid.status =
                'boss_defeated';

            return {
                ok: true,

                action:
                    'attack',

                player,

                damage,

                bossDamage:
                    0,

                bossDefeated:
                    true,

                raid
            };

        }

        // Boss attacks AFTER player action
        const bossResult =
            executeBossAttack(
                raid,
                player
            );

        if (
            player.currentHp <= 0
        ) {

            markPlayerDefeated(
                raid,
                player
            );
        }

        return {

            ok: true,

            action:
                'attack',

            player,

            damage,

            bossDamage:
                bossResult.damage,

            bossAttack:
                bossResult.attack,

            dodged:
                bossResult.dodged,

            bossDefeated:
                false,

            playerDefeated:
                player.defeated,

            raid

        };

    } finally {

        unlockAction(
            raid
        );

    }
}


// ==================== BOSS ATTACK ====================

function executeBossAttack(
    raid,
    player
) {

    const attacks =
        raid.boss.attacks || [];

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

            name:
                'Boss Attack',

            damage:
                raid.boss.baseAttack

        };

    }

    // Active Dodge
    if (player.dodging) {

    player.dodging = false;

    const dodgeSuccess =
        Math.random() < 0.70;

    if (dodgeSuccess) {
        return {
            damage: 0,
            attack,
            dodged: true
        };
    }

    }

    let result =
        calculateDamage(
            {
                star: 0,

                element:
                    raid.boss.element,

                defense:
                    raid.boss.defense
            },
            {
                star:
                    player.star,

                element:
                    player.element,

                defense:
                    player.defense
            },
            attack
        );

    let damage =
        Math.max(
            1,
            Number(
                result.damage || 1
            )
        );

    // Guard
    if (player.guarding) {

        damage =
            Math.max(
                1,
                Math.round(
                    damage * 0.30
                )
            );

        player.guarding =
            false;

    }

    // Existing elemental incoming modifier
    const incomingMultiplier =
        getIncomingDamageMultiplier(
            raid.boss.element,
            player.element
        );

    damage =
        Math.max(
            1,
            Math.round(
                damage *
                incomingMultiplier
            )
        );

    player.currentHp =
        Math.max(
            0,
            player.currentHp -
            damage
        );

    player.damageTaken +=
        damage;

    return {

        damage,

        attack,

        dodged: false

    };
}


// ==================== GUARD ====================

async function playerGuard({
    raidId,
    userId
}) {

    const raid =
        getRaid(raidId);

    if (!raid) {

        return {
            ok: false,
            reason: 'not_found'
        };

    }

    const player =
        raid.players.get(
            Number(userId)
        );

    if (!player) {

        return {
            ok: false,
            reason: 'not_participant'
        };

    }

    if (player.defeated) {

    const cooldown =
        getDeathCooldownSeconds(player);

    return {
        ok: false,
        reason:
            cooldown > 0
                ? 'death_cooldown'
                : 'defeated',
        seconds:
            cooldown
    };

}

    if (
        raid.processing
    ) {

        return {
            ok: false,
            reason: 'processing'
        };

    }

    lockAction(
        raid,
        userId
    );

    try {

        player.guarding =
            true;

        const bossResult =
            executeBossAttack(
                raid,
                player
            );
        if (
    player.currentHp <= 0
) {

    markPlayerDefeated(
                raid,
                player
            );
        }

        return {

            ok: true,

            action:
                'guard',

            player,

            damage:
                0,

            bossDamage:
                bossResult.damage,

            bossAttack:
                bossResult.attack,

            dodged:
                bossResult.dodged,

            playerDefeated:
                player.defeated,

            raid

        };

    } finally {

        unlockAction(
            raid
        );

    }
}


// ==================== DODGE ====================

async function playerDodge({
    raidId,
    userId
}) {

    const raid =
        getRaid(raidId);

    if (!raid) {

        return {
            ok: false,
            reason: 'not_found'
        };

    }

    const player =
        raid.players.get(
            Number(userId)
        );

    if (!player) {

        return {
            ok: false,
            reason: 'not_participant'
        };

    }

        if (player.defeated) {

        const cooldown =
            getDeathCooldownSeconds(player);

        return {
            ok: false,
            reason:
                cooldown > 0
                    ? 'death_cooldown'
                    : 'defeated',
            seconds:
                cooldown
        };

        }

    if (
        raid.processing
    ) {

        return {
            ok: false,
            reason: 'processing'
        };

    }

    lockAction(
        raid,
        userId
    );

    try {

        player.dodging =
            true;

        const bossResult =
            executeBossAttack(
                raid,
                player
            );

        return {

            ok: true,

            action:
                'dodge',

            player,

            damage:
                0,

            bossDamage:
                bossResult.damage,

            bossAttack:
                bossResult.attack,

            dodged:
                bossResult.dodged,

            playerDefeated:
                player.defeated,

            raid

        };

    } finally {

        unlockAction(
            raid
        );

    }
}


// ==================== HEALERX ====================

async function playerHealerX({
    raidId,
    user
}) {

    const raid =
        getRaid(raidId);

    if (!raid) {

        return {
            ok: false,
            reason: 'not_found'
        };

    }

    const player =
        raid.players.get(
            Number(user.userId)
        );

    if (!player) {

        return {
            ok: false,
            reason: 'not_participant'
        };

    }

    if (player.defeated) {

    const cooldown =
        getDeathCooldownSeconds(player);

    return {
        ok: false,
        reason:
            cooldown > 0
                ? 'death_cooldown'
                : 'defeated',
        seconds:
            cooldown
    };

    }

    if (
        Number(
            user.inventory?.healerx || 0
        ) <= 0
    ) {

        return {
            ok: false,
            reason: 'no_healerx'
        };

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
            player.currentHp +
            recovery
        );

    const actualRecovery =
        player.currentHp -
        oldHp;

    user.inventory.healerx -=
        1;

    await user.save();
    raid.updatedAt = Date.now();

    // IMPORTANT:
    // HealerX DOES NOT consume an action.
    // Boss does NOT attack.

    return {

        ok: true,

        action:
            'healerx',

        player,

        recovery:
            actualRecovery,

        bossDamage:
            0,

        raid

    };
}

// ==================== RESET RAID ====================

async function resetRaidForUser({
    raidId,
    userId,
    User
}) {

        const raid =
        getRaid(raidId);

    if (
        raid &&
        expireRaidIfInactive(raid)
    ) {
        return {
            ok: false,
            reason: 'expired',
            refunded: 0
        };
    }

    if (!raid) {

        return {
            ok: false,
            reason: 'not_found',
            refunded: 0
        };

    }

    const player =
        raid.players.get(
            Number(userId)
        );

    if (!player) {

        return {
            ok: false,
            reason: 'not_participant',
            refunded: 0
        };

    }

    let refunded = 0;

    // Refund ONLY the entry fee
    // actually paid by this player.
    if (player.raidEntryPaid) {

        refunded =
            Number(
                raid.cost || 0
            );

        if (refunded > 0) {

            const user =
                await User.findOne({
                    userId:
                        Number(userId)
                });

            if (user) {

                user.rupees +=
                    refunded;

                await user.save();

            }

        }

        player.raidEntryPaid = false;

    }

    // Remove only this player.
    raid.players.delete(
        Number(userId)
    );

    raid.updatedAt =
        Date.now();

    // If nobody remains,
    // completely remove the raid.
    if (
        raid.players.size === 0
    ) {

        removeRaid(
            raid.raidId
        );

    }

    return {

        ok: true,

        refunded

    };
}
// ==================== RUN ====================

function runFromRaid({
    raidId,
    userId
}) {

    const raid =
        getRaid(raidId);

    if (!raid) {

        return {
            ok: false,
            reason: 'not_found'
        };

    }

    const player =
        raid.players.get(
            Number(userId)
        );

    if (!player) {

        return {
            ok: false,
            reason: 'not_participant'
        };

    }

    raid.players.delete(
        Number(userId)
    );

    raid.updatedAt =
        Date.now();

    const playersRemaining =
        raid.players.size;

    if (
        playersRemaining === 0
    ) {
        removeRaid(
            raid.raidId
        );
    }

    return {

        ok: true,

        action:
            'run',

        player,

        playersRemaining,

        raid

    };
}
// ==================== CONTRIBUTION ====================

function calculateContributions(raid) {

    let totalDamage = 0;

    for (
        const player of
        raid.players.values()
    ) {

        totalDamage +=
            Number(
                player.damageDealt || 0
            );

    }

    const result = [];

    for (
        const player of
        raid.players.values()
    ) {

        const damage =
            Number(
                player.damageDealt || 0
            );

        const contribution =
            totalDamage > 0
                ? (damage / totalDamage) * 100
                : 0;

        player.contribution =
            contribution;

        result.push({

            userId:
                player.userId,

            username:
                player.username,

            damage,

            contribution

        });

    }

    return result.sort(
        (a, b) =>
            b.damage - a.damage
    );
}


// ==================== REWARD CALCULATION ====================

function calculateSoloReward(
    difficulty
) {

    const config =
        getDifficultyConfig(
            difficulty
        );

    if (!config) {
        return null;
    }

    const xp =
        getRaidXp(
        difficulty,
        true
        );

    const moneyRoll =
        Math.random() * 100;

    // Money branch
    if (
        moneyRoll <
        Number(
            config.rewards.money.chance || 0
        )
    ) {

        return {

            xp,

            money:
                randomNumber(
                    config.rewards.money.min,
                    config.rewards.money.max
                ),

            item:
                null

        };

    }

    const items =
        config.rewards.items || [];

    if (!items.length) {

        return {

            xp,

            money: 0,

            item: null

        };

    }

    // Item branch.
    // Normal has three equal choices.
    // Hard / Extreme use configured weights.
    let selected;

    if (
        String(difficulty)
            .toUpperCase() ===
        'NORMAL'
    ) {

        selected =
            items[
                Math.floor(
                    Math.random() *
                    items.length
                )
            ];

    } else {

        const totalWeight =
            items.reduce(
                (
                    total,
                    item
                ) =>
                    total +
                    Number(
                        item.chance || 0
                    ),
                0
            );

        let roll =
            Math.random() *
            totalWeight;

        for (
            const item of items
        ) {

            roll -=
                Number(
                    item.chance || 0
                );

            if (roll <= 0) {

                selected =
                    item;

                break;

            }

        }

        selected =
            selected ||
            items[items.length - 1];

    }

    return {

        xp,

        money: 0,

        item: {

            name:
                selected.item,

            quantity:
                Number(
                    selected.quantity || 1
                )

        }

    };
              }

// ==================== MULTIPLAYER REWARD ====================

function calculateMultiplayerRewards(
    raid
) {

    const config =
        getDifficultyConfig(
            raid.difficulty
        );

    if (!config) {
        return [];
    }

    const contributions =
        calculateContributions(
            raid
        );

    if (!contributions.length) {
        return [];
    }

    /*
        Multiplayer uses the SAME difficulty
        XP/money ranges, but each player's
        reward is based on contribution.

        Higher damage = higher reward.
        Lower damage = lower reward.
        No items.
    */

    const baseXp =
        getRaidXp(
        raid.difficulty,
        true
        );

    const moneyBase =
        randomNumber(
            config.rewards.money.min,
            config.rewards.money.max
        );

    return contributions.map(
        player => {

            const share =
                Math.max(
                    0,
                    Number(
                        player.contribution
                    ) / 100
                );

            return {

                userId:
                    player.userId,

                username:
                    player.username,

                damage:
                    player.damage,

                contribution:
                    player.contribution,

                xp:
                    Math.max(
                        1,
                        Math.round(
                            baseXp *
                            share
                        )
                    ),

                money:
                    Math.max(
                        1,
                        Math.round(
                            moneyBase *
                            share
                        )
                    ),

                item:
                    null

            };

        }
    );
}


// ==================== SOLO RESULT ====================

function calculateSoloResult(
    raid
) {

    const player =
        Array.from(
            raid.players.values()
        )[0];

    if (!player) {
        return null;
    }

    const reward =
        calculateSoloReward(
            raid.difficulty
        );

    return {

        userId:
            player.userId,

        username:
            player.username,

        damage:
            player.damageDealt,

        contribution:
            100,

        xp:
            reward.xp,

        money:
            reward.money,

        item:
            reward.item

    };
}

// ==================== FINAL RESULT ====================

function buildRaidResult(raid) {

    const contributions =
        calculateContributions(
            raid
        );

    if (
        raid.mode === 'SOLO'
    ) {

        return {

            mode:
                'SOLO',

            difficulty:
                raid.difficulty,

            boss:
                raid.boss,

            contributions,

            rewards:
                calculateSoloResult(
                    raid
                )

        };

    }

    return {

        mode:
            'MULTIPLAYER',

        difficulty:
            raid.difficulty,

        boss:
            raid.boss,

        contributions,

        rewards:
            calculateMultiplayerRewards(
                raid
            )

    };
}


// ==================== RAID STATUS ====================

function getRaidStatus(raid) {

    return {

        raidId:
            raid.raidId,

        mode:
            raid.mode,

        difficulty:
            raid.difficulty,

        status:
            raid.status,

        processing:
            raid.processing,

        boss: {

            name:
                raid.boss.name,

            rarity:
                raid.boss.rarity,

            currentHp:
                raid.boss.currentHp,

            maxHp:
                raid.boss.maxHp,

            hpBar:
                createHpBar(
                    raid.boss.currentHp,
                    raid.boss.maxHp
                )

        },

        players:
            Array.from(
                raid.players.values()
            ).map(
                player => ({

                    userId:
                        player.userId,

                    username:
                        player.username,

                    alienName:
                        player.alienName,

                    currentHp:
                        player.currentHp,

                    maxHp:
                        player.maxHp,

                    hpBar:
                        createHpBar(
                            player.currentHp,
                            player.maxHp
                        ),

                    damageDealt:
                        player.damageDealt,

                    contribution:
                        player.contribution,

                    defeated:
                        player.defeated

                })
            )

    };
}


// ==================== FINISH / CLEANUP ====================

function removeRaid(raidId) {

    activeRaids.delete(
        raidId
    );

}


// ==================== EXPORTS ====================

module.exports = {

    activeRaids,

        getActiveRaidForUser,

    expireRaidIfInactive,

    createRaid,

    getRaid,

    joinRaid,

    resetRaidForUser,

    playerAttack,

    playerGuard,

    playerDodge,

    playerHealerX,

    runFromRaid,

    calculateContributions,

    calculateSoloReward,

    calculateMultiplayerRewards,

    calculateSoloResult,

    buildRaidResult,

    getRaidStatus,

    removeRaid

};
  
