// ==================== SUPPORT ARTIFACT SYSTEM ====================

const DEFF_DAMAGE_REDUCTION = 0.20;
const DEFF_DEFENSE_BONUS = 0.30;
const DEFF_HP_BONUS = 0.20;

const BUFF_ATTACK_BONUS = 0.30;
const BUFF_HP_BONUS = 0.30;


// ==================== CREATE SUPPORT STATE ====================

function createSupportState() {
    return {
        deffUsed: false,
        buffUsed: false
    };
}


// ==================== GET INVENTORY KEY ====================

function getArtifactInventoryKey(type) {

    if (type === 'deff') {
        return 'defense';
    }

    if (type === 'buff') {
        return 'buff';
    }

    return null;
}


// ==================== CHECK AVAILABILITY ====================

function canUseArtifact(user, state, type) {

    const key =
        getArtifactInventoryKey(type);

    if (!key) {
        return {
            ok: false,
            reason: 'Invalid artifact.'
        };
    }

    if (type === 'deff' && state.deffUsed) {
        return {
            ok: false,
            reason: 'Deff already used in this match.'
        };
    }

    if (type === 'buff' && state.buffUsed) {
        return {
            ok: false,
            reason: 'Buff already used in this match.'
        };
    }

    const amount =
        Number(
            user.inventory?.[key] || 0
        );

    if (amount <= 0) {
        return {
            ok: false,
            reason:
                type === 'deff'
                    ? 'You have no Deff.'
                    : 'You have no Buff.'
        };
    }

    return {
        ok: true,
        amount
    };
}


// ==================== CONSUME ARTIFACT ====================

async function consumeArtifact(
    user,
    state,
    type
) {

    const check =
        canUseArtifact(
            user,
            state,
            type
        );

    if (!check.ok) {
        return check;
    }

    const key =
        getArtifactInventoryKey(type);

    user.inventory[key] =
        check.amount - 1;

    if (type === 'deff') {
        state.deffUsed = true;
    }

    if (type === 'buff') {
        state.buffUsed = true;
    }

    await user.save();

    return {
        ok: true,
        type
    };
}


// ==================== APPLY TEMPORARY STATS ====================

function applyArtifactStats(
    alien,
    state
) {

    if (!alien || !state) {
        return alien;
    }

    // Save original values.
    alien.baseMaxHp =
        Number(
            alien.baseMaxHp ??
            alien.maxHp ??
            1
        );

    alien.baseDefense =
        Number(
            alien.baseDefense ??
            alien.defense ??
            0
        );

    alien.baseAttack =
        Number(
            alien.baseAttack ??
            alien.atk ??
            1
        );

    // Start from original stats.
    alien.maxHp =
        alien.baseMaxHp;

    alien.defense =
        alien.baseDefense;

    alien.artifactAttackMultiplier =
        1;

    // ====================
    // DEFF
    // ====================

    if (state.deffUsed) {

        alien.maxHp =
            Math.max(
                1,
                Math.round(
                    alien.baseMaxHp *
                    (1 + DEFF_HP_BONUS)
                )
            );

        alien.defense =
            Math.max(
                0,
                Math.round(
                    alien.baseDefense *
                    (1 + DEFF_DEFENSE_BONUS)
                )
            );

        alien.artifactDamageReduction =
            DEFF_DAMAGE_REDUCTION;
    } else {

        alien.artifactDamageReduction = 0;
    }

    // ====================
    // BUFF
    // ====================

    if (state.buffUsed) {

        alien.artifactAttackMultiplier =
            1 + BUFF_ATTACK_BONUS;

        if (!state.deffUsed) {

            alien.maxHp =
                Math.max(
                    1,
                    Math.round(
                        alien.baseMaxHp *
                        (1 + BUFF_HP_BONUS)
                    )
                );
        } else {

            // Both artifacts:
            // +20% HP from Deff and
            // +30% HP from Buff.
            //
            // Bonuses are additive:
            // original HP × 1.50

            alien.maxHp =
                Math.max(
                    1,
                    Math.round(
                        alien.baseMaxHp *
                        (
                            1 +
                            DEFF_HP_BONUS +
                            BUFF_HP_BONUS
                        )
                    )
                );
        }
    }

    // If HP has not been initialized yet,
    // start at the modified maximum HP.
    if (
        alien.currentHp === undefined ||
        alien.currentHp === null
    ) {
        alien.currentHp =
            alien.maxHp;
    }

    return alien;
}


// ==================== ATTACK MODIFIER ====================

function applyAttackArtifact(
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


// ==================== INCOMING DAMAGE MODIFIER ====================

function applyIncomingArtifact(
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


// ==================== SUPPORT UI ====================

function buildSupportMessage(
    user,
    state
) {

    const inventory =
        user.inventory || {};

    const deffCount =
        Number(inventory.defense || 0);

    const buffCount =
        Number(inventory.buff || 0);

    let text =
`Any Support artifact wanna use ??

Available
Deff ${state.deffUsed ? 0 : deffCount}x
Buff ${state.buffUsed ? 0 : buffCount}x`;

    if (state.deffUsed) {
        text += `\n\nUsed deff`;
    }

    if (state.buffUsed) {
        text += `\nUsed buff`;
    }

    if (
        state.deffUsed ||
        state.buffUsed
    ) {
        text += `\nOnly for this match`;
    }

    return text;
}


// ==================== SUPPORT KEYBOARD ====================

function getSupportKeyboard(
    state
) {

    const buttons = [];

    buttons.push([
        {
            text: 'Deff',
            callback_data: 'support_deff'
        },
        {
            text: 'Buff',
            callback_data: 'support_buff'
        },
        {
            text: 'Ignore',
            callback_data: 'support_ignore'
        }
    ]);

    return {
        inline_keyboard: buttons
    };
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
// ==================== EXPORT ====================

module.exports = {
    createSupportState,
    canUseArtifact,
    consumeArtifact,
    applyArtifactStats,
    applyAttackArtifact,
    applyIncomingArtifact,
    buildSupportMessage,
      applyAttackMultiplier,
    applyDefenseReduction,
    getSupportKeyboard
};
