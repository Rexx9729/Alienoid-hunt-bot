const mongoose = require('mongoose');

const characterSchema = new mongoose.Schema(
    {
        image: {
            type: String,
            required: true,
            trim: true
        },

        characterId: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        name: {
            type: String,
            required: true,
            trim: true
        },

        animeName: {
            type: String,
            required: true,
            trim: true
        },

        type: {
            type: String,
            required: true,
            enum: ['W', 'H']
        },

        rank: {
            type: String,
            required: true,
            enum: ['E', 'A', 'S', 'SS', 'SSS']
        }
    },
    {
        collection: 'characters',
        timestamps: true
    }
);

module.exports =
    mongoose.models.Character ||
    mongoose.model('Character', characterSchema);
