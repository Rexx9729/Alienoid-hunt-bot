// ==================== ALIEN GENERATOR ====================

// Rarity controls overall power.
// Element controls fighting style.

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
        Nuclear: {
        defense: [26, 35],
        speed: [22, 32]
    },

    Plasma: {
        defense: [14, 22],
        speed: [32, 44]
},

    Void: {
        defense: [30, 40],
        speed: [28, 40]
    }
    
};


// ==================== ATTACK NAME POOLS ====================
//
// Each element has multiple words for each attack style.
// The generator combines them randomly so different
// aliens of the same element can have different attacks.
//

const ATTACK_POOLS = {

    Earth: {
        first: [
            'Rock Throw',
            'Stone Throw',
            'Earth Shot',
            'Boulder Toss',
            'Terra Strike',
            'Ground Spear',
            'Stone Barrage'
        ],

        second: [
            'Ground Vibration',
            'Earth Break',
            'Seismic Burst',
            'Terra Crush',
            'Ground Breaker',
            'Fault Line',
            'Seismic Punch'
        ],

        third: [
            'Mountain Smash',
            'Earthquake',
            'Mountain Break',
            'Terra Collapse',
            'World Crusher',
            'Titanic Slam',
            'Earth Shatter'
        ]
    },


    Rock: {
        first: [
            'Stone Throw',
            'Rock Shot',
            'Pebble Barrage',
            'Boulder Toss',
            'Granite Strike',
            'Rock Spear'
        ],

        second: [
            'Stone Crush',
            'Rock Breaker',
            'Granite Smash',
            'Boulder Crash',
            'Rock Burst',
            'Stone Hammer'
        ],

        third: [
            'Mountain Crash',
            'Titan Rockfall',
            'Colossal Smash',
            'Mountain Break',
            'Earthshaking Slam',
            'Rock Cataclysm'
        ]
    },


    Water: {
        first: [
            'Water Shot',
            'Aqua Strike',
            'Water Bullet',
            'Tidal Shot',
            'Hydro Blast',
            'Aqua Spear'
        ],

        second: [
            'Water Surge',
            'Aqua Burst',
            'Tidal Crash',
            'Hydro Crush',
            'Raging Wave',
            'Tidal Strike'
        ],

        third: [
            'Tsunami',
            'Ocean Breaker',
            'Tidal Cataclysm',
            'Maelstrom',
            'Abyssal Wave',
            'Oceanic Crash'
        ]
    },


    Ice: {
        first: [
            'Ice Shard',
            'Frost Shot',
            'Frozen Spear',
            'Ice Spike',
            'Crystal Throw',
            'Frost Needle'
        ],

        second: [
            'Frost Burst',
            'Ice Breaker',
            'Glacial Strike',
            'Frozen Crash',
            'Crystal Crush',
            'Blizzard Smash'
        ],

        third: [
            'Glacial Collapse',
            'Absolute Freeze',
            'Frozen Cataclysm',
            'Ice Age',
            'Glacier Break',
            'Blizzard Doom'
        ]
    },


    Fire: {
        first: [
            'Flame Shot',
            'Fire Strike',
            'Ember Blast',
            'Flame Burst',
            'Blaze Shot',
            'Inferno Bolt'
        ],

        second: [
            'Flame Burst',
            'Inferno Strike',
            'Blazing Crash',
            'Firestorm',
            'Molten Burst',
            'Inferno Smash'
        ],

        third: [
            'Inferno Doom',
            'Hellfire Blast',
            'Volcanic Cataclysm',
            'Solar Inferno',
            'Flame Apocalypse',
            'Inferno Collapse'
        ]
    },


    Acid: {
        first: [
            'Acid Shot',
            'Acid Splash',
            'Corrosive Shot',
            'Toxic Spit',
            'Acid Bolt',
            'Venom Splash'
        ],

        second: [
            'Corrosive Burst',
            'Acid Crash',
            'Toxic Wave',
            'Venom Burst',
            'Acid Storm',
            'Corrosion Break'
        ],

        third: [
            'Acid Cataclysm',
            'Corrosive Apocalypse',
            'Toxic Devastation',
            'Venomous Collapse',
            'Acid Rain',
            'Ultimate Corrosion'
        ]
    },


    Electric: {
        first: [
            'Spark Shot',
            'Electric Strike',
            'Shock Bolt',
            'Thunder Shot',
            'Volt Blast',
            'Lightning Spear'
        ],

        second: [
            'Thunder Burst',
            'Voltage Crash',
            'Lightning Break',
            'Shockwave',
            'Electric Storm',
            'Thunder Strike'
        ],

        third: [
            'Lightning Apocalypse',
            'Thunder Cataclysm',
            'Volt Overload',
            'Heavenly Thunder',
            'Storm Judgment',
            'Lightning Collapse'
        ]
    },


    Wind: {
        first: [
            'Wind Slash',
            'Gale Shot',
            'Air Blade',
            'Wind Cutter',
            'Air Strike',
            'Gust Blast'
        ],

        second: [
            'Gale Burst',
            'Cyclone Strike',
            'Wind Breaker',
            'Storm Slash',
            'Tempest Crash',
            'Cyclone Crush'
        ],

        third: [
            'Tornado',
            'Hurricane Doom',
            'Tempest Cataclysm',
            'Sky Breaker',
            'Cyclone Apocalypse',
            'Heavenfall'
        ]
    },


    Physical: {
        first: [
            'Heavy Punch',
            'Power Strike',
            'Combat Slash',
            'Brutal Hit',
            'Iron Fist',
            'Force Strike'
        ],

        second: [
            'Power Smash',
            'Brutal Impact',
            'Heavy Crush',
            'Combat Breaker',
            'Force Crash',
            'Titan Strike'
        ],

        third: [
            'Ultimate Smash',
            'Devastating Blow',
            'Titanic Impact',
            'Final Crusher',
            'World Breaker',
            'Absolute Strike'
        ]
    },


    Psychic: {
        first: [
            'Mind Blast',
            'Psychic Shot',
            'Mental Spike',
            'Mind Pierce',
            'Psy Bolt',
            'Thought Strike'
        ],

        second: [
            'Psychic Burst',
            'Mind Crush',
            'Mental Break',
            'Psy Shock',
            'Mind Shatter',
            'Neural Crash'
        ],

        third: [
            'Mind Apocalypse',
            'Psychic Collapse',
            'Mental Oblivion',
            'Mind Rupture',
            'Psy Cataclysm',
            'Consciousness Break'
        ]
    },


    Gravity: {
        first: [
            'Gravity Shot',
            'Gravity Pulse',
            'Mass Strike',
            'Gravity Spear',
            'Pressure Blast',
            'Graviton Shot'
        ],

        second: [
            'Gravity Crush',
            'Gravity Break',
            'Mass Collapse',
            'Gravitational Burst',
            'Pressure Crash',
            'Gravity Well'
        ],

        third: [
            'Gravity Collapse',
            'Planet Crusher',
            'Singularity Crash',
            'Mass Extinction',
            'Gravity Cataclysm',
            'World Collapse'
        ]
    },
        Nuclear: {
        first: [
            'Nuclear Shot',
            'Atomic Bolt',
            'Radiation Blast',
            'Nuclear Pulse',
            'Atomic Strike',
            'Radioactive Burst',
            'Fission Beam'
        ],

        second: [
            'Nuclear Burst',
            'Atomic Crash',
            'Radiation Wave',
            'Fission Break',
            'Nuclear Impact',
            'Atomic Overload',
            'Radiation Crush'
        ],

        third: [
            'Nuclear Cataclysm',
            'Atomic Apocalypse',
            'Nuclear Meltdown',
            'Fission Collapse',
            'Radiation Annihilation',
            'Atomic Devastation',
            'Nuclear Extinction'
        ]
    },
    
    Plasma: {
        first: [
            'Plasma Beam',
            'Photon Beam'
        ],

        second: [
            'Plasma Ray',
            'Photon Burst'
        ],

        third: [
            'Plasma Cannon',
            'Plasma Annihilation'
        ]
    },

    Void: {
        first: [
            'Void Shot',
            'Null Strike',
            'Reality Pierce',
            'Void Bolt',
            'Existence Break',
            'Dimensional Slash'
        ],

        second: [
            'Void Burst',
            'Reality Break',
            'Null Collapse',
            'Dimensional Crush',
            'Existence Rupture',
            'Void Collapse'
        ],

        third: [
            'Reality Erasure',
            'Existence Collapse',
            'Dimensional Apocalypse',
            'Void Cataclysm',
            'Absolute Nullification',
            'Reality End'
        ]
    }
};


