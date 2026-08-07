const SERIES_CONFIG = [
  { key: "a", label: "Série A", color: "#14532d" },
  { key: "b", label: "Série B", color: "#1d4ed8" },
  { key: "c", label: "Série C", color: "#7c3aed" },
  { key: "d", label: "Série D", color: "#be185d" },
  { key: "acesso", label: "Divisão de Acesso", color: "#4b5563" },
];

const DAILY_VOTE_LIMIT = 40;

// Firebase Analytics (GA4). Envolvido em try pra nunca quebrar o app se bloqueado.
let analytics = null;
try {
  analytics = firebase.analytics();
} catch (e) {
  console.warn("Analytics indisponível:", e.message);
}
function track(event, params) {
  try {
    if (analytics) analytics.logEvent(event, params || {});
  } catch (e) {
    /* ignora */
  }
}

let state = { bands: [] };
let isAdmin = false;
let filterState = { search: "", genre: "" };
let collapsedSeries = new Set(); // séries recolhidas pelo usuário
let rankMovement = new Map(); // bandId -> quantas posições subiu(+)/desceu(-) no último fechamento
let sessionSpotifyToken = null; // token do Spotify resolvido a partir do campo de credencial
let sessionSpotifyCredUsed = null; // qual credencial gerou o token (pra re-resolver se mudar)
let pendingExtras = null; // dados extras do último Auto-preencher (gênero, bio...) pra salvar no submit

function credSpotifyInput() {
  const el = document.getElementById("cred-spotify");
  return el ? el.value.trim() : "";
}
function credLastfmInput() {
  const el = document.getElementById("cred-lastfm");
  return el ? el.value.trim() : "";
}
// Resolve (e cacheia) o token do Spotify a partir do campo de credencial.
async function ensureSpotifyToken() {
  const cred = credSpotifyInput();
  if (!cred) return null;
  if (sessionSpotifyToken && sessionSpotifyCredUsed === cred) return sessionSpotifyToken;
  sessionSpotifyToken = await resolveSpotifyToken(cred);
  sessionSpotifyCredUsed = cred;
  return sessionSpotifyToken;
}
let myVotes = new Map();
let todayVotes = [];
let metaState = {};

function formatNumber(n) {
  return n.toLocaleString("pt-BR");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

// Ranking: votos (score) em 1º lugar; ouvintes do Last.fm só desempatam quem tem os mesmos votos.
function byRank(a, b) {
  return (b.score || 0) - (a.score || 0) || (b.lastfmListeners || 0) - (a.lastfmListeners || 0);
}

function getTiers() {
  const sorted = [...state.bands].sort(byRank);
  const total = sorted.length;
  const groupCount = SERIES_CONFIG.length;
  const base = Math.floor(total / groupCount);
  const remainder = total % groupCount;
  const tiers = {};
  let offset = 0;
  SERIES_CONFIG.forEach((cfg, idx) => {
    const size = base + (idx < remainder ? 1 : 0);
    tiers[cfg.key] = sorted.slice(offset, offset + size);
    offset += size;
  });
  return tiers;
}

function buildTierSections() {
  const container = document.getElementById("tiers-container");
  SERIES_CONFIG.forEach((cfg) => {
    const section = document.createElement("section");
    section.className = "tier";
    section.id = `tier-${cfg.key}`;

    const title = document.createElement("h2");
    title.className = "tier-title";
    title.style.background = cfg.color;
    const caret = document.createElement("span");
    caret.className = "tier-caret";
    caret.textContent = "▾";
    title.append(caret, document.createTextNode(" " + cfg.label));
    title.title = "Clique para recolher/expandir";
    title.addEventListener("click", () => {
      if (collapsedSeries.has(cfg.key)) collapsedSeries.delete(cfg.key);
      else collapsedSeries.add(cfg.key);
      // durante busca/filtro a série fica sempre expandida pra mostrar o resultado
      section.classList.toggle("collapsed", collapsedSeries.has(cfg.key) && !isFiltering());
    });

    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    wrap.innerHTML = `
      <table class="liga-table">
        <thead><tr><th>Pos</th><th></th><th>Banda</th><th>Votar</th><th></th></tr></thead>
        <tbody id="tbody-${cfg.key}"></tbody>
      </table>
    `;

    section.append(title, wrap);
    container.appendChild(section);
  });
}

function zoneClassFor(index, length, { g4, z4 }) {
  if (length <= 4) return "";
  if (g4 && index < 4) return "g4";
  if (z4 && index >= Math.max(4, length - 4)) return "z4";
  return "";
}

const SPOTIFY_ICON_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="#1DB954" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 10.02 15 10.68 18.72 12.9c.361.181.54.78.241 1.14zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`;

const INSTAGRAM_ICON_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#E4405F" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/></svg>`;

const YOUTUBE_ICON_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.376.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.376-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><path fill="#fff" d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`;

const LASTFM_ICON_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#D51007"/><text x="12" y="16" font-size="8" font-family="Arial, sans-serif" font-weight="bold" fill="#fff" text-anchor="middle">fm</text></svg>`;

function buildBandIcons(band) {
  const wrap = document.createElement("span");
  wrap.className = "band-icons";

  if (band.spotify) {
    const link = document.createElement("a");
    link.href = band.spotify;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "band-icon";
    link.title = "Ouvir no Spotify";
    link.innerHTML = SPOTIFY_ICON_SVG;
    wrap.appendChild(link);
  }

  if (band.youtube) {
    const link = document.createElement("a");
    link.href = band.youtube;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "band-icon";
    link.title = "Ver no YouTube";
    link.innerHTML = YOUTUBE_ICON_SVG;
    wrap.appendChild(link);
  }

  if (band.instagram) {
    const link = document.createElement("a");
    link.href = `https://instagram.com/${band.instagram}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "band-icon";
    link.title = `@${band.instagram} no Instagram`;
    link.innerHTML = INSTAGRAM_ICON_SVG;
    wrap.appendChild(link);
  }

  if (band.lastfm) {
    const link = document.createElement("a");
    link.href = band.lastfm;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "band-icon";
    link.title = "Ver no Last.fm";
    link.innerHTML = LASTFM_ICON_SVG;
    wrap.appendChild(link);
  }

  return wrap;
}

// Extrai o ID do artista de uma URL do Spotify (open.spotify.com/artist/ID) pro embed.
function spotifyArtistId(url) {
  const m = /open\.spotify\.com\/artist\/([A-Za-z0-9]+)/.exec(url || "");
  return m ? m[1] : null;
}

function bandRankPosition(band) {
  const sorted = [...state.bands].sort(byRank);
  return sorted.findIndex((b) => b.id === band.id) + 1;
}

// Mini-gráfico da evolução da posição (menor = melhor = mais alto no gráfico).
function buildSparkline(history) {
  const pts = (history || []).slice(-12).map((h) => h.pos).filter((p) => typeof p === "number");
  if (pts.length < 2) return "";
  const w = 240, h = 44, pad = 4;
  const min = Math.min(...pts), max = Math.max(...pts);
  const range = max - min || 1;
  const step = (w - pad * 2) / (pts.length - 1);
  const coords = pts
    .map((p, i) => `${(pad + i * step).toFixed(1)},${(pad + ((p - min) / range) * (h - pad * 2)).toFixed(1)}`)
    .join(" ");
  return `<div class="band-history">
    <span class="hint">Evolução da posição: #${pts[0]} → #${pts[pts.length - 1]}</span>
    <svg viewBox="0 0 ${w} ${h}" class="sparkline" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${coords}" fill="none" stroke="#22c55e" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    </svg>
  </div>`;
}

async function openBandModal(band) {
  const content = document.getElementById("band-modal-content");
  const pos = bandRankPosition(band);
  // Board não traz bio/history (pra ficar leve): busca o doc completo sob demanda.
  if (band.history === undefined && band.bio === undefined) {
    try {
      const doc = await db.collection("bands").doc(band.id).get();
      if (doc.exists) band = { ...band, ...doc.data() };
    } catch (e) {
      /* segue com o que tem */
    }
  }
  const mv = rankMovement.get(band.id) || 0;
  const mvHtml =
    mv !== 0
      ? `<span class="rank-move ${mv > 0 ? "up" : "down"}">${mv > 0 ? "▲" : "▼"}${Math.abs(mv)}</span>`
      : "";
  const genres =
    Array.isArray(band.genres) && band.genres.length
      ? `<div class="band-meta">${band.genres
          .slice(0, 4)
          .map((g) => `<span class="band-genre">${escapeHtml(g)}</span>`)
          .join("")}</div>`
      : "";

  const artistId = spotifyArtistId(band.spotify);
  const player = artistId
    ? `<iframe class="band-embed" src="https://open.spotify.com/embed/artist/${artistId}?theme=0"
         width="100%" height="352" frameborder="0" loading="lazy"
         allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>`
    : `<p class="hint">Sem player do Spotify pra esta banda.</p>`;

  const bio = band.bio
    ? `<p class="band-bio">${escapeHtml(band.bio)}</p>`
    : "";

  const img = band.image
    ? `<img class="band-modal-img" src="${escapeHtml(band.image)}" alt="${escapeHtml(band.name)}">`
    : "";

  content.innerHTML = `
    <div class="band-modal-head">
      ${img}
      <div>
        <div class="band-modal-pos">#${pos} ${mvHtml}</div>
        <h2 class="band-modal-name">${escapeHtml(band.name)}</h2>
        ${genres}
      </div>
    </div>
    ${bio}
    ${buildSparkline(band.history)}
    ${player}
    <div class="band-modal-links" id="band-modal-links"></div>
    <button type="button" id="band-share-btn" class="band-share-btn">Compartilhar</button>
  `;
  document.getElementById("band-modal-links").appendChild(buildBandIcons(band));
  document.getElementById("band-share-btn").addEventListener("click", () => shareBand(band, pos));
  document.getElementById("band-modal").classList.remove("hidden");
  track("band_view", { band_name: band.name, position: pos });
}

async function shareBand(band, pos) {
  const url = `https://ligadasbandas.com/?band=${band.id}`;
  const text = `${band.name} está em #${pos} na Liga das Bandas! Bora votar:`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Liga das Bandas", text, url });
      track("share", { method: "native", band_name: band.name });
    } else {
      await navigator.clipboard.writeText(url);
      track("share", { method: "copy", band_name: band.name });
      alert("Link copiado!");
    }
  } catch (err) {
    // usuário cancelou o compartilhamento — ignora
  }
}

