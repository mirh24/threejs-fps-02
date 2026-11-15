// hud.js — every DOM element the player sees: health/armor bars, ammo,
// timer, score, money, team roster, kill feed, bomb line, crosshair,
// hitmarker, buy menu and round banners. Writes are cached: a value is
// only pushed to the DOM when it actually changed, so the HUD costs
// nothing on frames where nothing changed.
export class Hud {
  constructor(doc) {
    this.d = doc;
    this.el = {};
    for (const id of ['overlay', 'overlay-title', 'overlay-copy', 'play', 'hud', 'crosshair',
      'hitmarker', 'health-num', 'health-fill', 'armor-num', 'armor-fill', 'armor-row',
      'ammo-mag', 'ammo-reserve', 'ammo-label', 'timer', 'round-label', 'score-v', 'score-e',
      'money', 'roster', 'killfeed', 'bomb-line', 'banner', 'banner-title', 'banner-sub',
      'buy-menu', 'buy-items', 'buy-money', 'hint', 'weapon-name', 'grenade-count', 'mute-note']) {
      this.el[id] = doc.getElementById(id);
    }
    this.cache = {};
    this._hitTimer = 0;
    this._bannerTimer = 0;
  }

  _set(id, text) {
    if (this.cache[id] === text) return;
    this.cache[id] = text;
    const el = this.el[id];
    if (el) el.textContent = text;
  }

  _bar(id, pct) {
    const key = `bar:${id}`;
    const v = Math.round(pct);
    if (this.cache[key] === v) return;
    this.cache[key] = v;
    const el = this.el[id];
    if (el) el.style.width = `${Math.max(0, Math.min(100, v))}%`;
  }

  showOverlay(title, copy) {
    this._set('overlay-title', title);
    this._set('overlay-copy', copy);
    this.el.overlay.hidden = false;
  }
  hideOverlay() { this.el.overlay.hidden = true; }

  banner(title, sub, color = '#ff8c3a') {
    this._set('banner-title', title);
    this._set('banner-sub', sub);
    this.el.banner.style.borderColor = color;
    this.el['banner-title'].style.color = color;
    this.el.banner.hidden = false;
    this._bannerTimer = 4.5;
  }
  hideBanner() { this.el.banner.hidden = true; }

  kill(text) {
    const feed = this.el.killfeed;
    if (!feed) return;
    const div = this.d.createElement('div');
    div.className = 'feed-line';
    div.textContent = text;
    feed.prepend(div);
    while (feed.children.length > 5) feed.removeChild(feed.lastChild);
    setTimeout(() => { if (div.parentNode) div.classList.add('fade'); }, 5000);
  }

  addKill(killer, victim, weapon, head) {
    this.kill(`${killer}  ✕  ${victim}${head ? '  [HEADSHOT]' : ''}   · ${weapon}`);
  }

  radio(text) { this.kill(`📻 ${text}`); }

  hitmarker(head) {
    const el = this.el.hitmarker;
    el.classList.add('on');
    el.style.color = head ? '#ff5a3c' : '#f0b429';
    clearTimeout(this._hitTimer);
    this._hitTimer = setTimeout(() => el.classList.remove('on'), 110);
  }

  // Build the buy menu rows once; update affordability + money per frame.
  buildBuy(shop) {
    const box = this.el['buy-items'];
    box.innerHTML = '';
    this._buyRows = {};
    for (const item of shop) {
      const row = this.d.createElement('div');
      row.className = 'buy-row';
      row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name"></span><span class="buy-desc"></span><span class="buy-price"></span>`;
      row.querySelector('.buy-name').textContent = item.name;
      row.querySelector('.buy-desc').textContent = item.desc;
      row.querySelector('.buy-price').textContent = `$${item.price}`;
      box.appendChild(row);
      this._buyRows[item.id] = row;
    }
  }

  renderBuy(shop, money, owned) {
    if (!this._buyRows) return;
    for (const item of shop) {
      const row = this._buyRows[item.id];
      const afford = money >= item.price;
      row.classList.toggle('cant', !afford);
      row.classList.toggle('owned', !!owned[item.id]);
    }
    this._set('buy-money', `$${money}`);
  }

  setBuyOpen(open) {
    const key = 'buyOpen';
    if (this.cache[key] === open) return;
    this.cache[key] = open;
    this.el['buy-menu'].hidden = !open;
  }

  setScoped(scoped) {
    if (this.cache.scoped === scoped) return;
    this.cache.scoped = scoped;
    this.el.crosshair.classList.toggle('scoped', scoped);
  }

  setCrosshair(spreadPx) {
    const s = 1 + Math.min(1.4, spreadPx / 26);
    const key = Math.round(s * 20);
    if (this.cache.chScale === key) return;
    this.cache.chScale = key;
    this.el.crosshair.style.transform = `translate(-50%, -50%) scale(${s.toFixed(2)})`;
  }

  setHint(text) { this._set('hint', text); }

  update(s) {
    this._set('health-num', String(Math.ceil(s.health)));
    this._bar('health-fill', (s.health / 100) * 100);
    this._set('armor-num', String(Math.ceil(s.armor)));
    this._bar('armor-fill', (s.armor / 100) * 100);
    this.el['armor-row'].style.opacity = s.armor > 0 ? '1' : '0.35';
    this._set('money', `$${Math.floor(s.money)}`);
    this._set('ammo-mag', s.reloading ? '--' : String(s.mag));
    this._set('ammo-reserve', `/ ${s.reserve}`);
    this._set('ammo-label', s.reloading ? 'RELOADING' : s.weaponName);
    this._set('grenade-count', `◉ ${s.grenades}`);
    this._set('timer', s.timerText);
    this._set('round-label', `ROUND ${s.round}`);
    this._set('score-v', String(s.scoreV));
    this._set('score-e', String(s.scoreE));
    this._set('bomb-line', s.bombLine);
    this.el['bomb-line'].style.color = s.bombPlanted ? '#ff5a3c' : '#b8ab90';
    // Roster: alive names bright, dead names struck through.
    const rosterHtml = s.roster.map((r) => {
      const cls = r.alive ? (r.team === 'EMBER' ? 'ember' : 'sable') : 'dead';
      return `<div class="roster-row ${cls}">${r.alive ? '●' : '✕'} ${r.name}</div>`;
    }).join('');
    if (this.cache.roster !== rosterHtml) {
      this.cache.roster = rosterHtml;
      this.el.roster.innerHTML = rosterHtml;
    }
    if (this._bannerTimer > 0) {
      this._bannerTimer -= s.dt;
      if (this._bannerTimer <= 0) this.hideBanner();
    }
  }
}
