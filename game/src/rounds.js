// rounds.js — the round state machine. Phases: 'buy' (15s, shop open) ->
// 'live' (100s, fight or plant) -> 'end' (banner, 4.5s) -> 'intermission'
// (3s, reset) -> next round. First to 8 rounds wins the match; 7-7 forces
// one deciding round. The machine only tracks state; main.js acts on it.
export const BUY_TIME = 15;
export const ROUND_TIME = 100;
export const END_TIME = 4.5;
export const INTERMISSION_TIME = 3;
export const WIN_ROUNDS = 8;

export class Rounds {
  constructor() {
    this.state = {
      round: 1,
      phase: 'buy',
      timer: BUY_TIME,
      scoreV: 0, // EMBER, the player's team
      scoreE: 0, // SABLE
      matchOver: false,
      winner: null, // 'EMBER' | 'SABLE' | null
      endReason: '',
      endTitle: '',
    };
    this.onRoundStart = null;
    this.onRoundEnd = null;
    this.onMatchEnd = null;
  }

  reset() {
    this.state.round = 1;
    this.state.phase = 'buy';
    this.state.timer = BUY_TIME;
    this.state.scoreV = 0;
    this.state.scoreE = 0;
    this.state.matchOver = false;
    this.state.winner = null;
    this.state.endReason = '';
    this.state.endTitle = '';
  }

  get phase() { return this.state.phase; }
  get score() { return [this.state.scoreV, this.state.scoreE]; }

  startLive() {
    this.state.phase = 'live';
    this.state.timer = ROUND_TIME;
  }

  // Called by main.js when a win condition is met. Ignored outside live play.
  endRound(winner, title, reason) {
    if (this.state.phase !== 'live' && this.state.phase !== 'buy') return false;
    const s = this.state;
    if (winner === 'EMBER') s.scoreV += 1; else s.scoreE += 1;
    s.phase = 'end';
    s.timer = END_TIME;
    s.endTitle = title;
    s.endReason = reason;
    if (this.onRoundEnd) this.onRoundEnd(winner, title, reason);
    const decider = s.scoreV === 7 && s.scoreE === 7;
    if (s.scoreV >= WIN_ROUNDS || s.scoreE >= WIN_ROUNDS || (decider && (s.scoreV === 8 || s.scoreE === 8))) {
      s.matchOver = true;
      s.winner = s.scoreV > s.scoreE ? 'EMBER' : 'SABLE';
    }
    return true;
  }

  // Advance the clock. Returns an event string when a phase boundary is hit.
  tick(dt) {
    const s = this.state;
    if (s.phase === 'end' || s.phase === 'intermission') {
      s.timer -= dt;
      if (s.timer > 0) return null;
      if (s.phase === 'end') {
        if (s.matchOver) return 'match-over';
        s.phase = 'intermission';
        s.timer = INTERMISSION_TIME;
        return 'intermission';
      }
      s.round += 1;
      s.phase = 'buy';
      s.timer = BUY_TIME;
      s.endTitle = '';
      s.endReason = '';
      if (this.onRoundStart) this.onRoundStart(s.round);
      return 'round-start';
    }
    if (s.phase === 'buy') {
      s.timer -= dt;
      if (s.timer <= 0) { this.startLive(); return 'live'; }
      return null;
    }
    if (s.phase === 'live') {
      s.timer -= dt;
      if (s.timer <= 0) {
        // Timer out with no plant: defenders hold the yard.
        this.endRound('SABLE', 'SABLE wins the round', 'Time expired — no bomb planted');
        return 'timeout';
      }
      return null;
    }
    return null;
  }
}
