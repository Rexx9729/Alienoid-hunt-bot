// ==================== ALIEN RAID CONFIG ====================

module.exports = {

    // ==================== LEVEL REQUIREMENTS ====================

    LEVEL_REQUIREMENTS: {
        NORMAL: 1,
        HARD: 10,
        EXTREME: 20
    },


    // ==================== RAID LIMITS ====================

    MAX_PLAYERS: 4,
    MIN_MULTIPLAYER_PLAYERS: 1,


    // ==================== RAID DIFFICULTIES ====================

    NORMAL: {

        name: 'Normal',

        entryCost: 500,

        xp: {
            min: 100,
            max: 200
        },

        rewards: {

            money: {
                chance: 50,
                min: 700,
                max: 1000
            },

            items: [
                {
                    item: 'healerx',
                    quantity: 1,
                    chance: 50
                },
                {
                    item: 'buff',
                    quantity: 1,
                    chance: 50
                },
                {
                    item: 'deff',
                    quantity: 1,
                    chance: 50
                }
            ]
        }
    },


    // ==================== HARD ====================

    HARD: {

        name: 'Hard',

        entryCost: 800,

        xp: {
            min: 200,
            max: 250
        },

        rewards: {

            money: {
                chance: 50,
                min: 1300,
                max: 1700
            },

            items: [
                {
                    item: 'healerx',
                    quantity: 2,
                    chance: 10
                },
                {
                    item: 'buff',
                    quantity: 2,
                    chance: 20
                },
                {
                    item: 'deff',
                    quantity: 2,
                    chance: 20
                }
            ]
        }
    },


    // ==================== EXTREME ====================

    EXTREME: {

        name: 'Extreme',

        entryCost: 1600,

        xp: {
            min: 300,
            max: 350
        },

        rewards: {

            money: {
                chance: 50,
                min: 2300,
                max: 2600
            },

            items: [
                {
                    item: 'healerx',
                    quantity: 3,
                    chance: 5
                },
                {
                    item: 'buff',
                    quantity: 3,
                    chance: 25
                },
                {
                    item: 'deff',
                    quantity: 3,
                    chance: 20
                }
            ]
        }
    },


    // ==================== MULTIPLAYER ====================

    MULTIPLAYER: {

        // Multiplayer gives only XP + Money.
        // No item rewards.

        ITEMS_ENABLED: false
    }

};
