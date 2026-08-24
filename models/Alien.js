const mongoose = require('mongoose');

const attackSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true
        },
        damage: {
            type: Number,
            required: true
        }
    },
    { _id: false }
);

const alienSchema = new mongoose.Schema(
    {
        // Basic information entered by the admin
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        rarity: {
            type: String,
            required: true,
            enum: [
                'Basic',
                'Common',
                'Rare',
                'Legendary',
                'Cosmic',
                'Alien X'
            ]
        },

        element: {
            type: String,
            required: true,
            trim: true
        },

        // Telegram private database channel image
        imageFileId: {
            type: String,
            required: true
        },

        // Automatically generated game statistics
        maxHp: {
            type: Number,
            required: true
        },

        defense: {
            type: Number,
            required: true
        },

        speed: {
            type: Number,
            required: true
        },

        baseAttack: {
            type: Number,
            required: true
        },

        attacks: {
            type: [attackSchema],
            required: true,
            validate: {
                validator: function (attacks) {
                    return attacks.length === 3;
                },
                message: 'Every alien must have exactly 3 attacks.'
            }
        },

        // Star level starts at 0.
        // 0 = Normal, 1 = ⭐, 2 = ⭐⭐, 3 = ⭐⭐⭐
        maxStar: {
            type: Number,
            default: 3
        },

        // Economy / Hunt configuration
        huntRewardMin: {
            type: Number,
            required: true
        },

        huntRewardMax: {
            type: Number,
            required: true
        },

        // Number of hunts required for an average spawn
        spawnEvery: {
            type: Number,
            required: true
        },

        // Normal scan rules
        normalScanMin: {
            type: Number,
            default: null
        },

        normalScanMax: {
            type: Number,
            default: null
        },

        normalScanAvailable: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model('Alien', alienSchema);
