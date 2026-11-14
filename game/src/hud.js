// The HUD: everything drawn on top of the 3D view. It is plain DOM, updated once a
// frame, and it only touches a text node when the value actually changed. The
// crosshair opens up with spread and closes while aiming; the kill feed, hitmarker
// and damage flash are the only parts that animate on their own.
export function createHud(document) {
  const root = document.getElementById('hud');
  root.innerHTML = `
    <div id="crosshair"><span class="ch top"></span><span class="ch bottom"></span><span class="ch left"></span><span class="ch right"></span><span class="ch dot"></span></div>
    <div id="hitmarker"><span></span><span></span><span></span><span></span></div>
    <div id="damage-flash"></div>
    <div id="top-bar">
      <div class="team-score sable"><span class="team-name">SABLE</span><span id="score-sable">0</span></div>
      <div id="timer">1:40</div>
      <div class="team-score viper"><span id="score-viper">0</span><span class="team-name">VIPER</span></div>
    </div>
    <div id="round-pips"></div>
    <div id="objective">Plant the bomb at A or B</div>
    <div id="bomb-timer" class="hidden">BOMB 0:40</div>
    <div id="killfeed"></div>
    <div id="banner" class="hidden"><div id="banner-title"></div><div id="banner-sub"></div></div>
    <div id="progress" class="hidden"><div id="progress-label">PLANTING</div><div id="progress-bar"><div id="progress-fill"></div></div></div>
    <div id="bottom-left">
      <div id="health-row"><span id="health">100</span><span id="armor"></span></div>
      <div id="alive-row"><span id="alive-sable"></span><span id="alive-viper"></span></div>
    </div>
    <div id="bottom-right">
      <div id="ammo"><span id="ammo-mag">12</span><span id="ammo-reserve">/ 36</span></div>
      <div id="weapon-name">P9 Sidewinder</div>
      <div id="money">$800</div>
      <div id="grenades"></div>
    </div>
    <div id="buy-menu" class="hidden">
      <div class="buy-title">BUY — press B to close</div>
      <div id="buy-items"></div>
      <div class="buy-hint">Click an item to buy it. Weapons refill at the start of every round.</div>
    </div>
    <div id="hint">WASD move · Shift walk · Space jump · C crouch · R reload · 1/2 weapons · 4 frag · 5 smoke · B buy</div>
  `;

  const el = {};
  for (const id of ['crosshair', 'hitmarker', 'damage-flash', 'timer', 'score-sable', 'score-viper', 'round-pips', 'objective', 'bomb-timer', 'killfeed', 'banner', 'banner-title', 'banner-sub', 'progress', 'progress-label', 'progress-fill', 'health', 'armor', 'alive-sable', 'alive-viper', 'ammo-mag', 'ammo-reserve', 'weapon-name', 'money', 'grenades', 'buy-menu', 'buy-items', 'hint']) {
    el[id] = document.getElementById(id);
  }
  const cache = {};
  let bannerTimer = null;
  let hitTimer = null;

  // Round pips: eight dots a side, first to eight takes the match. Rebuilt only
  // when the score changes, like every other text node here.
  function renderPips(score) {
    const key = `${score.sable}-${score.viper}`;
    if (cache.pips === key) return;
    cache.pips = key;
    const dots = (won, team) => Array.from({ length: 8 }, (_, i) => `<span class="pip ${team}${i < won ? ' won' : ''}"></span>`).join('');
    el['round-pips'].innerHTML = `<span class="pips sable">${dots(score.sable, 'sable')}</span><span class="pips-sep">·</span><span class="pips viper">${dots(score.viper, 'viper')}</span>`;
  }

  function setText(node, key, value) {
    if (cache[key] !== value) {
      cache[key] = value;
      node.textContent = value;
    }
  }

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    update(game) {
      const p = game.player;
      setText(el['score-sable'], 'ss', String(game.economy.state.score.sable));
      setText(el['score-viper'], 'sv', String(game.economy.state.score.viper));
      renderPips(game.economy.state.score);
      setText(el.timer, 'timer', formatTime(game.roundTime));
      el.timer.classList.toggle('low', game.phase === 'play' && game.lowTime);
      setText(el.health, 'hp', String(Math.max(0, Math.ceil(p.health))));
      setText(el.armor, 'armor', p.armor > 0 ? `+ ${Math.ceil(p.armor)} armor` : '');
      const aliveS = `SABLE ${game.bots.aliveCount('sable') + (p.alive ? 1 : 0)}`;
      const aliveV = `VIPER ${game.bots.aliveCount('viper')}`;
      setText(el['alive-sable'], 'as', aliveS);
      setText(el['alive-viper'], 'av', aliveV);
      const weapon = game.loadout.state.owned[game.loadout.state.current];
      const def = game.loadout.def();
      setText(el['ammo-mag'], 'mag', String(weapon.mag));
      setText(el['ammo-reserve'], 'res', `/ ${weapon.reserve}`);
      setText(el['weapon-name'], 'wname', def.name);
      setText(el.money, 'money', `$${game.economy.state.money}`);
      const grenades = `Frag ${game.loadout.state.grenades.frag} · Smoke ${game.loadout.state.grenades.smoke}`;
      setText(el.grenades, 'gren', grenades);
      const bomb = game.bomb;
      if (bomb.status === 'planted') {
        el['bomb-timer'].classList.remove('hidden');
        setText(el['bomb-timer'], 'bt', `BOMB ${formatTime(bomb.timer)} — defuse it!`);
      } else {
        el['bomb-timer'].classList.add('hidden');
      }
      setText(el.objective, 'obj', game.objectiveText);
      const spread = game.crosshairSpread ?? 10;
      el.crosshair.style.setProperty('--gap', `${spread}px`);
    },
    killfeed(killerName, victimName, headshot, killerIsPlayer, victimIsPlayer) {
      const line = document.createElement('div');
      line.className = 'kill-line';
      const killer = document.createElement('span');
      killer.className = killerIsPlayer ? 'kf-player' : 'kf-bot';
      killer.textContent = killerName;
      const weapon = document.createElement('span');
      weapon.className = 'kf-weapon';
      weapon.textContent = headshot ? ' ⌖ ' : ' — ';
      const victim = document.createElement('span');
      victim.className = victimIsPlayer ? 'kf-player' : 'kf-bot';
      victim.textContent = victimName;
      line.append(killer, weapon, victim);
      el.killfeed.prepend(line);
      while (el.killfeed.children.length > 5) el.killfeed.lastChild.remove();
      window.setTimeout(() => line.remove(), 6000);
    },
    showBanner(title, sub, ms = 2600) {
      el['banner-title'].textContent = title;
      el['banner-sub'].textContent = sub;
      el.banner.classList.remove('hidden');
      if (bannerTimer) window.clearTimeout(bannerTimer);
      bannerTimer = window.setTimeout(() => el.banner.classList.add('hidden'), ms);
    },
    hitmarker(headshot, kill) {
      el.hitmarker.classList.remove('show', 'head', 'kill');
      void el.hitmarker.offsetWidth;
      el.hitmarker.classList.add('show');
      if (headshot) el.hitmarker.classList.add('head');
      if (kill) el.hitmarker.classList.add('kill');
      if (hitTimer) window.clearTimeout(hitTimer);
      hitTimer = window.setTimeout(() => el.hitmarker.classList.remove('show'), 180);
    },
    damageFlash() {
      el['damage-flash'].classList.remove('show');
      void el['damage-flash'].offsetWidth;
      el['damage-flash'].classList.add('show');
    },
    showProgress(label, fraction) {
      el.progress.classList.remove('hidden');
      el['progress-label'].textContent = label;
      el['progress-fill'].style.width = `${Math.round(fraction * 100)}%`;
    },
    hideProgress() {
      el.progress.classList.add('hidden');
    },
    showBuyMenu(items, money, owned, onBuy) {
      el['buy-items'].innerHTML = '';
      for (const item of items) {
        const button = document.createElement('button');
        button.className = 'buy-item';
        const isOwned = item.kind === 'weapon' && owned[item.id];
        const affordable = money >= item.price;
        button.disabled = isOwned || !affordable;
        button.innerHTML = `<span class="buy-name">${item.name}</span><span class="buy-detail">${item.detail}</span><span class="buy-price">${isOwned ? 'OWNED' : `$${item.price}`}</span>`;
        button.addEventListener('click', () => onBuy(item));
        el['buy-items'].appendChild(button);
      }
      el['buy-menu'].classList.remove('hidden');
    },
    hideBuyMenu() {
      el['buy-menu'].classList.add('hidden');
    },
    buyMenuVisible() {
      return !el['buy-menu'].classList.contains('hidden');
    },
  };
}
