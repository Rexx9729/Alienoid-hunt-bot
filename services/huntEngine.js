// ==================== ALIENOID HUNT ENGINE ====================

const Alien = require('../models/Alien');
const {
    getCaptureBonus
} = require('./battleEngine');

const {
    HUNT_WIN_REWARDS
} = require('../Config/Reward');
// ==================== HUNT CONFIG ====================

const HUNT_COST = 20;

const SPAWN_THRESHOLDS = {
    Basic: 1,
    Common: 25,
    Rare: 80,
    Legendary: 200,
    Cosmic: 400,
    God: 600
};


// ==================== CAPTURE RATES ====================

const CAPTURE_RATES = {

    Normal: {
        Basic: 70,
        Common: 50,
        Rare: 20
    },

    Super: {
        Basic: 100,
        Common: 100,
        Rare: 50,
        Legendary: 20
    },

    Mega: {
        Basic: 100,
        Common: 100,
        Rare: 100,
        Legendary: 50
    },

    Absolute: {
        Basic: 100,
        Common: 100,
        Rare: 100,
        Legendary: 70,
        Cosmic: 50,
        God: 30
    }
};


// ==================== GET BASE CAPTURE RATE ====================

function getBaseCaptureRate(scanType, rarity) {

    return (
        CAPTURE_RATES[scanType]?.[rarity] || 0
    );
}


// ==================== FINAL CAPTURE CHANCE ====================

function getCaptureChance(
    scanType,
    rarity,
    maxHp,
    currentHp
) {

    const baseChance =
        getBaseCaptureRate(
            scanType,
            rarity
        );

    const bonus =
        getCaptureBonus(
            maxHp,
            currentHp
        );

    return Math.min(
        100,
        baseChance + bonus
    );
}


// ==================== RANDOM CAPTURE ====================

function attemptCapture(chance) {

    const roll =
        Math.random() * 100;

    return roll < chance;
}


// ==================== RANDOM WILD ALIEN ====================
// ==================== SPAWN RARITY FROM PROGRESSION ====================
function getSpawnRarity(huntProgress) {

    // Highest rarity milestone gets priority
    if (
        huntProgress % SPAWN_THRESHOLDS.God === 0 &&
        huntProgress >= SPAWN_THRESHOLDS.God
    ) {
        return 'God';
    }

    if (
        huntProgress % SPAWN_THRESHOLDS.Cosmic === 0 &&
        huntProgress >= SPAWN_THRESHOLDS.Cosmic
    ) {
        return 'Cosmic';
    }

    if (
        huntProgress % SPAWN_THRESHOLDS.Legendary === 0 &&
        huntProgress >= SPAWN_THRESHOLDS.Legendary
    ) {
        return 'Legendary';
    }

    if (
        huntProgress % SPAWN_THRESHOLDS.Rare === 0 &&
        huntProgress >= SPAWN_THRESHOLDS.Rare
    ) {
        return 'Rare';
    }

    if (
        huntProgress % SPAWN_THRESHOLDS.Common === 0 &&
        huntProgress >= SPAWN_THRESHOLDS.Common
    ) {
        return 'Common';
    }

    // All non-milestone hunts spawn Basic
    return 'Basic';
}


// ==================== GET ALIEN OF RARITY ====================

async function getRandomAlien(rarity) {

    const aliens =
        await Alien.find({ rarity });

    if (!aliens.length) {
        throw new Error(
            `No ${rarity} aliens are available in the database.`
        );
    }

    const randomIndex =
        Math.floor(
            Math.random() * aliens.length
        );

    return aliens[randomIndex];
}


// ==================== SPAWN WILD ALIEN ====================

async function spawnWildAlien(huntProgress) {

    const rarity =
        getSpawnRarity(huntProgress);

    const alien =
        await getRandomAlien(rarity);

    return alien;
}


// ==================== HUNT REWARD ====================

function getHuntReward(alien) {

    const reward =
        HUNT_WIN_REWARDS[alien.rarity];

    if (reward === undefined) {
        throw new Error(
            `No hunt reward configured for rarity: ${alien.rarity}`
        );
    }

    return reward;
}


// ==================== EXPORT ====================

module.exports = {
    HUNT_COST,
    SPAWN_THRESHOLDS,
    CAPTURE_RATES,
    getSpawnRarity,
    getBaseCaptureRate,
    getCaptureChance,
    attemptCapture,
    getRandomAlien,
    spawnWildAlien,
    getHuntReward
};
