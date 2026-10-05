const RANK_CONFIG = {
    E: {
        minPrice: 2000,
        maxPrice: 2500,
        stars: ''
    },

    A: {
        minPrice: 4000,
        maxPrice: 4500,
        stars: ''
    },

    S: {
        minPrice: 8000,
        maxPrice: 10000,
        stars: '⭐'
    },

    SS: {
        minPrice: 15000,
        maxPrice: 18000,
        stars: '⭐⭐'
    },

    SSS: {
        minPrice: 25000,
        maxPrice: 30000,
        stars: '⭐⭐⭐'
    }
};

function getRandomPrice(rank) {
    const config = RANK_CONFIG[rank];

    if (!config) {
        throw new Error(`Invalid character rank: ${rank}`);
    }

    return Math.floor(
        Math.random() * (config.maxPrice - config.minPrice + 1)
    ) + config.minPrice;
}

function getRankDisplay(rank) {
    const config = RANK_CONFIG[rank];

    if (!config) {
        throw new Error(`Invalid character rank: ${rank}`);
    }

    return `${rank}${config.stars}`;
}

module.exports = {
    RANK_CONFIG,
    getRandomPrice,
    getRankDisplay
};
