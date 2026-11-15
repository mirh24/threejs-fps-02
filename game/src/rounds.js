// Rounds and the match: a buy phase, a live round, a short end banner, and a
// match to 5 rounds (at most 9). This module owns the clock and the score;
// main.js owns what happens on each event (spawning, money, the banner). A
// round ends by elimination, by the bomb, by a defuse, or by the clock running
// out with no plant.
export const BUY_TIME = 15;
export const ROUND_TIME = 100;
export const END_TIME = 5;
export const WIN_ROUNDS = 5;
export const MAX_ROUNDS = 9;

export function createRounds() {
  const state = {
    phase: 'menu', // menu | buy | live | end | matchEnd
    round: 0,
    scoreV: 0,
    scoreE: 0,
    timer: 0,
    reason: '',
    winner: null,
    matchWinner: null,
  };

  return {
    state,
    startMatch() {
      state.phase = 'buy';
      state.round = 0;
      state.scoreV = 0;
      state.scoreE = 0;
      state.timer = BUY_TIME;
      state.reason = '';
      state.winner = null;
      state.matchWinner = null;
    },
    startRound() {
      state.round += 1;
      state.phase = 'buy';
      state.timer = BUY_TIME;
      state.reason = '';
      state.winner = null;
    },
    beginLive() {
      state.phase = 'live';
      state.timer = ROUND_TIME;
    },
    endRound(winner, reason) {
      if (state.phase === 'end' || state.phase === 'matchEnd') return false;
      state.phase = 'end';
      state.timer = END_TIME;
      state.winner = winner;
      state.reason = reason;
      if (winner === 'VANGUARD') state.scoreV += 1;
      else state.scoreE += 1;
      return true;
    },
    endMatch() {
      state.phase = 'matchEnd';
      state.matchWinner = state.scoreV > state.scoreE ? 'VANGUARD' : 'EMBER';
      state.timer = 0;
    },
    matchOver() {
      return (
        state.scoreV >= WIN_ROUNDS ||
        state.scoreE >= WIN_ROUNDS ||
        state.round >= MAX_ROUNDS
      );
    },
    step(dt) {
      if (state.phase === 'buy' || state.phase === 'live' || state.phase === 'end') {
        state.timer -= dt;
      }
      return state.timer;
    },
  };
}
