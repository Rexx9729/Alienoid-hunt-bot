const RAID_CONFIG =
    require('../Config/AlienRaid');


// ==================== XP VALUES ====================

const HUNT_XP = 50;
const DUEL_XP = 80;

const FIRST_LEVEL_XP = 500;
const SECOND_LEVEL_XP = 800;
const XP_INCREASE_PER_LEVEL = 300;


// ==================== TOTAL XP ====================

function getTotalXP(user) {

    const hunts =
        Number(user.hunts || 0);

    const duels =
        Number(user.duels || 0);

    const raidXp =
        Number(user.raidXp || 0);

    return (
        (hunts * HUNT_XP) +
        (duels * DUEL_XP) +
        raidXp
    );
}


// ==================== LEVEL ====================

function getLevelData(user) {

    const totalXP =
        getTotalXP(user);

    let level = 1;

    let previousMilestone = 0;

    let requiredForNextLevel =
        FIRST_LEVEL_XP;

    while (
        totalXP >=
        previousMilestone +
        requiredForNextLevel
    ) {

        previousMilestone +=
            requiredForNextLevel;

        level++;

        if (level === 2) {

            requiredForNextLevel =
                SECOND_LEVEL_XP;

        } else {

            requiredForNextLevel +=
                XP_INCREASE_PER_LEVEL;

        }

    }

    const nextMilestone =
        previousMilestone +
        requiredForNextLevel;

    return {

        level,

        currentXP:
            totalXP,

        nextMilestone,

        requiredXP:
            requiredForNextLevel

    };

}


// ==================== RAID XP ====================

function getRaidXp(
    difficulty,
    won = true
) {

    const key =
        String(difficulty || '')
            .toUpperCase();

    const config =
        RAID_CONFIG[key];

    if (!config?.xp) {
        return 0;
    }

    const min =
        Number(config.xp.min || 0);

    const max =
        Number(config.xp.max || min);

    const winXp =
        Math.floor(
            Math.random() *
            (max - min + 1)
        ) + min;

    if (won) {
        return winXp;
    }

    return Math.floor(
        winXp / 2
    );

}


// ==================== EXPORT ====================

module.exports = {

    getTotalXP,

    getLevelData,

    getRaidXp

};
