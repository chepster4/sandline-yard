// SANDLINE YARD — team radio. A callout feed in the HUD: the round plan,
// bomb events and last-man warnings, spoken by the bots' own logic, so the
// teams read as a squad with a plan instead of nine lone bots. The feed
// builds its own element inside #hud, so no other module changes. Rows
// expire after five seconds; at most four show at once. Deterministic in
// shot mode: callouts fire only from game events, never from wall time.
export function createRadio(document) {
  const hud = document.getElementById('hud');
  const feed = document.createElement('div');
  feed.id = 'radio-feed';
  feed.style.cssText = [
    'position:absolute', 'left:16px', 'top:110px', 'z-index:21',
    'display:flex', 'flex-direction:column', 'gap:4px', 'align-items:flex-start',
    'pointer-events:none', 'max-width:340px',
  ].join(';');
  hud.appendChild(feed);

  function row(text, accent) {
    const el = document.createElement('div');
    el.style.cssText = [
      'background:rgba(23,19,16,0.82)', 'border:1px solid rgba(201,160,106,0.35)',
      'border-left:3px solid ' + accent, 'border-radius:4px', 'padding:4px 10px',
      'font-size:12px', 'letter-spacing:0.5px', 'color:#e8ddc9',
      'transition:opacity 0.6s', 'white-space:nowrap',
    ].join(';');
    el.textContent = text;
    feed.prepend(el);
    while (feed.children.length > 4) feed.removeChild(feed.lastChild);
    window.setTimeout(() => {
      el.style.opacity = '0';
      window.setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 650);
    }, 5000);
  }

  const TEAM_COLOR = { sable: '#2fa8a0', viper: '#e07830' };
  return {
    // Clear the feed at the buy phase, so a past round's callouts never
    // linger into the next round's plan.
    clear() {
      while (feed.firstChild) feed.removeChild(feed.firstChild);
    },
    // The round plan, announced at the buy phase: who carries, where to.
    plan(attackSide, site, carrierName) {
      const side = attackSide.toUpperCase();
      const who = carrierName === 'player' ? 'You carry' : `${carrierName} carries`;
      row(`▸ ${side} PLAN — ${who} · push site ${site}`, TEAM_COLOR[attackSide]);
    },
    callout(text, team) {
      row(`▸ ${text}`, TEAM_COLOR[team] || '#e8a33d');
    },
  };
}