// Abre a ficha da banda automaticamente quando o link tem ?band=<id>.
let deepLinkChecked = false;
function checkDeepLink() {
  if (deepLinkChecked || !state.bands.length) return;
  deepLinkChecked = true;
  const id = new URLSearchParams(location.search).get("band");
  if (!id) return;
  const band = state.bands.find((b) => b.id === id);
  if (band) openBandModal(band);
}

function closeBandModal() {
  document.getElementById("band-modal").classList.add("hidden");
  // para o player (remove o iframe pra não continuar tocando)
  document.getElementById("band-modal-content").innerHTML = "";
}

function buildBandImage(band) {
  if (band.image) {
    const img = document.createElement("img");
    img.className = "band-thumb";
    img.src = band.image;
    img.alt = band.name;
    img.loading = "lazy";
    return img;
  }
  const placeholder = document.createElement("div");
  placeholder.className = "band-thumb band-thumb-placeholder";
  placeholder.textContent = ((band.name || "?").trim()[0] || "?").toUpperCase();
  return placeholder;
}

function buildBandMeta(band) {
  const parts = [];
  if (Array.isArray(band.genres) && band.genres.length) {
    parts.push(`<span class="band-genre">${band.genres.slice(0, 2).map(escapeHtml).join(" · ")}</span>`);
  }
  if (!parts.length) return null;
  const div = document.createElement("div");
  div.className = "band-meta";
  div.innerHTML = parts.join("");
  return div;
}

function buildVoteCell(band) {
  const wrap = document.createElement("div");
  wrap.className = "vote-cell";

  const upBtn = document.createElement("button");
  upBtn.type = "button";
  upBtn.className = "vote-btn vote-up";
  upBtn.textContent = "↑";

  const downBtn = document.createElement("button");
  downBtn.type = "button";
  downBtn.className = "vote-btn vote-down";
  downBtn.textContent = "↓";

  const voted = myVotes.get(band.id);

  // Clicar no botão já escolhido remove o voto; nos dois casos o botão fica clicável.
  upBtn.addEventListener("click", () => handleVoteClick(band, "up", upBtn, downBtn));
  downBtn.addEventListener("click", () => handleVoteClick(band, "down", upBtn, downBtn));

  if (voted === "up") {
    upBtn.classList.add("vote-chosen");
    upBtn.title = "Seu voto — clique pra remover";
    downBtn.title = "Trocar voto pra descer";
  } else if (voted === "down") {
    downBtn.classList.add("vote-chosen");
    downBtn.title = "Seu voto — clique pra remover";
    upBtn.title = "Trocar voto pra subir";
  } else {
    upBtn.title = "Votar pra subir";
    downBtn.title = "Votar pra descer";
  }

  wrap.append(upBtn, downBtn);
  return wrap;
}

