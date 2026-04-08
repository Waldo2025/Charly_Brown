const LECTURAS_GAME_RANKING_ROOT_ID = "lecturasGameRankingRoot";

const RANKING_THEMES_LEFT = [
  { name: "ADMIN", color: "#f95f66", border: "#ff9ea3", icon: "✦" },
  { name: "DEVELOPER", color: "#ff5d66", border: "#ffb6ba", icon: "◉" },
  { name: "MODERATOR", color: "#1ac52a", border: "#8dff95", icon: "✚" },
  { name: "SUPPORTER", color: "#4868ff", border: "#a5b4ff", icon: "⛨" },
  { name: "BUILDER", color: "#4662df", border: "#9eb1ff", icon: "▦" },
  { name: "VIP+", color: "#ffc74d", border: "#ffe5a3", icon: "✪" },
  { name: "VIP", color: "#d9937d", border: "#f0c9bc", icon: "⬢" },
  { name: "PLAYER", color: "#8d8f9f", border: "#d2d3db", icon: "▣" }
];

const RANKING_THEMES_RIGHT = [
  { name: "DIAMOND", color: "#49cdf8", border: "#b1efff", icon: "◆" },
  { name: "EMERALD", color: "#3ecb35", border: "#adffad", icon: "◈" },
  { name: "GOLD", color: "#efbe4b", border: "#ffe59d", icon: "▮" },
  { name: "IRON", color: "#a5abc2", border: "#e3e6f0", icon: "◻" },
  { name: "LAZULI", color: "#3459e6", border: "#a5b8ff", icon: "⬟" },
  { name: "REDSTONE", color: "#ff2a2a", border: "#ffaaaa", icon: "⬣" },
  { name: "COAL", color: "#7d7462", border: "#cbc3af", icon: "⬤" },
  { name: "YOUTUBE", color: "#ff2929", border: "#ffb2b2", icon: "▶" },
  { name: "TWITCH", color: "#8b58ef", border: "#d2b8ff", icon: "◍" }
];

