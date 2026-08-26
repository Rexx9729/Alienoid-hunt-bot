// ==================== ALIENOID HUNT ENGINE ====================

const Alien = require('../models/Alien');
const {
    getCaptureBonus
} = require('./battleEngine');


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

async function getRandomAlien() {

    const aliens =
        await Alien.find({});

    if (!aliens.length) {
        throw new Error(
            'No aliens are available in the database.'
        );
    }

    const randomIndex =
        Math.floor(
            Math.random() * aliens.length
        );

    return aliens[randomIndex];
}


// ==================== SPAWN ALIEN ====================
//
// First version:
// Every hunt selects a valid database alien.
// Spawn-threshold progression will be connected
// to the user's hunt counter in the next layer.

async function spawnWildAlien() {

    return getRandomAlien();
}


// ==================== HUNT REWARD ====================

function getHuntReward(alien) {

    const min =
        alien.huntRewardMin;

    const max =
        alien.huntRewardMax;

    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;
}


// ==================== EXPORT ====================

module.exports = {
    HUNT_COST,
    SPAWN_THRESHOLDS,
    CAPTURE_RATES,
    getBaseCaptureRate,
    getCaptureChance,
    attemptCapture,
    getRandomAlien,
    spawnWildAlien,
    getHuntReward
};