function passesFilter(band) {
  const matchesSearch =
    !filterState.search || band.name.toLowerCase().includes(filterState.search);
  const matchesGenre =
    !filterState.genre ||
    (Array.isArray(band.genres) &&
      band.genres.some((g) => g.toLowerCase() === filterState.genre.toLowerCase()));
  return matchesSearch && matchesGenre;
}

function isFiltering() {
  return !!(filterState.search || filterState.genre);
}

function refreshGenreOptions() {
  const select = document.getElementById("genre-filter");
  if (!select) return;
  const genres = [...new Set(state.bands.flatMap((b) => b.genres || []))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
  const current = select.value;
  select.innerHTML =
    '<option value="">Todos os gêneros</option>' +
    genres.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
  if (genres.some((g) => g === current)) select.value = current;
  else filterState.genre = "";
}

function renderTable(tbodyId, list, zoneConfig) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = "";

  if (list.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    tr.innerHTML = `<td colspan="5">Nenhuma banda nessa série ainda</td>`;
    tbody.appendChild(tr);
    return 0;
  }

  const entries = list
    .map((band, index) => ({ band, index }))
    .filter((entry) => passesFilter(entry.band));

  if (entries.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    tr.innerHTML = `<td colspan="5">Nenhuma banda encontrada com esse filtro</td>`;
    tbody.appendChild(tr);
    return 0;
  }

  entries.forEach(({ band, index }) => {
    const tr = document.createElement("tr");
    const zoneClass = zoneClassFor(index, list.length, zoneConfig);
    if (zoneClass) tr.classList.add(zoneClass);

    const posTd = document.createElement("td");
    posTd.className = "pos";
    const posNum = document.createElement("span");
    posNum.textContent = index + 1;
    posTd.appendChild(posNum);
    const mv = rankMovement.get(band.id) || 0;
    if (mv !== 0) {
      const moveEl = document.createElement("span");
      moveEl.className = "rank-move " + (mv > 0 ? "up" : "down");
      moveEl.textContent = (mv > 0 ? "▲" : "▼") + Math.abs(mv);
      moveEl.title = mv > 0 ? `Subiu ${mv} posição(ões)` : `Caiu ${Math.abs(mv)} posição(ões)`;
      posTd.appendChild(moveEl);
    }

    const imageTd = document.createElement("td");
    imageTd.className = "image-col band-name-link";
    imageTd.title = "Ver detalhes";
    imageTd.addEventListener("click", () => openBandModal(band));
    imageTd.appendChild(buildBandImage(band));

    const nameTd = document.createElement("td");
    const nameSpan = document.createElement("span");
    nameSpan.textContent = band.name;
    nameSpan.className = "band-name-link";
    nameSpan.title = "Ver detalhes";
    nameSpan.addEventListener("click", () => openBandModal(band));
    nameTd.appendChild(nameSpan);
    nameTd.appendChild(buildBandIcons(band));
    const meta = buildBandMeta(band);
    if (meta) nameTd.appendChild(meta);

    const voteTd = document.createElement("td");
    voteTd.className = "vote-col";
    voteTd.appendChild(buildVoteCell(band));

    const actionsTd = document.createElement("td");
    actionsTd.className = "actions";
    if (isAdmin) {
      const editBtn = document.createElement("button");
      editBtn.className = "icon-btn";
      editBtn.type = "button";
      editBtn.textContent = "editar";
      editBtn.addEventListener("click", () => openEditModal(band));
      actionsTd.appendChild(editBtn);

      const removeBtn = document.createElement("button");
      removeBtn.className = "icon-btn danger";
      removeBtn.type = "button";
      removeBtn.textContent = "remover";
      removeBtn.addEventListener("click", () => removeBand(band.id));
      actionsTd.appendChild(removeBtn);
    }

    tr.append(posTd, imageTd, nameTd, voteTd, actionsTd);
    tbody.appendChild(tr);
  });
  return entries.length;
}

function renderStats() {
  const statsEl = document.getElementById("stats");
  const total = state.bands.length;
  if (total === 0) {
    statsEl.innerHTML = "";
    return;
  }
  const leader = [...state.bands].sort(byRank)[0];
  statsEl.innerHTML = `
    <span><strong>${total}</strong> banda${total === 1 ? "" : "s"} na liga</span>
    <span>Líder geral: <strong>${escapeHtml(leader.name)}</strong></span>
  `;
}

function topVoteToday(direction) {
  const counts = {};
  todayVotes
    .filter((v) => v.direction === direction)
    .forEach((v) => {
      counts[v.bandId] = (counts[v.bandId] || 0) + 1;
    });
  let best = null;
  Object.entries(counts).forEach(([bandId, count]) => {
    if (!best || count > best.count) best = { bandId, count };
  });
  return best;
}

function bandById(id) {
  return state.bands.find((b) => b.id === id);
}

function renderHighlights() {
  const el = document.getElementById("highlights");
  if (state.bands.length === 0) {
    el.innerHTML = "";
    return;
  }

  const cards = [];

  // Baseado no movimento do último fechamento (score vs. semana anterior).
  const delta = (b) => (b.score || 0) - (b.previousScore || 0);
  const riser = [...state.bands].sort((a, b) => delta(b) - delta(a))[0];
  if (riser && delta(riser) > 0) {
    cards.push({ label: "Maior alta na última atualização", name: riser.name, value: `+${delta(riser)}` });
  }

  const faller = [...state.bands].sort((a, b) => delta(a) - delta(b))[0];
  if (faller && delta(faller) < 0) {
    cards.push({ label: "Maior queda na última atualização", name: faller.name, value: `${delta(faller)}` });
  }

  if (cards.length === 0) {
    el.innerHTML = "";
    return;
  }

  el.innerHTML = cards
    .map(
      (c) => `
      <div class="highlight-card">
        <span class="highlight-label">${escapeHtml(c.label)}</span>
        <span class="highlight-name">${escapeHtml(c.name)}</span>
        ${c.value ? `<span class="highlight-value">${escapeHtml(c.value)}</span>` : ""}
      </div>
    `
    )
    .join("");
}

function formatDate(ts) {
  if (!ts || typeof ts.toDate !== "function") return "—";
  return ts.toDate().toLocaleDateString("pt-BR");
}

function renderUpdateDates() {
  document.getElementById("last-update-date").textContent = formatDate(metaState.lastUpdate);
  document.getElementById("next-update-date").textContent = formatDate(metaState.nextUpdate);
}

