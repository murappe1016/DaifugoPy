// Game Engine for Daifugo Strategy Debugger
'use strict';

// Card rank == face value: 3-10 as-is, J=11, Q=12, K=13, A=14, $(strongest 2)=15
const RANK_NAMES = ['','','','3','4','5','6','7','8','9','10','J','Q','K','A','$'];
const EIGHT_RANK = 8;  // rank 8 = card "8" → triggers 8-cut
const MIN_RANK = 3;
const MAX_RANK = 15;

function rankName(r) { return RANK_NAMES[r] || '?'; }

// ─── Game State ───────────────────────────────────────────────────────────────

class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.playerHand     = [];   // sorted ascending
    this.opponentHand   = [];   // sorted ascending
    this.playerDiscard  = [];   // sorted ascending — cards player has played
    this.opponentDiscard = [];  // sorted ascending — cards opponent has played
    this.allDiscard     = [];   // chronological order — all played cards
    this.fieldStrength  = 0;    // 0 = empty
    this.fieldCount     = 0;    // 0 = empty, 1 = single, 2 = double
    this.currentTurn    = 'player';  // 'player' | 'opponent'
    this.phase          = 'setup';   // 'setup' | 'playing' | 'gameover'
    this.winner         = null;
    this.log            = [];
    this.forecast       = null;
    this.forecastError  = null;
  }

  startMatch(playerCards, opponentCards, initialState) {
    this.playerHand      = [...playerCards].sort((a, b) => a - b);
    this.opponentHand    = [...opponentCards].sort((a, b) => a - b);
    this.playerDiscard   = initialState?.playerDiscard
                            ? [...initialState.playerDiscard].sort((a, b) => a - b) : [];
    this.opponentDiscard = initialState?.opponentDiscard
                            ? [...initialState.opponentDiscard].sort((a, b) => a - b) : [];
    this.allDiscard      = initialState?.allDiscard
                            ? [...initialState.allDiscard]
                            : [
                                ...(initialState?.playerDiscard  || []),
                                ...(initialState?.opponentDiscard || []),
                              ];
    this.fieldStrength   = initialState?.fieldStrength ?? 0;
    this.fieldCount      = initialState?.fieldCount    ?? 0;
    this.currentTurn     = initialState?.currentTurn   ?? 'player';
    this.phase           = 'playing';
    this.winner          = null;
    this.log             = [];
    this.forecast        = null;
    this.forecastError   = null;
  }

  // Raw state passed to DNCL interpreter
  getDNCLState() {
    return {
      fieldStrength:    this.fieldStrength,
      fieldCount:       this.fieldCount,
      playerHand:       [...this.playerHand],
      allDiscard:       [...this.allDiscard],  // chronological order
      opponentHandSize: this.opponentHand.length,
    };
  }

  validatePlayerPlay(rank, count) {
    const have = this.playerHand.filter(r => r === rank).length;
    if (have < count) return `手札にランク${rankName(rank)}が${count}枚ありません（${have}枚）`;
    if (count < 1 || count > 2) return `出す枚数は1か2でなければなりません`;
    if (this.fieldCount === 0) return null;
    if (count !== this.fieldCount) return `場の枚数(${this.fieldCount})と一致しません`;
    if (rank <= this.fieldStrength) return `ランク${rankName(rank)}は場のランク${rankName(this.fieldStrength)}より強くなければなりません`;
    return null;
  }

  applyPlayerAction(action) {
    if (action.action === 'pass') {
      this._addLog('player', null, null, true);
      this._clearField('opponent');
      return;
    }

    const { rank, count } = action;
    this._removeCards(this.playerHand, rank, count);
    this._addToDiscard(this.playerDiscard, rank, count);
    for (let i = 0; i < count; i++) this.allDiscard.push(rank);
    const eightCut = (rank === EIGHT_RANK);
    this._addLog('player', rank, count, false, false, eightCut);

    if (this._checkWin('player')) return;

    if (eightCut) {
      this._clearField('player');
    } else {
      this.fieldStrength = rank;
      this.fieldCount    = count;
      this.currentTurn   = 'opponent';
    }
  }

  applyOpponentAction() {
    const action = this._computeOpponentAction();
    if (action.action === 'pass') {
      this._addLog('opponent', null, null, true);
      this._clearField('player');
      return;
    }

    const { rank, count } = action;
    this._removeCards(this.opponentHand, rank, count);
    this._addToDiscard(this.opponentDiscard, rank, count);
    for (let i = 0; i < count; i++) this.allDiscard.push(rank);
    const eightCut = (rank === EIGHT_RANK);
    this._addLog('opponent', rank, count, false, false, eightCut);

    if (this._checkWin('opponent')) return;

    if (eightCut) {
      this._clearField('opponent');
    } else {
      this.fieldStrength = rank;
      this.fieldCount    = count;
      this.currentTurn   = 'player';
    }
  }

  computeOpponentForecast() {
    return this._computeOpponentAction();
  }

  // ── private ──────────────────────────────────────────────────────────────

  _computeOpponentAction() {
    const hand = this.opponentHand;
    if (this.fieldCount === 0) {
      if (hand.length === 0) return { action: 'pass' };
      const weakestRank = hand[0];
      const cnt = hand.filter(r => r === weakestRank).length;
      return { action: 'play', rank: weakestRank, count: Math.min(cnt, 2) };
    }

    const needed = this.fieldCount;
    const grouped = {};
    for (const r of hand) grouped[r] = (grouped[r] || 0) + 1;
    const candidates = [];
    for (const [rankStr, cnt] of Object.entries(grouped)) {
      const rank = Number(rankStr);
      if (rank > this.fieldStrength && cnt >= needed) candidates.push(rank);
    }
    if (candidates.length === 0) return { action: 'pass' };
    candidates.sort((a, b) => a - b);
    return { action: 'play', rank: candidates[0], count: needed };
  }

  _removeCards(hand, rank, count) {
    for (let i = 0; i < count; i++) {
      const idx = hand.indexOf(rank);
      if (idx !== -1) hand.splice(idx, 1);
    }
  }

  _addToDiscard(pile, rank, count) {
    for (let i = 0; i < count; i++) pile.push(rank);
    pile.sort((a, b) => a - b);
  }

  _checkWin(who) {
    const empty = who === 'player' ? this.playerHand.length === 0 : this.opponentHand.length === 0;
    if (empty) {
      this.phase  = 'gameover';
      this.winner = who;
      this.currentTurn = null;
      this._addLog(who, null, null, false, true);
      return true;
    }
    return false;
  }

  _clearField(nextParent) {
    this.fieldStrength = 0;
    this.fieldCount    = 0;
    this.currentTurn   = nextParent;
  }

  _addLog(who, rank, count, isPas, isWin = false, isEight = false) {
    const name = who === 'player' ? '自分' : '相手';
    let msg;
    if (isWin)      msg = `${name}の勝利！`;
    else if (isPas) msg = `${name}がパス → 場が流れる`;
    else if (isEight) msg = `${name}が${rankName(rank)}を${count}枚出す（8切り！）`;
    else            msg = `${name}が${rankName(rank)}を${count}枚出す`;
    this.log.push(msg);
  }
}
