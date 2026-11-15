// economy.js — money, prices and round rewards. One place owns every number
// so the HUD, the buy menu and the round-end payouts can never disagree.
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;

export const SHOP = [
  { id: 'pistol', name: 'Pistol "Sidewinder"', price: 300, key: '1', desc: 'Reliable sidearm, 12 rounds' },
  { id: 'smg', name: 'SMG "Hornet"', price: 1500, key: '2', desc: 'Fast fire, short range' },
  { id: 'shotgun', name: 'Shotgun "Mauler"', price: 1200, key: '3', desc: 'Wide spread, brutal up close' },
  { id: 'rifle', name: 'Rifle "Longhorn"', price: 2700, key: '4', desc: 'Accurate all-rounder' },
  { id: 'sniper', name: 'Sniper "Dunehawk"', price: 4750, key: '5', desc: 'One-shot power, scoped' },
  { id: 'armor', name: 'Body armor', price: 650, key: '6', desc: 'Absorbs half of damage' },
  { id: 'grenade', name: 'Frag grenade', price: 300, key: '7', desc: 'Throw with G' },
];

export class Economy {
  constructor() {
    this.money = START_MONEY;
    this.kills = 0;
    this.spent = 0;
  }
  reset() { this.money = START_MONEY; this.kills = 0; this.spent = 0; }
  canAfford(price) { return this.money >= price; }
  // Returns true when the purchase went through.
  buy(item) {
    if (!item || this.money < item.price) return false;
    this.money -= item.price;
    this.spent += item.price;
    return true;
  }
  awardKill() { this.money += KILL_REWARD; this.kills += 1; }
  awardRound(won) { this.money += won ? WIN_REWARD : LOSS_REWARD; }
}