// Movimento no ranking global: compara a posição atual (score) com a de antes
// do último fechamento (previousScore). +N = subiu N posições.
function computeRankMovement() {
  const curr = [...state.bands].sort(byRank);
  const prev = [...state.bands].sort(
    (a, b) =>
      (b.previousScore || 0) - (a.previousScore || 0) || (b.lastfmListeners || 0) - (a.lastfmListeners || 0)
  );
  const currPos = new Map(curr.map((b, i) => [b.id, i]));
  const prevPos = new Map(prev.map((b, i) => [b.id, i]));
  rankMovement = new Map(
    state.bands.map((b) => [b.id, (prevPos.get(b.id) || 0) - (currPos.get(b.id) || 0)])
  );
}

function render() {
  const tiers = getTiers();
  const filtering = isFiltering();
  computeRankMovement();
  refreshGenreOptions();
  SERIES_CONFIG.forEach((cfg, idx) => {
    const zoneConfig = { g4: idx > 0, z4: idx < SERIES_CONFIG.length - 1 };
    const matched = renderTable(`tbody-${cfg.key}`, tiers[cfg.key], zoneConfig);
    const section = document.getElementById(`tier-${cfg.key}`);
    // Filtrando: esconde séries sem resultado; as com resultado ficam expandidas.
    section.style.display = filtering && matched === 0 ? "none" : "";
    section.classList.toggle("collapsed", collapsedSeries.has(cfg.key) && !filtering);
  });
  renderStats();
  renderHighlights();
  renderUpdateDates();
  renderVotesPanel();
  renderCarousel();
}

// Carrossel estético no topo: fotos das bandas rolando em loop infinito.
let carouselCount = -1;
function renderCarousel() {
  const track = document.getElementById("carousel-track");
  if (!track) return;
  const imgs = state.bands.filter((b) => b.image).map((b) => b.image);
  // Só reconstrói quando muda a quantidade — evita reiniciar a animação a cada voto.
  if (imgs.length === carouselCount) return;
  carouselCount = imgs.length;
  if (!imgs.length) {
    track.innerHTML = "";
    return;
  }
  const make = (src) =>
    `<img class="carousel-img" src="${escapeHtml(src)}" alt="" loading="lazy">`;
  // duplica a sequência pra o loop ser contínuo (a animação vai até -50%)
  track.innerHTML = imgs.map(make).join("") + imgs.map(make).join("");
  // velocidade constante independente da quantidade de bandas
  track.style.animationDuration = Math.max(20, imgs.length * 1.4) + "s";
}

// Painel admin: resumo do dia + votos por banda (pendentes da semana e de hoje).
function renderVotesPanel() {
  if (!isAdmin) return;
  const body = document.getElementById("votes-panel-body");
  const summary = document.getElementById("votes-summary");
  if (!body || !summary) return;

  const todayByBand = {};
  const voters = new Set();
  todayVotes.forEach((v) => {
    todayByBand[v.bandId] = (todayByBand[v.bandId] || 0) + 1;
    voters.add(v.uid);
  });

  const rows = state.bands
    .map((b) => ({ band: b, up: b.pendingUp || 0, down: b.pendingDown || 0, today: todayByBand[b.id] || 0 }))
    .filter((r) => r.up || r.down || r.today)
    .sort((a, b) => b.up + b.down - (a.up + a.down) || b.today - a.today);

  const totalPending = rows.reduce((s, r) => s + r.up + r.down, 0);
  summary.innerHTML =
    `<span><strong>${todayVotes.length}</strong> voto(s) hoje</span>` +
    `<span><strong>${voters.size}</strong> votante(s) hoje</span>` +
    `<span><strong>${totalPending}</strong> voto(s) pendentes na semana</span>`;

  if (!rows.length) {
    body.innerHTML = `<tr class="empty-row"><td colspan="5">Nenhum voto ainda</td></tr>`;
    return;
  }
  body.innerHTML = rows
    .map((r) => {
      const net = r.up - r.down;
      const netCls = net > 0 ? "vp-pos" : net < 0 ? "vp-neg" : "";
      return `<tr>
        <td>${escapeHtml(r.band.name)}</td>
        <td class="vp-pos">${r.up || ""}</td>
        <td class="vp-neg">${r.down || ""}</td>
        <td class="${netCls}">${net > 0 ? "+" + net : net || ""}</td>
        <td>${r.today || ""}</td>
      </tr>`;
    })
    .join("");
}

function reportWriteError(err) {
  alert("Erro ao salvar no banco: " + err.message);
}

function addOrUpdateBand(name, links) {
  if (!isAdmin) return;
  const trimmed = name.trim();
  const data = {
    image: (links && links.image) || "",
    spotify: (links && links.spotify) || "",
    youtube: (links && links.youtube) || "",
    instagram: (links && links.instagram) || "",
  };
  // Extras opcionais vindos do Auto-preencher (gênero, link/dados do Last.fm, bio).
  ["genres", "lastfm", "lastfmListeners", "lastfmPlaycount", "bio"].forEach((k) => {
    if (links && links[k] !== undefined && links[k] !== null) data[k] = links[k];
  });
  const existing = state.bands.find(
    (b) => b.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (existing) {
    db.collection("bands").doc(existing.id).update(data).then(rebuildBoard).catch(reportWriteError);
  } else {
    db.collection("bands")
      .add({ name: trimmed, score: 0, previousScore: 0, pendingUp: 0, pendingDown: 0, ...data })
      .then(rebuildBoard)
      .catch(reportWriteError);
  }
}

// Resolve a credencial digitada pelo admin em um access token do Spotify.
// Aceita ou um access token direto, ou "ClientID:Secret" (busca o token na hora).
// A credencial fica só nesta variável de memória — nunca vai pro código nem pro banco.
async function resolveSpotifyToken(input) {
  const value = input.trim();
  if (!value.includes(":")) return value; // já é um access token
  const [id, secret] = value.split(":");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${id.trim()}:${secret.trim()}`),
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Falha ao obter token (${res.status})`);
  return (await res.json()).access_token;
}

