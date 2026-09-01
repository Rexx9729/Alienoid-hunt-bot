// ==================== ALIENOID BATTLE ENGINE ====================

// Star power scaling
const STAR_MULTIPLIERS = {
    0: 1.00,
    1: 1.30,
    2: 1.60,
    3: 2.00
};

// Element relationship table.
// Only these relationships are currently defined.
// Everything else is treated as neutral.
const ELEMENT_ADVANTAGES = {
    Fire: ['Ice'],
    Water: ['Fire'],
    Earth: ['Electric'],
    Rock: ['Wind'],
    Ice: ['Earth'],
    Acid: ['Water'],
    Electric: ['Water'],
    Wind: ['Earth'],
    Physical: [],
    Psychic: [],
    Gravity: [],
    Nuclear: [],
    Plasma: [],
    Void: []
};


// ==================== STAR POWER ====================

function getStarMultiplier(star = 0) {
    return STAR_MULTIPLIERS[star] || 1;
}


// ==================== ELEMENT RELATION ====================

function getElementRelation(attackerElement, defenderElement) {

    if (
        ELEMENT_ADVANTAGES[attackerElement]?.includes(
            defenderElement
        )
    ) {
        return 'advantage';
    }

    if (
        ELEMENT_ADVANTAGES[defenderElement]?.includes(
            attackerElement
        )
    ) {
        return 'disadvantage';
    }

    return 'neutral';
}


// ==================== DAMAGE CALCULATION ====================

function calculateDamage(attacker, defender, attack) {

    const attackerStarMultiplier =
        getStarMultiplier(attacker.star);

    const baseDamage =
        Math.round(attack.damage * attackerStarMultiplier);

    const relation =
        getElementRelation(
            attacker.element,
            defender.element
        );

    let damage = baseDamage;

    // Element advantage:
    // Attacker +20%
    if (relation === 'advantage') {
        damage = Math.round(damage * 1.20);
    }

    // Element disadvantage:
    // Attacker -10%
    if (relation === 'disadvantage') {
        damage = Math.round(damage * 0.90);
    }

    // Defense reduces incoming damage.
    damage = Math.max(
        1,
        Math.round(damage - defender.defense)
    );

    return {
        damage,
        relation
    };
}


// ==================== ENEMY DAMAGE MODIFIER ====================

function getIncomingDamageMultiplier(
    attackerElement,
    defenderElement
) {
    const relation =
        getElementRelation(
            attackerElement,
            defenderElement
        );

    // Defender has elemental advantage.
    // Enemy damage reduced by 15%.
    if (relation === 'disadvantage') {
        return 0.85;
    }

    return 1;
}


// ==================== HEALERX ====================

function calculateHealerxRecovery(maxHp) {
    return Math.max(
        1,
        Math.round(maxHp * 0.35)
    );
}


// ==================== TURN ORDER ====================

function getFirstTurn(playerAlien, wildAlien) {

    if (playerAlien.speed >= wildAlien.speed) {
        return 'player';
    }

    return 'wild';
}

// ==================== DODGE SYSTEM ====================

const DODGE_CHANCES = {
    faster: 0.25,
    same: 0.20,
    slower: 0.15
};

function getDodgeChance(defender, attacker) {

    const defenderSpeed =
        Number(defender?.speed || 0);

    const attackerSpeed =
        Number(attacker?.speed || 0);

    if (defenderSpeed > attackerSpeed) {
        return DODGE_CHANCES.faster;
    }

    if (defenderSpeed === attackerSpeed) {
        return DODGE_CHANCES.same;
    }

    return DODGE_CHANCES.slower;
}

function rollDodge(defender, attacker) {

    const chance =
        getDodgeChance(
            defender,
            attacker
        );

    return {
        dodged: Math.random() < chance,
        chance
    };
}
// ==================== CAPTURE BONUS ====================

function getCaptureBonus(maxHp, currentHp) {

    if (!maxHp || maxHp <= 0) {
        return 0;
    }

    const hpLostPercent =
        ((maxHp - currentHp) / maxHp) * 100;

    if (hpLostPercent >= 80) {
        return 20;
    }

    if (hpLostPercent >= 70) {
        return 15;
    }

    if (hpLostPercent >= 50) {
        return 10;
    }

    if (hpLostPercent >= 30) {
        return 5;
    }

    return 0;
}


// ==================== HP BAR ====================

function createHpBar(currentHp, maxHp, length = 12) {

    const ratio =
        Math.max(
            0,
            Math.min(
                1,
                currentHp / maxHp
            )
        );

    const filled =
        Math.round(ratio * length);

    const empty =
        length - filled;

    return (
        '▰'.repeat(filled) +
        '▱'.repeat(empty)
    );
}

// ==================== SUPPORT ARTIFACT MODIFIERS ====================

function applyAttackMultiplier(
    damage,
    attacker
) {

    const multiplier =
        Number(
            attacker?.artifactAttackMultiplier || 1
        );

    return Math.max(
        1,
        Math.round(
            Number(damage || 0) *
            multiplier
        )
    );
}


function applyDefenseReduction(
    damage,
    defender
) {

    const reduction =
        Number(
            defender?.artifactDamageReduction || 0
        );

    if (reduction <= 0) {
        return Math.max(
            1,
            Math.round(
                Number(damage || 0)
            )
        );
    }

    return Math.max(
        1,
        Math.round(
            Number(damage || 0) *
            (1 - reduction)
        )
    );
}
module.exports = {
    STAR_MULTIPLIERS,
    getStarMultiplier,
    getElementRelation,
    calculateDamage,
    getIncomingDamageMultiplier,
    calculateHealerxRecovery,
    getFirstTurn,
    getDodgeChance,
    rollDodge,
    getCaptureBonus,
    createHpBar,
    applyAttackMultiplier,
    applyDefenseReduction
};