function _rankingEnsureStyles() {
  if (document.getElementById("lecturasGameRankingStyles")) return;
  const style = document.createElement("style");
  style.id = "lecturasGameRankingStyles";
  style.textContent = `
  .lecturas-game-ranking{position:fixed;inset:0;z-index:13000;overflow:auto;background:#5e4a88;color:#fff;font-family:"Press Start 2P","VT323","Courier New",monospace}
  .lecturas-game-ranking__bg{position:absolute;inset:0;background-image:radial-gradient(circle at 50% 10%,rgba(173,151,237,.5),rgba(76,57,127,.82) 68%),linear-gradient(180deg,rgba(42,24,87,.5),rgba(27,14,52,.84)),var(--ranking-bg-url,none);background-size:cover;background-position:center;filter:saturate(.88) blur(.2px)}
  .lecturas-game-ranking__overlay{position:absolute;inset:0;background:radial-gradient(circle at 50% 35%,rgba(255,255,255,.12),transparent 52%)}
  .lecturas-game-ranking__shell{position:relative;max-width:1220px;min-height:100vh;margin:0 auto;padding:52px 26px 18px}
  .lecturas-game-ranking__title{font-size:clamp(1.8rem,6vw,4.2rem);line-height:1;letter-spacing:.02em;text-transform:uppercase;text-shadow:5px 5px 0 #2f224d,2px 2px 0 #2f224d;margin:0;color:#f7f7ff}
  .lecturas-game-ranking__pack{font-size:clamp(1rem,3vw,2.1rem);line-height:1;margin-top:10px;letter-spacing:.06em;text-shadow:4px 4px 0 #2f224d}
  .lecturas-game-ranking__caption{margin-top:14px;font-size:.62rem;letter-spacing:.08em;opacity:.95}
  .lecturas-game-ranking__grid{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin-top:38px}
  .lecturas-game-ranking__col{display:flex;flex-direction:column;gap:10px}
  .lecturas-game-ranking__bar{display:grid;grid-template-columns:34px 1fr;align-items:center;min-height:43px;padding:0 8px 0 0;border:3px solid var(--row-border,#fff);background:var(--row-bg,#666);box-shadow:0 0 0 3px rgba(33,18,61,.58)}
  .lecturas-game-ranking__gem{display:flex;align-items:center;justify-content:center;height:100%;font-size:1rem;background:rgba(0,0,0,.27);border-right:3px solid rgba(255,255,255,.3)}
  .lecturas-game-ranking__text{display:flex;justify-content:space-between;gap:8px;align-items:center;padding-left:8px;font-size:clamp(.58rem,1.15vw,.95rem);letter-spacing:.04em;text-transform:uppercase;line-height:1.2;text-shadow:2px 2px 0 rgba(0,0,0,.45)}
  .lecturas-game-ranking__name{max-width:74%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .lecturas-game-ranking__score{font-size:.7em;opacity:.95}
  .lecturas-game-ranking__bar.is-player{box-shadow:0 0 0 3px rgba(0,0,0,.66),0 0 0 6px rgba(145,255,174,.42)}
  .lecturas-game-ranking__icon-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:30px;align-items:center;font-size:1.1rem;opacity:.95;text-shadow:2px 2px 0 rgba(0,0,0,.4)}
  .lecturas-game-ranking__foot{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-top:22px;flex-wrap:wrap}
  .lecturas-game-ranking__signature{font-size:clamp(.6rem,1.5vw,1.1rem);letter-spacing:.08em;text-transform:uppercase;text-shadow:2px 2px 0 rgba(0,0,0,.5)}
  .lecturas-game-ranking__actions{display:flex;gap:8px;flex-wrap:wrap}
  .lecturas-game-ranking__btn{border:3px solid #262338;box-shadow:0 0 0 2px rgba(255,255,255,.24);padding:10px 13px;font-family:inherit;font-size:.6rem;text-transform:uppercase;letter-spacing:.06em;cursor:pointer}
  .lecturas-game-ranking__btn--ghost{background:#c7b8ea;color:#23154a}
  .lecturas-game-ranking__btn--primary{background:#7dff8e;color:#11321b}
  .lecturas-game-ranking__btn:active{transform:translateY(1px)}
  @media (max-width:980px){
    .lecturas-game-ranking__shell{padding:26px 14px 12px}
    .lecturas-game-ranking__grid{grid-template-columns:1fr;gap:12px;margin-top:24px}
    .lecturas-game-ranking__bar{min-height:36px}
    .lecturas-game-ranking__icon-row{gap:8px;margin-top:16px}
  }
  `;
  document.head.appendChild(style);
}