async function spotifyArtist(name, token) {
  const url =
    "https://api.spotify.com/v1/search?type=artist&limit=1&q=" + encodeURIComponent(name);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Busca falhou (${res.status})`);
  const artist = (await res.json())?.artists?.items?.[0];
  if (!artist) return null;
  // followers/genres/popularity foram descontinuados pela API do Spotify — só sobra foto, link e nome.
  return {
    name: artist.name || "",
    spotify: artist.external_urls?.spotify || "",
    image: artist.images?.[0]?.url || "",
  };
}

// Last.fm: tags de gênero + listeners/playcount (o que o Spotify não dá mais).
async function lastfmInfo(name, apiKey) {
  const url =
    "https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&autocorrect=1&format=json" +
    "&api_key=" + encodeURIComponent(apiKey) +
    "&artist=" + encodeURIComponent(name);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Last.fm falhou (${res.status})`);
  const json = await res.json();
  if (json.error) throw new Error(`Last.fm: ${json.message || json.error}`);
  const a = json.artist;
  if (!a) return null;
  const tags = (a.tags?.tag || []).map((t) => t.name).filter(Boolean);
  // bio.summary vem com HTML e um "Read more on Last.fm" no fim — limpa ambos.
  let bio = (a.bio?.summary || "")
    .replace(/<a[^>]*>.*?<\/a>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (bio.length > 600) bio = bio.slice(0, 600).trim() + "…";
  return {
    genres: tags.slice(0, 3),
    lastfmListeners: Number(a.stats?.listeners) || null,
    lastfmPlaycount: Number(a.stats?.playcount) || null,
    lastfm: a.url || "",
    bio,
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Percorre as bandas, chama perBand(band, data) pra montar o que atualizar, e salva.
// perBand deve retornar true se conseguiu dados daquela fonte.
async function runBandUpdate(btnId, targets, perBand) {
  const btn = document.getElementById(btnId);
  const original = btn.textContent;
  btn.disabled = true;
  const bandsRef = db.collection("bands");
  let done = 0;
  let withData = 0;
  for (const b of targets) {
    const data = {};
    const got = await perBand(b, data);
    if (got) withData++;
    if (Object.keys(data).length) {
      try {
        await bandsRef.doc(b.id).update(data);
        done++;
      } catch (err) {
        reportWriteError(err);
      }
    }
    btn.textContent = `Atualizando ${done}/${targets.length}...`;
  }
  btn.textContent = original;
  btn.disabled = false;
  if (done) await rebuildBoard(); // atualiza o espelho após atualizações em massa
  return { done, withData };
}

async function updateSpotify() {
  if (!isAdmin || !state.bands.length) return;

  let token = null;
  if (credSpotifyInput()) {
    try {
      token = await ensureSpotifyToken();
    } catch (err) {
      alert(
        "Não consegui autenticar no Spotify: " + err.message +
          "\n\nSe for erro de CORS, gere o access token fora e cole no campo de credencial."
      );
      return;
    }
  } else if (!confirm("Sem credencial do Spotify no painel — só vou preencher links de busca (sem foto). Continuar?")) {
    return;
  }

  const targets = token
    ? state.bands
    : state.bands.filter((b) => !b.spotify || !b.youtube);
  if (!targets.length) {
    alert("Nada pra atualizar: todas já têm Spotify e YouTube.");
    return;
  }

  const { done, withData } = await runBandUpdate("update-spotify-btn", targets, async (b, data) => {
    const q = encodeURIComponent(b.name);
    if (!b.spotify) data.spotify = `https://open.spotify.com/search/${q}`;
    if (!b.youtube) data.youtube = `https://www.youtube.com/results?search_query=${q}`;
    let got = false;
    if (token) {
      try {
        const hit = await spotifyArtist(b.name, token);
        if (hit) {
          if (hit.name && hit.name !== b.name) data.name = hit.name; // nome oficial do Spotify
          if (hit.spotify) data.spotify = hit.spotify; // link oficial > busca
          if (!b.image && hit.image) data.image = hit.image; // respeita foto manual
          got = true;
        }
      } catch (err) {
        console.warn(`Spotify falhou para "${b.name}":`, err.message);
      }
      await sleep(120);
    }
    return got;
  });
  alert(`${done} banda(s) atualizada(s)` + (token ? `, ${withData} com dados do Spotify.` : "."));
}

async function updateLastfm() {
  if (!isAdmin || !state.bands.length) return;
  const lfmKey = credLastfmInput();
  if (!lfmKey) {
    alert("Preencha a API key do Last.fm no painel (Credenciais de busca).");
    return;
  }

  const { done, withData } = await runBandUpdate("update-lastfm-btn", state.bands, async (b, data) => {
    let got = false;
    try {
      const info = await lastfmInfo(b.name, lfmKey);
      if (info) {
        if (info.genres.length) data.genres = info.genres;
        data.lastfmListeners = info.lastfmListeners;
        data.lastfmPlaycount = info.lastfmPlaycount;
        if (info.lastfm) data.lastfm = info.lastfm;
        if (info.bio) data.bio = info.bio;
        got = true;
      }
    } catch (err) {
      console.warn(`Last.fm falhou para "${b.name}":`, err.message);
    }
    await sleep(120);
    return got;
  });
  alert(`${done} banda(s) atualizada(s), ${withData} com dados do Last.fm.`);
}

function updateBand(id, data) {
  if (!isAdmin) return;
  db.collection("bands").doc(id).update(data).then(rebuildBoard).catch(reportWriteError);
}

function removeBand(id) {
  if (!isAdmin) return;
  const band = state.bands.find((b) => b.id === id);
  if (!band) return;
  if (!confirm(`Remover "${band.name}" da liga?`)) return;
  db.collection("bands").doc(id).delete().then(rebuildBoard).catch(reportWriteError);
}

async function handleVoteClick(band, direction, upBtn, downBtn) {
  upBtn.disabled = true;
  downBtn.disabled = true;
  const isRemoving = myVotes.get(band.id) === direction;
  try {
    if (isRemoving) {
      await removeMyVote(band);
      myVotes.delete(band.id);
      track("unvote", { direction, band_name: band.name });
    } else {
      await castVote(band, direction);
      myVotes.set(band.id, direction);
      track("vote", { direction, band_name: band.name });
    }
    render();
  } catch (err) {
    if (err.message === "daily-limit") {
      track("vote_limit_reached");
      alert("Você atingiu o limite de votos por hoje. Volte amanhã!");
    } else {
      alert("Erro ao votar: " + err.message);
    }
    render();
  }
}

async function removeMyVote(band) {
  const uid = auth.currentUser && auth.currentUser.uid;
  if (!uid) throw new Error("not-signed-in");
  const bandRef = db.collection("bands").doc(band.id);
  const voteRef = bandRef.collection("votes").doc(uid);
  await db.runTransaction(async (tx) => {
    const voteSnap = await tx.get(voteRef);
    if (!voteSnap.exists) return;
    const dir = voteSnap.data().direction;
    tx.delete(voteRef);
    const bandUpdate = {};
    // Devolve o voto ao contador pendente (não mexe no limite diário de propósito).
    if (dir === "up") bandUpdate.pendingUp = firebase.firestore.FieldValue.increment(-1);
    if (dir === "down") bandUpdate.pendingDown = firebase.firestore.FieldValue.increment(-1);
    tx.update(bandRef, bandUpdate);
  });
}

async function castVote(band, direction) {
  const uid = auth.currentUser && auth.currentUser.uid;
  if (!uid) throw new Error("not-signed-in");

  const bandRef = db.collection("bands").doc(band.id);
  const voteRef = bandRef.collection("votes").doc(uid);
  const voterRef = db.collection("voters").doc(uid);

  await db.runTransaction(async (tx) => {
    const [voteSnap, voterSnap] = await Promise.all([tx.get(voteRef), tx.get(voterRef)]);
    const previousDirection = voteSnap.exists ? voteSnap.data().direction : null;
    if (previousDirection === direction) return;

    const now = firebase.firestore.Timestamp.now(); // só p/ comparar expiração localmente
    const serverNow = firebase.firestore.FieldValue.serverTimestamp(); // gravado no banco
    const dayMs = 24 * 60 * 60 * 1000;

    if (!previousDirection) {
      if (!voterSnap.exists) {
        tx.set(voterRef, { dailyCount: 1, windowStart: serverNow });
      } else {
        const voter = voterSnap.data();
        const expired = now.toMillis() >= voter.windowStart.toMillis() + dayMs;
        if (expired) {
          tx.update(voterRef, { dailyCount: 1, windowStart: serverNow });
        } else {
          if (voter.dailyCount + 1 > DAILY_VOTE_LIMIT) throw new Error("daily-limit");
          tx.update(voterRef, { dailyCount: voter.dailyCount + 1, windowStart: voter.windowStart });
        }
      }
    }

    if (previousDirection) {
      tx.update(voteRef, { direction, updatedAt: serverNow });
    } else {
      tx.set(voteRef, { uid, bandId: band.id, direction, createdAt: serverNow });
    }

    const bandUpdate = {};
    if (previousDirection === "up") bandUpdate.pendingUp = firebase.firestore.FieldValue.increment(-1);
    if (previousDirection === "down") bandUpdate.pendingDown = firebase.firestore.FieldValue.increment(-1);
    if (direction === "up") bandUpdate.pendingUp = firebase.firestore.FieldValue.increment(1);
    if (direction === "down") bandUpdate.pendingDown = firebase.firestore.FieldValue.increment(1);
    tx.update(bandRef, bandUpdate);
  });
}

async function loadMyVotes(uid) {
  try {
    const snap = await db.collectionGroup("votes").where("uid", "==", uid).get();
    myVotes = new Map(snap.docs.map((d) => [d.data().bandId, d.data().direction]));
    render();
  } catch (err) {
    console.error("Erro ao carregar meus votos:", err);
  }
}

async function refreshTodayVotes() {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const ts = firebase.firestore.Timestamp.fromDate(startOfToday);
    const snap = await db.collectionGroup("votes").where("createdAt", ">=", ts).get();
    todayVotes = snap.docs.map((d) => d.data());
    renderHighlights();
    renderVotesPanel();
  } catch (err) {
    console.error("Erro ao carregar votos de hoje:", err);
  }
}

// Pontos que cada voto líquido (↑−↓) vale no ranking, aplicados ao fechar a semana.
const VOTE_WEIGHT = 2;

async function closeWeek() {
  if (!isAdmin) return;
  if (!confirm("Aplicar os votos acumulados da semana e atualizar o ranking oficial?")) return;
  const btn = document.getElementById("close-week-btn");
  btn.disabled = true;
  try {
    const now = firebase.firestore.Timestamp.now();
    // Calcula os novos scores e as posições finais pra guardar no histórico.
    const scored = state.bands.map((band) => ({
      band,
      newScore: (band.score || 0) + VOTE_WEIGHT * ((band.pendingUp || 0) - (band.pendingDown || 0)),
    }));
    scored.sort((a, b) => b.newScore - a.newScore || (b.band.lastfmListeners || 0) - (a.band.lastfmListeners || 0));
    const posMap = new Map(scored.map((x, i) => [x.band.id, i + 1]));

    // Firestore limita 500 escritas por batch; a liga tem bem menos bandas que isso.
    const batch = db.batch();
    scored.forEach(({ band, newScore }) => {
      const ref = db.collection("bands").doc(band.id);
      // histórico de posições (capado nas últimas 30 semanas)
      const history = [...(band.history || []), { t: now, pos: posMap.get(band.id), score: newScore }].slice(-30);
      batch.update(ref, {
        previousScore: band.score || 0,
        score: newScore,
        pendingUp: 0,
        pendingDown: 0,
        history,
      });
    });
    const next = firebase.firestore.Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000);
    batch.update(db.collection("meta").doc("ranking"), { lastUpdate: now, nextUpdate: next });
    await batch.commit();

    // Opção A (rodada semanal): apaga todos os votos individuais pra a próxima semana
    // começar do zero — todo mundo pode votar de novo.
    const votesSnap = await db.collectionGroup("votes").get();
    for (let i = 0; i < votesSnap.docs.length; i += 400) {
      const delBatch = db.batch();
      votesSnap.docs.slice(i, i + 400).forEach((d) => delBatch.delete(d.ref));
      await delBatch.commit();
    }
    myVotes = new Map();
    render();
    await rebuildBoard(); // atualiza o espelho lido pelos visitantes

    alert(`Semana fechada! Ranking atualizado e ${votesSnap.size} voto(s) zerado(s).`);
  } catch (err) {
    alert("Erro ao fechar semana: " + err.message);
  } finally {
    btn.disabled = false;
  }
}