// ==================== RANDOM NUMBER ====================

function randomNumber(min, max) {
    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;
}


// ==================== RANDOM ATTACK ====================

function getUniqueAttack(pool, usedNames) {

    const available = pool.filter(
        attackName => !usedNames.has(attackName)
    );

    if (available.length === 0) {
        throw new Error('Not enough unique attack names available.');
    }

    const selected =
        available[randomNumber(0, available.length - 1)];

    usedNames.add(selected);

    return selected;
}


// ==================== GENERATE ATTACKS ====================

function generateAttacks(element, baseAttack) {

    const pool =
        ATTACK_POOLS[element] || ATTACK_POOLS.Physical;

    const usedNames = new Set();

    const attack1 = getUniqueAttack(
        pool.first,
        usedNames
    );

    const attack2 = getUniqueAttack(
        pool.second,
        usedNames
    );

    const attack3 = getUniqueAttack(
        pool.third,
        usedNames
    );

    return [
        {
            name: attack1,
            damage: Math.round(baseAttack * 0.90)
        },

        {
            name: attack2,
            damage: Math.round(baseAttack * 1.00)
        },

        {
            name: attack3,
            damage: Math.round(baseAttack * 1.15)
        }
    ];
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
        throw new Error(
            'Void element is only available for God-tier aliens.'
        );
    }

    const rarityStats = RARITY_STATS[rarity];
    const elementStats = ELEMENT_PROFILES[element];

    // Rarity decides HP.
    const maxHp = randomNumber(
        rarityStats.hp[0],
        rarityStats.hp[1]
    );

    // Rarity decides base attack.
    const baseAttack = randomNumber(
        rarityStats.attack[0],
        rarityStats.attack[1]
    );

    // Element decides defense.
    const defense = randomNumber(
        elementStats.defense[0],
        elementStats.defense[1]
    );

    // Element decides speed.
    const speed = randomNumber(
        elementStats.speed[0],
        elementStats.speed[1]
    );

    // Generate 3 unique attacks for THIS alien.
    const attacks = generateAttacks(
        element,
        baseAttack
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
    ELEMENT_PROFILES,
    ATTACK_POOLS
};
