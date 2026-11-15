// The DOM HUD: health, ammo, money, timer, score, kill feed, bomb status, buy
// menu, banners and the crosshair. It never touches the simulation; main.js
// pushes numbers in and reads callbacks out. Every setter is cheap and skips
// work when nothing changed, so it can run every frame.
import { formatMoney, formatTimer } from './util.js';

const COPY = {
  start: {
    title: 'DUSTLINE',
    copy: 'A tactical FPS in a freight yard at dusk. Plant the bomb at A or B, or wipe out EMBER. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'DUSTLINE',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  matchWin: {
    title: 'VANGUARD WINS',
    copy: 'The yard is yours. EMBER never stood a chance.',
    action: 'Play again',
  },
  matchLose: {
    title: 'EMBER WINS',
    copy: 'The yard stays theirs. Run it back.',
    action: 'Play again',
  },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const hud = $('hud');
  const timer = $('timer');
  const scoreV = $('score-v');
  const scoreE = $('score-e');
  const roundLabel = $('round-label');
  const healthNum = $('health-num');
  const healthBar = $('health-bar');
  const armor = $('armor');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const money = $('money');
  const grenades = $('grenades');
  const slots = $('slots');
  const feed = $('feed');
  const bombStatus = $('bomb-status');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const damageVignette = $('damage-vignette');
  const damageDir = $('damage-dir');
  const buyMenu = $('buy-menu');
  const buyItems = $('buy-items');
  const buyMoney = $('buy-money');
  const banner = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const actionBar = $('action-bar');
  const actionLabel = $('action-label');
  const actionFill = $('action-fill');

  let hitTimer = 0;
  let damageTimer = 0;
  let bannerTimer = 0;
  let last = {};
  let buyHandler = null;

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setHealth(hp) {
      setText(healthNum, 'hp', String(Math.max(0, Math.ceil(hp))));
      const pct = Math.max(0, Math.min(100, hp));
      if (last.hpPct !== pct) {
        last.hpPct = pct;
        healthBar.style.width = `${pct}%`;
        healthBar.classList.toggle('low', pct <= 30);
      }
    },
    setArmor(hasArmor) {
      if (last.armor === hasArmor) return;
      last.armor = hasArmor;
      armor.hidden = !hasArmor;
    },
    setAmmo(mag, reserve) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'res', `/ ${reserve}`);
      const empty = mag === 0;
      if (last.empty !== empty) {
        last.empty = empty;
        ammoMag.classList.toggle('empty', empty);
      }
    },
    setWeapon(name, grenadeCount) {
      setText(weaponName, 'weapon', name);
      setText(grenades, 'grenades', grenadeCount > 0 ? `◉ ${grenadeCount}` : '');
    },
    setMoney(value) {
      setText(money, 'money', formatMoney(value));
      setText(buyMoney, 'buyMoney', formatMoney(value));
    },
    setTimer(seconds, phase) {
      const text = phase === 'buy' ? `BUY ${formatTimer(seconds)}` : formatTimer(seconds);
      setText(timer, 'timer', text);
      const urgent = phase === 'live' && seconds <= 15;
      if (last.urgent !== urgent) {
        last.urgent = urgent;
        timer.classList.toggle('urgent', urgent);
      }
    },
    setScore(v, e, round, maxRounds) {
      setText(scoreV, 'sv', String(v));
      setText(scoreE, 'se', String(e));
      setText(roundLabel, 'round', `ROUND ${round} / ${maxRounds}`);
    },
    setSlots(list, current) {
      const key = list.map((s) => `${s.key}:${s.name}:${s.owned}`).join('|') + current;
      if (last.slots === key) return;
      last.slots = key;
      slots.innerHTML = list
        .map(
          (s) =>
            `<span class="slot${s.owned ? '' : ' locked'}${s.id === current ? ' current' : ''}">${s.key} ${s.name}</span>`,
        )
        .join('');
    },
    setBomb(text, urgent) {
      setText(bombStatus, 'bomb', text);
      if (last.bombUrgent !== urgent) {
        last.bombUrgent = urgent;
        bombStatus.classList.toggle('urgent', urgent);
      }
      bombStatus.hidden = text === '';
    },
    setCrosshair(spreadPx) {
      crosshair.style.setProperty('--gap', `${spreadPx.toFixed(1)}px`);
    },
    hitMarker(killed, headshot) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('head', headshot);
      hitmarker.style.transform = killed
        ? 'translate(-50%, -50%) rotate(45deg) scale(1.3)'
        : '';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => {
        hitmarker.classList.remove('on');
        hitmarker.classList.remove('head');
        hitmarker.style.transform = '';
      }, killed ? 160 : 90);
    },
    damageFrom(angleDeg) {
      damageVignette.classList.add('on');
      damageDir.style.transform = `rotate(${angleDeg}deg)`;
      damageDir.classList.add('on');
      clearTimeout(damageTimer);
      damageTimer = setTimeout(() => {
        damageVignette.classList.remove('on');
        damageDir.classList.remove('on');
      }, 450);
    },
    addKill(attacker, weapon, victim, headshot) {
      const line = document.createElement('div');
      line.className = 'feed-line';
      line.innerHTML = `<span class="feed-a">${attacker}</span> <span class="feed-w">[${weapon}${headshot ? ' ★' : ''}]</span> <span class="feed-v">${victim}</span>`;
      feed.prepend(line);
      while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      setTimeout(() => line.classList.add('fade'), 4200);
      setTimeout(() => line.remove(), 5000);
    },
    showBanner(titleText, subText) {
      bannerTitle.textContent = titleText;
      bannerSub.textContent = subText;
      banner.hidden = false;
      clearTimeout(bannerTimer);
      // In a ?shot= capture the banner must stay up for the screenshot; in
      // live play it fades after a few seconds.
      if (new URLSearchParams(window.location.search).has('shot')) return;
      bannerTimer = setTimeout(() => {
        banner.hidden = true;
      }, 3200);
    },
    hideBanner() {
      banner.hidden = true;
    },
    showAction(label, progress) {
      actionBar.hidden = false;
      setText(actionLabel, 'action', label);
      actionFill.style.width = `${Math.round(progress * 100)}%`;
    },
    hideAction() {
      actionBar.hidden = true;
    },
    showBuy(items) {
      buyMenu.hidden = false;
      buyItems.innerHTML = items
        .map(
          (item) => `<button class="buy-item${item.owned ? ' owned' : ''}${item.affordable ? '' : ' poor'}" data-buy="${item.id}">
          <span class="buy-key">${item.key}</span>
          <span class="buy-name">${item.name}</span>
          <span class="buy-desc">${item.desc}</span>
          <span class="buy-price">${item.owned ? 'OWNED' : formatMoney(item.price)}</span>
        </button>`,
        )
        .join('');
      buyItems.querySelectorAll('[data-buy]').forEach((button) => {
        button.addEventListener('click', () => {
          if (buyHandler) buyHandler(button.dataset.buy);
        });
      });
    },
    hideBuy() {
      buyMenu.hidden = true;
    },
    onBuy(handler) {
      buyHandler = handler;
    },
    showOverlay(mode) {
      const text = COPY[mode];
      title.textContent = text.title;
      copy.textContent = text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      hud.hidden = true;
      play.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
      hud.hidden = false;
    },
    onPlay(handler) {
      play.addEventListener('click', handler);
    },
  };
}