// Campos que a tela precisa, condensados no documento agregado meta/board.
// Visitante comum lê 1 doc (o board) em vez das 171 bandas → ~170× menos leituras.
function boardPayload(bands) {
  return {
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    bands: bands.map((b) => ({
      id: b.id,
      name: b.name || "",
      score: b.score || 0,
      previousScore: b.previousScore || 0,
      lastfmListeners: b.lastfmListeners || 0,
      image: b.image || "",
      spotify: b.spotify || "",
      youtube: b.youtube || "",
      instagram: b.instagram || "",
      genres: b.genres || [],
      lastfm: b.lastfm || "",
      // bio e history NÃO entram no board (pesam) — a ficha os busca sob demanda.
    })),
  };
}

// Reconstrói o board a partir da coleção (só admin; usado após editar/fechar).
async function rebuildBoard() {
  if (!isAdmin) return;
  try {
    // Admin lê a coleção em tempo real (useCollection), então state.bands já está
    // atualizado — reconstrói a partir da memória, sem uma nova leitura da coleção.
    if (!state.bands.length) return;
    await db.collection("meta").doc("board").set(boardPayload(state.bands));
  } catch (e) {
    console.error("Erro ao reconstruir board:", e);
  }
}

function hideAppLoader() {
  const el = document.getElementById("app-loader");
  if (el) el.classList.add("hidden");
}
function showLoaderError() {
  const el = document.getElementById("app-loader");
  if (el && !state.bands.length) {
    el.innerHTML =
      '<span>Não foi possível carregar o ranking agora. Tente novamente em instantes.</span>';
  }
}

