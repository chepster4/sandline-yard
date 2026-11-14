// SANDLINE YARD — the HUD. Everything the player reads mid-round lives
// here: health and armour, ammo, the round timer, the score pips, the
// objective line, the killfeed, the banner, the plant/defuse progress bar,
// the crosshair (its gap grows with spread) and the buy menu. update() runs
// every frame but only touches the DOM when a value actually changed, so the
// HUD costs nothing when the round is quiet.
const PIP_COUNT = 9;

export function createHud(doc) {
  const el = (id) => doc.getElementById(id);
  const hudEl = el('hud');
  const healthFill = el('health-fill');
  const healthNum = el('health-num');
  const armorNum = el('armor-num');
  const ammoMag = el('ammo-mag');
  const ammoReserve = el('ammo-reserve');
  const weaponName = el('weapon-name');
  const timerEl = el('timer');
  const roundLabel = el('round-label');
  const scoreSable = el('score-sable');
  const scoreViper = el('score-viper');
  const pipsSable = el('pips-sable');
  const pipsViper = el('pips-viper');
  const moneyEl = el('money');
  const killsEl = el('kills');
  const objectiveEl = el('objective');
  const crosshair = el('crosshair');
  const hitmarker = el('hitmarker');
  const killfeedEl = el('killfeed');
  const bannerEl = el('banner');
  const bannerTitle = el('banner-title');
  const bannerSub = el('banner-sub');
  const progressEl = el('progress');
  const progressLabel = el('progress-label');
  const progressFill = el('progress-fill');
  const buyMenu = el('buy-menu');
  const buyItemsEl = el('buy-items');
  const buyMoney = el('buy-money');
  const damageFlash = el('damage-flash');
  const buyHint = el('buy-hint');
  const spectateEl = el('spectate-label');

  // Score pips: one dot per round win, filled as the score grows.
  for (let i = 0; i < PIP_COUNT; i += 1) {
    const a = doc.createElement('span');
    a.className = 'pip pip-sable';
    pipsSable.appendChild(a);
    const b = doc.createElement('span');
    b.className = 'pip pip-viper';
    pipsViper.appendChild(b);
  }

  let bannerTimer = 0;
  let hitTimer = 0;
  const last = {
    health: -1, armor: -1, mag: -1, reserve: -1, weapon: '', money: -1,
    kills: -1, timer: '', round: -1, scoreS: -1, scoreV: -1,
    objective: '', phase: '', spread: -1, lowTime: false, alive: true,
  };

  function damageFlashShow() {
    damageFlash.style.opacity = '0.85';
    window.setTimeout(() => { damageFlash.style.opacity = '0'; }, 70);
  }

  function hitmarkerShow(head, kill) {
    hitmarker.textContent = '✕';
    hitmarker.classList.toggle('kill', kill);
    hitmarker.classList.toggle('head', head && !kill);
    hitmarker.style.opacity = '1';
    window.clearTimeout(hitTimer);
    hitTimer = window.setTimeout(() => { hitmarker.style.opacity = '0'; }, 140);
  }

  function killfeed(killer, victim, head, byPlayer, victimIsPlayer) {
    const row = doc.createElement('div');
    row.className = 'feed-row';
    const killerSpan = doc.createElement('span');
    killerSpan.textContent = killer;
    killerSpan.className = byPlayer ? 'feed-you' : 'feed-name';
    const middle = doc.createElement('span');
    middle.textContent = head ? ' ⌖ ' : '  ✕  ';
    middle.className = head ? 'feed-head' : 'feed-mid';
    const victimSpan = doc.createElement('span');
    victimSpan.textContent = victim;
    victimSpan.className = victimIsPlayer ? 'feed-you' : 'feed-name';
    row.append(killerSpan, middle, victimSpan);
    killfeedEl.prepend(row);
    while (killfeedEl.children.length > 5) killfeedEl.removeChild(killfeedEl.lastChild);
    window.setTimeout(() => {
      if (row.parentNode) row.parentNode.removeChild(row);
    }, 4200);
  }

  function showBanner(title, sub, ms) {
    bannerTitle.textContent = title;
    bannerSub.textContent = sub || '';
    bannerEl.classList.add('show');
    window.clearTimeout(bannerTimer);
    bannerTimer = window.setTimeout(() => bannerEl.classList.remove('show'), ms);
  }

  function showProgress(text, frac) {
    progressEl.classList.remove('hidden');
    progressLabel.textContent = text;
    progressFill.style.width = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  }

  function hideProgress() {
    progressEl.classList.add('hidden');
  }

  function buyMenuVisible() {
    return !buyMenu.classList.contains('hidden');
  }

  function showBuyMenu(items, money, owned, onBuy) {
    buyMoney.textContent = `$${money}`;
    buyItemsEl.textContent = '';
    for (const item of items) {
      const card = doc.createElement('button');
      card.className = 'buy-card';
      const isOwned = item.kind === 'weapon' && owned[item.id];
      const afford = money >= item.price;
      if (isOwned || !afford) card.disabled = true;
      const name = doc.createElement('span');
      name.className = 'buy-name';
      name.textContent = item.name;
      const stat = doc.createElement('span');
      stat.className = 'buy-stat';
      stat.textContent = item.stat || '';
      const desc = doc.createElement('span');
      desc.className = 'buy-desc';
      desc.textContent = item.desc || '';
      const price = doc.createElement('span');
      price.className = 'buy-price';
      price.textContent = isOwned ? 'OWNED' : `$${item.price}`;
      card.append(name, stat, desc, price);
      card.addEventListener('click', () => onBuy(item));
      buyItemsEl.appendChild(card);
    }
    buyMenu.classList.remove('hidden');
  }

  function hideBuyMenu() {
    buyMenu.classList.add('hidden');
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function update(game) {
    const inGame = game.phase === 'buy' || game.phase === 'play' || game.phase === 'roundEnd';
    hudEl.style.display = inGame ? 'block' : 'none';
    if (!inGame) return;
    const p = game.player;
    const eco = game.economy.state;
    const slot = game.loadout.state.owned[game.loadout.state.current];

    if (p.health !== last.health) {
      last.health = p.health;
      healthNum.textContent = String(Math.round(p.health));
      healthFill.style.width = `${Math.max(0, p.health)}%`;
      healthFill.classList.toggle('low', p.health <= 30);
    }
    if (p.armor !== last.armor) {
      last.armor = p.armor;
      armorNum.textContent = String(Math.round(p.armor));
    }
    if (slot && slot.mag !== last.mag) {
      last.mag = slot.mag;
      ammoMag.textContent = String(slot.mag);
    }
    if (slot && slot.reserve !== last.reserve) {
      last.reserve = slot.reserve;
      ammoReserve.textContent = `/ ${slot.reserve}`;
    }
    const weaponLabel = game.loadout.def().name;
    if (weaponLabel !== last.weapon) {
      last.weapon = weaponLabel;
      weaponName.textContent = weaponLabel;
    }
    if (eco.money !== last.money) {
      last.money = eco.money;
      moneyEl.textContent = `$${eco.money}`;
    }
    if (eco.kills !== last.kills) {
      last.kills = eco.kills;
      killsEl.textContent = `K ${eco.kills} · D ${eco.deaths}`;
    }
    const timeText = formatTime(game.roundTime);
    if (timeText !== last.timer) {
      last.timer = timeText;
      timerEl.textContent = timeText;
    }
    timerEl.classList.toggle('danger', !!game.lowTime);
    timerEl.classList.toggle('buy', game.phase === 'buy');
    if (eco.round !== last.round) {
      last.round = eco.round;
      roundLabel.textContent = `ROUND ${eco.round}`;
    }
    if (eco.score.sable !== last.scoreS) {
      last.scoreS = eco.score.sable;
      scoreSable.textContent = String(eco.score.sable);
      [...pipsSable.children].forEach((pip, i) => pip.classList.toggle('on', i < eco.score.sable));
    }
    if (eco.score.viper !== last.scoreV) {
      last.scoreV = eco.score.viper;
      scoreViper.textContent = String(eco.score.viper);
      [...pipsViper.children].forEach((pip, i) => pip.classList.toggle('on', i < eco.score.viper));
    }
    if (game.objectiveText !== last.objective) {
      last.objective = game.objectiveText;
      objectiveEl.textContent = game.objectiveText;
    }
    const spreadPx = Math.round(game.crosshairSpread);
    if (spreadPx !== last.spread) {
      last.spread = spreadPx;
      crosshair.style.setProperty('--gap', `${4 + spreadPx * 0.5}px`);
    }
    crosshair.style.display = p.alive && game.phase === 'play' ? 'block' : 'none';
    if (game.phase === 'buy' && !buyMenuVisible()) {
      buyHint.textContent = 'Press B to buy — Enter to start the round';
      buyHint.classList.remove('hidden');
    } else {
      buyHint.classList.add('hidden');
    }
    if (!p.alive && game.phase === 'play') {
      spectateEl.textContent = 'You are down — press C to spectate a teammate';
      spectateEl.classList.remove('hidden');
    } else {
      spectateEl.classList.add('hidden');
    }
  }

  return {
    update,
    damageFlash: damageFlashShow,
    hitmarker: hitmarkerShow,
    killfeed,
    showBanner,
    showProgress,
    hideProgress,
    showBuyMenu,
    hideBuyMenu,
    buyMenuVisible,
  };
}
