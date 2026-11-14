// The economy: money, rounds and the scoreboard. A win pays $3,250, a loss $1,400
// (a second loss in a row pays $1,900, a third $2,400), a kill pays $300 and a
// plant pays the planter $300. The first side to 8 round wins takes the match;
// the side that attacks switches every two rounds so both teams plant and defend.
import { WEAPONS, GRENADES } from './weapons.js';

export const WIN_ROUNDS = 8;
export const ROUND_TIME = 100;
export const BUY_TIME = 20;

export function createEconomy() {
  const state = {
    money: 800,
    round: 1,
    score: { sable: 0, viper: 0 },
    lossStreak: 0,
    kills: 0,
    deaths: 0,
    plants: 0,
    defuses: 0,
    roundKills: 0,
    headshots: 0,
  };

  function buyItems() {
    const items = [];
    for (const def of Object.values(WEAPONS)) {
      items.push({ kind: 'weapon', id: def.id, name: def.name, price: def.price, detail: `${def.damage} dmg · ${def.mag} rounds` });
    }
    items.push({ kind: 'grenade', id: 'frag', name: GRENADES.frag.name, price: GRENADES.frag.price, detail: `Blast radius ${GRENADES.frag.radius} m` });
    items.push({ kind: 'grenade', id: 'smoke', name: GRENADES.smoke.name, price: GRENADES.smoke.price, detail: `Blocks sight ${GRENADES.smoke.duration} s` });
    items.push({ kind: 'gear', id: 'armor', name: 'Kevlar Vest', price: 650, detail: 'Halves bullet damage until it breaks' });
    items.push({ kind: 'gear', id: 'helmet', name: 'Ballistic Helmet', price: 350, detail: 'Halves headshot damage' });
    return items;
  }

  return {
    state,
    buyItems,
    canAfford(price) {
      return state.money >= price;
    },
    spend(price) {
      if (state.money < price) return false;
      state.money -= price;
      return true;
    },
    // Settling a round: pay the winner, grow the loser's streak bonus, and say
    // whether the match is over. A three-kill round earns an MVP bonus on top.
    settleRound(winner) {
      const loser = winner === 'sable' ? 'viper' : 'sable';
      state.score[winner] += 1;
      if (winner === 'sable') {
        state.money += 3250;
        if (state.roundKills >= 3) state.money += 200;
        state.lossStreak = 0;
      } else {
        state.lossStreak += 1;
        state.money += state.lossStreak >= 3 ? 2400 : state.lossStreak === 2 ? 1900 : 1400;
      }
      state.roundKills = 0;
      return state.score[winner] >= WIN_ROUNDS;
    },
    killReward(headshot) {
      state.money += headshot ? 400 : 300;
      state.kills += 1;
      state.roundKills += 1;
      if (headshot) state.headshots += 1;
    },
    plantReward() {
      state.money += 300;
      state.plants += 1;
    },
    defuseReward() {
      state.money += 300;
      state.defuses += 1;
    },
    onDeath() {
      state.deaths += 1;
    },
    nextRound() {
      state.round += 1;
    },
  };
}