// Troca de fonte de dados: visitante lê o board (barato); admin lê a coleção (tem pending).
let unsubData = null;
let dataMode = null;
let todayVotesTimer = null;

function useBoard() {
  if (dataMode === "board") return;
  if (unsubData) unsubData();
  dataMode = "board";
  unsubData = db
    .collection("meta")
    .doc("board")
    .onSnapshot(
      (snap) => {
        const d = snap.data();
        if (!d || !d.bands) {
          // Board ainda não criado: fallback único pra não deixar a tela vazia.
          db.collection("bands")
            .get()
            .then((s) => {
              state.bands = s.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
              render();
              hideAppLoader();
              checkDeepLink();
            })
            .catch((err) => {
              console.error("Fallback bands falhou:", err);
              showLoaderError();
            });
          return;
        }
        state.bands = d.bands;
        render();
        hideAppLoader();
        checkDeepLink();
      },
      (err) => {
        console.error("Erro no board:", err);
        showLoaderError();
      }
    );
}

function useCollection() {
  if (dataMode === "collection") return;
  if (unsubData) unsubData();
  dataMode = "collection";
  unsubData = db.collection("bands").onSnapshot(
    (snapshot) => {
      state.bands = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      render();
      hideAppLoader();
      // "Votos de hoje" é usado só no painel de admin — debounce pra não reler a cada voto.
      clearTimeout(todayVotesTimer);
      todayVotesTimer = setTimeout(refreshTodayVotes, 3000);
      checkDeepLink();
    },
    (err) => {
      console.error("Erro ao carregar bandas:", err);
      showLoaderError();
    }
  );
}

function subscribeToMeta() {
  let lastKnownClose = null;
  db.collection("meta")
    .doc("ranking")
    .onSnapshot(
      (snap) => {
        metaState = snap.data() || {};
        renderUpdateDates();
        // Quando a semana fecha (lastUpdate muda), os votos foram apagados no banco.
        // Recarrega os "meus votos" pra limpar os botões sozinho, sem precisar dar F5.
        const closeMs = metaState.lastUpdate && metaState.lastUpdate.toMillis();
        if (lastKnownClose !== null && closeMs && closeMs !== lastKnownClose) {
          const uid = auth.currentUser && auth.currentUser.uid;
          if (uid) loadMyVotes(uid);
        }
        lastKnownClose = closeMs || lastKnownClose;
      },
      (err) => {
        console.error("Erro ao carregar datas de atualização:", err);
      }
    );
}

function wireControls() {
  document.getElementById("band-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("band-name");
    const imageInput = document.getElementById("band-image");
    const spotifyInput = document.getElementById("band-spotify");
    const youtubeInput = document.getElementById("band-youtube");
    const instagramInput = document.getElementById("band-instagram");
    const name = nameInput.value;
    if (!name.trim()) return;
    const links = {
      image: imageInput.value.trim(),
      spotify: spotifyInput.value.trim(),
      youtube: youtubeInput.value.trim(),
      instagram: normalizeInstagram(instagramInput.value),
    };
    // Junta o gênero/bio buscados no Auto-preencher, se for a mesma banda.
    if (pendingExtras && pendingExtras.forName === name.trim().toLowerCase()) {
      Object.assign(links, pendingExtras);
      delete links.forName;
    }
    pendingExtras = null;
    addOrUpdateBand(name, links);
    nameInput.value = "";
    imageInput.value = "";
    spotifyInput.value = "";
    youtubeInput.value = "";
    instagramInput.value = "";
    nameInput.focus();
  });

  document.getElementById("autofill-btn").addEventListener("click", async () => {
    const nameEl = document.getElementById("band-name");
    const name = nameEl.value.trim();
    if (!name) {
      nameEl.focus();
      return;
    }
    const btn = document.getElementById("autofill-btn");
    const original = btn.textContent;
    const q = encodeURIComponent(name);
    const imageInput = document.getElementById("band-image");
    const spotifyInput = document.getElementById("band-spotify");
    const youtubeInput = document.getElementById("band-youtube");

    btn.disabled = true;
    btn.textContent = "Buscando...";
    pendingExtras = { forName: name.toLowerCase() };

    let token = null;
    try {
      token = await ensureSpotifyToken();
    } catch (err) {
      alert("Spotify: " + err.message);
    }
    if (token) {
      try {
        const hit = await spotifyArtist(name, token);
        if (hit) {
          if (hit.name) {
            nameEl.value = hit.name; // usa o nome oficial do Spotify
            pendingExtras.forName = hit.name.toLowerCase();
          }
          if (hit.spotify) spotifyInput.value = hit.spotify;
          if (hit.image && !imageInput.value.trim()) imageInput.value = hit.image;
        }
      } catch (err) {
        console.warn("Spotify auto-preencher:", err.message);
      }
    }
    const lfmKey = credLastfmInput();
    if (lfmKey) {
      try {
        const info = await lastfmInfo(name, lfmKey);
        if (info) {
          if (info.genres.length) pendingExtras.genres = info.genres;
          if (info.lastfm) pendingExtras.lastfm = info.lastfm;
          pendingExtras.lastfmListeners = info.lastfmListeners;
          pendingExtras.lastfmPlaycount = info.lastfmPlaycount;
          if (info.bio) pendingExtras.bio = info.bio;
        }
      } catch (err) {
        console.warn("Last.fm auto-preencher:", err.message);
      }
    }

    // Fallback: se não achou link oficial, deixa o de busca pra não ficar vazio.
    if (!spotifyInput.value.trim()) spotifyInput.value = `https://open.spotify.com/search/${q}`;
    if (!youtubeInput.value.trim()) youtubeInput.value = `https://www.youtube.com/results?search_query=${q}`;

    btn.disabled = false;
    btn.textContent = original;
  });

  document.getElementById("update-spotify-btn").addEventListener("click", updateSpotify);
  document.getElementById("update-lastfm-btn").addEventListener("click", updateLastfm);

  // Credenciais de busca: carrega do navegador e salva ao digitar (só neste dispositivo).
  ["cred-spotify:credSpotify", "cred-lastfm:credLastfm"].forEach((pair) => {
    const [id, key] = pair.split(":");
    const el = document.getElementById(id);
    if (!el) return;
    el.value = localStorage.getItem(key) || "";
    el.addEventListener("input", () => localStorage.setItem(key, el.value.trim()));
  });

  document.getElementById("export-btn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ bands: state.bands }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `liga-das-bandas-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("import-btn").addEventListener("click", () => {
    document.getElementById("import-file").click();
  });

  document.getElementById("import-file").addEventListener("change", (e) => {
    if (!isAdmin) return;
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!Array.isArray(parsed.bands)) throw new Error("formato inválido");
        if (!confirm(`Importar ${parsed.bands.length} banda(s)? Bandas com o mesmo nome são atualizadas; as demais bandas já cadastradas permanecem.`)) return;
        const bandsRef = db.collection("bands");
        const batch = db.batch();
        parsed.bands.forEach((b) => {
          const name = String(b.name || "").trim();
          if (!name) return;
          const existing = state.bands.find((sb) => sb.name.toLowerCase() === name.toLowerCase());
          const ref = existing ? bandsRef.doc(existing.id) : bandsRef.doc();
          const payload = { name };
          if (!existing) {
            payload.score = Number(b.score) || 0;
            payload.previousScore = payload.score;
            payload.pendingUp = 0;
            payload.pendingDown = 0;
          }
          batch.set(ref, payload, { merge: true });
        });
        await batch.commit();
        await rebuildBoard(); // atualiza o espelho após o import
      } catch (err) {
        alert("Arquivo inválido ou erro ao importar: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  document.getElementById("search-input").addEventListener("input", (e) => {
    filterState.search = e.target.value.trim().toLowerCase();
    render();
  });

  document.getElementById("genre-filter").addEventListener("change", (e) => {
    filterState.genre = e.target.value;
    render();
    if (e.target.value) track("filter_genre", { genre: e.target.value });
  });

  document.getElementById("close-week-btn").addEventListener("click", closeWeek);
}

