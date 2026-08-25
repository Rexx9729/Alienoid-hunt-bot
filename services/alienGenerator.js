// ==================== ALIEN GENERATOR ====================

// Rarity controls overall power.
// HP and Attack are based on the final ranges we decided.

const RARITY_STATS = {
    Basic: {
        hp: [400, 500],
        attack: [100, 150]
    },

    Common: {
        hp: [500, 700],
        attack: [150, 300]
    },

    Rare: {
        hp: [800, 1200],
        attack: [200, 400]
    },

    Legendary: {
        hp: [1500, 2000],
        attack: [300, 500]
    },

    Cosmic: {
        hp: [2500, 3500],
        attack: [600, 800]
    },

    God: {
        hp: [4000, 6000],
        attack: [1000, 1500]
    }
};


// ==================== ELEMENT PROFILES ====================

// Element controls fighting style.
// Defense and Speed are NOT based directly on rarity.

const ELEMENT_PROFILES = {

    Earth: {
        defense: [28, 35],
        speed: [10, 16]
    },

    Rock: {
        defense: [30, 38],
        speed: [12, 20]
    },

    Water: {
        defense: [22, 30],
        speed: [20, 28]
    },

    Ice: {
        defense: [24, 32],
        speed: [16, 24]
    },

    Fire: {
        defense: [18, 25],
        speed: [20, 30]
    },

    Acid: {
        defense: [15, 22],
        speed: [24, 32]
    },

    Electric: {
        defense: [12, 17],
        speed: [30, 40]
    },

    Wind: {
        defense: [10, 16],
        speed: [34, 44]
    },

    Physical: {
        defense: [20, 28],
        speed: [20, 28]
    },

    Psychic: {
        defense: [16, 23],
        speed: [27, 36]
    },

    Gravity: {
        defense: [28, 36],
        speed: [12, 20]
    },

    // Void is reserved for God-tier aliens.
    Void: {
        defense: [30, 40],
        speed: [28, 40]
    }
};


// ==================== ATTACK TEMPLATES ====================

const ELEMENT_ATTACKS = {

    Fire: [
        ['Flame Strike', 0.90],
        ['Inferno Burst', 1.00],
        ['Hellfire Blast', 1.15]
    ],

    Water: [
        ['Water Strike', 0.90],
        ['Aqua Burst', 1.00],
        ['Tidal Crash', 1.15]
    ],

    Earth: [
        ['Earth Smash', 0.90],
        ['Ground Breaker', 1.00],
        ['Earthquake', 1.15]
    ],

    Rock: [
        ['Rock Smash', 0.90],
        ['Stone Crush', 1.00],
        ['Mountain Crash', 1.15]
    ],

    Ice: [
        ['Ice Strike', 0.90],
        ['Frost Burst', 1.00],
        ['Glacial Crash', 1.15]
    ],

    Acid: [
        ['Acid Splash', 0.90],
        ['Corrosive Burst', 1.00],
        ['Acid Storm', 1.15]
    ],

    Electric: [
        ['Shock Strike', 0.90],
        ['Thunder Burst', 1.00],
        ['Lightning Crash', 1.15]
    ],

    Wind: [
        ['Wind Slash', 0.90],
        ['Gale Burst', 1.00],
        ['Cyclone Crash', 1.15]
    ],

    Physical: [
        ['Heavy Strike', 0.90],
        ['Power Smash', 1.00],
        ['Brutal Impact', 1.15]
    ],

    Psychic: [
        ['Mind Blast', 0.90],
        ['Psychic Burst', 1.00],
        ['Mind Crush', 1.15]
    ],

    Gravity: [
        ['Gravity Strike', 0.90],
        ['Gravity Crush', 1.00],
        ['Gravitational Collapse', 1.15]
    ],

    Void: [
        ['Void Strike', 0.90],
        ['Void Burst', 1.00],
        ['Reality Break', 1.15]
    ]
};


// ==================== RANDOM NUMBER ====================

function randomNumber(min, max) {
    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;
}


// ==================== GENERATE ALIEN ====================

function generateAlienStats(name, rarity, element) {

    if (!RARITY_STATS[rarity]) {
        throw new Error(`Invalid rarity: ${rarity}`);
    }

    if (!ELEMENT_PROFILES[element]) {
        throw new Error(`Invalid element: ${element}`);
    }

    // Void is God-tier only.
    if (element === 'Void' && rarity !== 'God') {
        throw new Error('Void element is only available for God-tier aliens.');
    }

    const rarityStats = RARITY_STATS[rarity];
    const elementStats = ELEMENT_PROFILES[element];

    // Rarity decides HP and base attack.
    const maxHp = randomNumber(
        rarityStats.hp[0],
        rarityStats.hp[1]
    );

    const baseAttack = randomNumber(
        rarityStats.attack[0],
        rarityStats.attack[1]
    );

    // Element decides Defense and Speed.
    const defense = randomNumber(
        elementStats.defense[0],
        elementStats.defense[1]
    );

    const speed = randomNumber(
        elementStats.speed[0],
        elementStats.speed[1]
    );

    // Generate exactly 3 attacks.
    const attackTemplates =
        ELEMENT_ATTACKS[element] || ELEMENT_ATTACKS.Physical;

    const attacks = attackTemplates.map(
        ([attackName, multiplier]) => ({
            name: attackName,
            damage: Math.round(baseAttack * multiplier)
        })
    );

    return {
        name,
        rarity,
        element,

        maxHp,
        defense,
        speed,
        baseAttack,

        attacks,

        maxStar: 3
    };
}


// ==================== EXPORT ====================

module.exports = {
    generateAlienStats,
    RARITY_STATS,
    ELEMENT_PROFILES
};
