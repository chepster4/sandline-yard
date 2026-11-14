// SANDLINE YARD — the economy. Money is the second objective: every round
// pays for the last one, and the buy phase spends it on guns, grenades and
// protection. Wins pay more than losses, a losing streak pays a little extra
// so a team can climb back, and kills, plants and defuses pay their own
// bonuses. First to nine rounds takes the match.
import { WEAPONS, GRENADES } from './weapons.js';

export const WIN_ROUNDS = 9;
export const ROUND_TIME = 100;
export const BUY_TIME = 15;

const WIN_REWARD = 3250;
const LOSS_BASE = 1900;
const LOSS_STREAK_BONUS = 500;
const KILL_REWARD = 300;
const HEADSHOT_BONUS = 100;
const PLANT_REWARD = 300;
const DEFUSE_REWARD = 300;

const MAX_MONEY = 16000;

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
    headshots: 0,
    roundKills: 0,
  };

  function canAfford(price) {
    return state.money >= price;
  }

  function spend(price) {
    if (!canAfford(price)) return false;
    state.money -= price;
    return true;
  }

  // Every reward flows through gain(): the wallet caps at $16,000 so a long
  // winning run cannot stockpile an unbounded bankroll.
  function gain(amount) {
    state.money = Math.min(MAX_MONEY, state.money + amount);
  }

  function killReward(head) {
    state.kills += 1;
    state.roundKills += 1;
    gain(KILL_REWARD + (head ? HEADSHOT_BONUS : 0));
    if (head) state.headshots += 1;
  }

  function plantReward() {
    state.plants += 1;
    gain(PLANT_REWARD);
  }

  function defuseReward() {
    state.defuses += 1;
    gain(DEFUSE_REWARD);
  }

  function onDeath() {
    state.deaths += 1;
  }

  // settleRound: pay the round out and say whether the match is over. The
  // player's side is SABLE: a SABLE round win pays the win reward and resets
  // the losing streak, anything else pays the loss reward and grows it.
  function settleRound(winner) {
    const won = winner === 'sable';
    if (won) {
      state.score.sable += 1;
      gain(WIN_REWARD);
      state.lossStreak = 0;
    } else {
      state.score.viper += 1;
      gain(LOSS_BASE + Math.min(2, state.lossStreak) * LOSS_STREAK_BONUS);
      state.lossStreak += 1;
    }
    state.roundKills = 0;
    return state.score.sable >= WIN_ROUNDS || state.score.viper >= WIN_ROUNDS;
  }

  function nextRound() {
    state.round += 1;
  }

  // buyItems: the buy menu's catalogue, built from the weapon and grenade
  // tables so prices never drift apart. Order is the menu's order.
  function buyItems() {
    const items = [];
    for (const id of ['smg', 'rifle', 'sniper']) {
      const w = WEAPONS[id];
      items.push({
        id, kind: 'weapon', price: w.price, name: w.name,
        desc: `${w.damage} dmg · ${w.mag} rounds · ${w.headMult}x headshot`,
        stat: `${w.damage} DMG`,
      });
    }
    items.push({
      id: 'frag', kind: 'grenade', price: GRENADES.frag.price, name: GRENADES.frag.name,
      desc: `Blast radius ${GRENADES.frag.radius}m · max ${GRENADES.frag.maxDamage} damage`,
      stat: 'BLAST',
    });
    items.push({
      id: 'smoke', kind: 'grenade', price: GRENADES.smoke.price, name: GRENADES.smoke.name,
      desc: `Blocks sight for ${GRENADES.smoke.duration}s · radius ${GRENADES.smoke.radius}m`,
      stat: 'COVER',
    });
    items.push({
      id: 'armor', kind: 'armor', price: 650, name: 'Kevlar Vest',
      desc: 'Absorbs half of every hit until it breaks',
      stat: '100 ARMOR',
    });
    items.push({
      id: 'helmet', kind: 'helmet', price: 350, name: 'Helmet',
      desc: 'Halves headshot damage',
      stat: 'HEAD',
    });
    return items;
  }

  return {
    state, canAfford, spend, killReward, plantReward, defuseReward,
    onDeath, settleRound, nextRound, buyItems,
  };
}