function usernameToEmail(username) {
  return `${username}@${ADMIN_EMAIL_DOMAIN}`;
}

function setAdminUI(loggedIn, label) {
  const toggleBtn = document.getElementById("admin-toggle-btn");
  document.getElementById("add-band-panel").classList.toggle("hidden", !loggedIn);
  document.getElementById("backup-panel").classList.toggle("hidden", !loggedIn);
  document.getElementById("close-week-panel").classList.toggle("hidden", !loggedIn);
  if (loggedIn) {
    toggleBtn.textContent = `Sair (${label})`;
    toggleBtn.classList.add("is-logged-in");
  } else {
    toggleBtn.textContent = "Admin";
    toggleBtn.classList.remove("is-logged-in");
  }
}

function normalizeInstagram(value) {
  return value
    .trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/\/$/, "");
}

function openLoginModal() {
  document.getElementById("login-modal").classList.remove("hidden");
  document.getElementById("login-error").classList.add("hidden");
  document.getElementById("login-user").focus();
}

function closeLoginModal() {
  document.getElementById("login-modal").classList.add("hidden");
  document.getElementById("login-form").reset();
  document.getElementById("login-error").classList.add("hidden");
}

let editingBandId = null;

function openEditModal(band) {
  editingBandId = band.id;
  document.getElementById("edit-name").value = band.name || "";
  document.getElementById("edit-image").value = band.image || "";
  document.getElementById("edit-spotify").value = band.spotify || "";
  document.getElementById("edit-youtube").value = band.youtube || "";
  document.getElementById("edit-instagram").value = band.instagram || "";
  document.getElementById("edit-error").classList.add("hidden");
  document.getElementById("edit-modal").classList.remove("hidden");
  document.getElementById("edit-name").focus();
}

function closeEditModal() {
  editingBandId = null;
  document.getElementById("edit-modal").classList.add("hidden");
  document.getElementById("edit-form").reset();
  document.getElementById("edit-error").classList.add("hidden");
}

document.getElementById("admin-toggle-btn").addEventListener("click", () => {
  if (isAdmin) {
    auth.signOut();
  } else {
    openLoginModal();
  }
});

document.getElementById("login-cancel-btn").addEventListener("click", closeLoginModal);

document.getElementById("login-modal").addEventListener("click", (e) => {
  if (e.target.id === "login-modal") closeLoginModal();
});

document.getElementById("edit-cancel-btn").addEventListener("click", closeEditModal);

document.getElementById("edit-modal").addEventListener("click", (e) => {
  if (e.target.id === "edit-modal") closeEditModal();
});

document.getElementById("band-modal-close").addEventListener("click", closeBandModal);
document.getElementById("band-modal").addEventListener("click", (e) => {
  if (e.target.id === "band-modal") closeBandModal();
});

document.getElementById("edit-form").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!editingBandId) return;
  const name = document.getElementById("edit-name").value.trim();
  const errorEl = document.getElementById("edit-error");
  if (!name) return;

  const duplicate = state.bands.find(
    (b) => b.id !== editingBandId && b.name.toLowerCase() === name.toLowerCase()
  );
  if (duplicate) {
    errorEl.classList.remove("hidden");
    return;
  }

  updateBand(editingBandId, {
    name,
    image: document.getElementById("edit-image").value.trim(),
    spotify: document.getElementById("edit-spotify").value.trim(),
    youtube: document.getElementById("edit-youtube").value.trim(),
    instagram: normalizeInstagram(document.getElementById("edit-instagram").value),
  });
  closeEditModal();
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = e.target.querySelector("button[type=submit]");
  const username = document.getElementById("login-user").value.trim().toLowerCase();
  const password = document.getElementById("login-password").value;
  const errorEl = document.getElementById("login-error");
  submitBtn.disabled = true;
  try {
    await auth.signInWithEmailAndPassword(usernameToEmail(username), password);
    closeLoginModal();
  } catch {
    errorEl.classList.remove("hidden");
  } finally {
    submitBtn.disabled = false;
  }
});

auth.onAuthStateChanged((user) => {
  if (!user) {
    auth.signInAnonymously().catch((err) => console.error("Erro no login anônimo:", err));
    return;
  }
  isAdmin = !user.isAnonymous;
  setAdminUI(isAdmin, isAdmin ? user.email.split("@")[0] : "");
  loadMyVotes(user.uid);
  if (isAdmin) {
    useCollection(); // admin lê a coleção (precisa do pending)
    rebuildBoard(); // garante que o board existe/está fresco
    refreshTodayVotes(); // popula o painel de admin
  } else {
    useBoard(); // visitante comum lê só o board (barato)
  }
  render();
});

buildTierSections();
wireControls();
useBoard(); // todo mundo começa lendo o board (1 leitura); admin troca no login
subscribeToMeta();

// PWA: registra o service worker (instalável + offline).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("SW falhou:", err));
  });
}

// Banner de cookies (LGPD) — informativo, dispensável, lembra a escolha.
(function () {
  const banner = document.getElementById("cookie-banner");
  if (!banner) return;
  if (!localStorage.getItem("cookieConsent")) banner.classList.remove("hidden");
  document.getElementById("cookie-accept").addEventListener("click", () => {
    localStorage.setItem("cookieConsent", "1");
    banner.classList.add("hidden");
  });
})();
