// ==================== ALIENOID REWARDS ====================
// ==================== ALIENOID REWARDS ====================

// Fixed hunt kill rewards by alien rarity
const HUNT_WIN_REWARDS = {
    Basic: 80,
    Common: 120,
    Rare: 220,
    Legendary: 520,
    Cosmic: 1020,
    God: 2020
};

// Fixed reward when player loses a hunt battle
const HUNT_LOSE_REWARD = 30;

// Future Dual / PvP rewards
const DUAL_WIN_REWARD = 100;
const DUAL_LOSE_REWARD = 50;

module.exports = {
    HUNT_WIN_REWARDS,
    HUNT_LOSE_REWARD,
    DUAL_WIN_REWARD,
    DUAL_LOSE_REWARD
};
