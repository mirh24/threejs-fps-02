// The round economy. Every player starts a match at $800 and earns money for
// kills, plants and round results, then spends it in the buy menu. The loss
// bonus grows with each consecutive lost round so a losing team can always
// buy back in.
export const ROUND_WIN = 3250;
export const ROUND_LOSS_BASE = 1900;
export const ROUND_LOSS_STEP = 500;
export const ROUND_LOSS_MAX = 3400;
export const KILL_REWARD = 300;
export const PLANT_REWARD = 300;
export const START_MONEY = 800;

export function createEconomy() {
  let money = START_MONEY;
  let consecutiveLosses = 0;

  return {
    get money() {
      return money;
    },
    reset() {
      money = START_MONEY;
      consecutiveLosses = 0;
    },
    add(amount) {
      money += amount;
    },
    spend(amount) {
      if (money < amount) return false;
      money -= amount;
      return true;
    },
    roundEnd(won) {
      if (won) {
        money += ROUND_WIN;
        consecutiveLosses = 0;
      } else {
        money += Math.min(
          ROUND_LOSS_MAX,
          ROUND_LOSS_BASE + consecutiveLosses * ROUND_LOSS_STEP,
        );
        consecutiveLosses += 1;
      }
    },
  };
}