function _escapeHtml(text = "") {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function closeLecturasGameRankingView() {
  const current = document.getElementById(LECTURAS_GAME_RANKING_ROOT_ID);
  if (current) current.remove();
}

function _renderBars(entries = [], themes = [], startRank = 1, highlight = "") {
  return entries.map((entry, idx) => {
    const theme = themes[idx % themes.length] || themes[0];
    const isPlayer = String(entry?.id || "") === highlight;
    const place = startRank + idx;
    const labelName = String(entry?.name || "Jugador");
    return `
      <article class="lecturas-game-ranking__bar${isPlayer ? " is-player" : ""}" style="--row-bg:${theme.color};--row-border:${theme.border};">
        <div class="lecturas-game-ranking__gem">${_escapeHtml(theme.icon)}</div>
        <div class="lecturas-game-ranking__text">
          <span class="lecturas-game-ranking__name">${_escapeHtml(labelName)}</span>
          <span class="lecturas-game-ranking__score">#${place} | ${Math.round(Number(entry?.bestScore || 0))} pts</span>
        </div>
      </article>
    `;
  }).join("");
}

function openLecturasGameRankingView(options = {}) {
  _rankingEnsureStyles();
  closeLecturasGameRankingView();

  const entries = Array.isArray(options?.entries) ? options.entries.slice(0, 12) : [];
  const highlight = String(options?.playerHighlight || "").trim();
  const backgroundImageUrl = String(options?.backgroundImageUrl || "").trim();
  const leftEntries = entries.slice(0, Math.ceil(entries.length / 2));
  const rightEntries = entries.slice(Math.ceil(entries.length / 2));

  const root = document.createElement("section");
  root.id = LECTURAS_GAME_RANKING_ROOT_ID;
  root.className = "lecturas-game-ranking";
  if (backgroundImageUrl) {
    root.style.setProperty("--ranking-bg-url", `url(\"${backgroundImageUrl.replace(/\"/g, "\\\"")}\")`);
  }

  const leftHtml = leftEntries.length
    ? _renderBars(leftEntries, RANKING_THEMES_LEFT, 1, highlight)
    : '<article class="lecturas-game-ranking__bar" style="--row-bg:#7d7d94;--row-border:#d0d0e4;"><div class="lecturas-game-ranking__gem">•</div><div class="lecturas-game-ranking__text"><span class="lecturas-game-ranking__name">SIN JUGADORES</span><span class="lecturas-game-ranking__score">0 pts</span></div></article>';
  const rightHtml = rightEntries.length
    ? _renderBars(rightEntries, RANKING_THEMES_RIGHT, leftEntries.length + 1, highlight)
    : "";

  root.innerHTML = `
    <div class="lecturas-game-ranking__bg" aria-hidden="true"></div>
    <div class="lecturas-game-ranking__overlay" aria-hidden="true"></div>
    <div class="lecturas-game-ranking__shell">
      <h2 class="lecturas-game-ranking__title">BETTER RANKS</h2>
      <div class="lecturas-game-ranking__pack">PACK</div>
      <p class="lecturas-game-ranking__caption">ATRAPA EL SINÓNIMO | Ranking global por bestScore (Firebase)</p>

      <section class="lecturas-game-ranking__grid">
        <div class="lecturas-game-ranking__col">${leftHtml}</div>
        <div class="lecturas-game-ranking__col">${rightHtml}</div>
      </section>

      <div class="lecturas-game-ranking__icon-row" aria-hidden="true">
        <span>✦</span><span>◉</span><span>⛨</span><span>▦</span><span>✪</span><span>⬢</span><span>▣</span><span>◆</span><span>◈</span><span>▮</span><span>◻</span><span>⬟</span><span>⬣</span><span>⬤</span><span>▶</span><span>◍</span>
      </div>

      <footer class="lecturas-game-ranking__foot">
        <div class="lecturas-game-ranking__signature">+ITEMSADDER CONFIG</div>
        <div class="lecturas-game-ranking__actions">
          <button type="button" class="lecturas-game-ranking__btn lecturas-game-ranking__btn--ghost" data-action="back-reading">Volver a lectura</button>
          <button type="button" class="lecturas-game-ranking__btn lecturas-game-ranking__btn--primary" data-action="play-again">Jugar de nuevo</button>
        </div>
      </footer>
    </div>
  `;

  root.addEventListener("click", (event) => {
    const btn = event.target?.closest?.("[data-action]");
    if (!btn) return;
    const action = String(btn.getAttribute("data-action") || "");
    if (action === "play-again") {
      if (typeof options?.onPlayAgain === "function") options.onPlayAgain();
      return;
    }
    if (action === "back-reading") {
      if (typeof options?.onBackToReading === "function") options.onBackToReading();
    }
  });

  document.body.appendChild(root);
  return root;
}

window.openLecturasGameRankingView = openLecturasGameRankingView;
window.closeLecturasGameRankingView = closeLecturasGameRankingView;

export {
  openLecturasGameRankingView,
  closeLecturasGameRankingView
};
