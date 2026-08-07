const SERIES_CONFIG = [
  { key: "a", label: "Série A", color: "#14532d" },
  { key: "b", label: "Série B", color: "#1d4ed8" },
  { key: "c", label: "Série C", color: "#7c3aed" },
  { key: "d", label: "Série D", color: "#be185d" },
  { key: "acesso", label: "Divisão de Acesso", color: "#4b5563" },
];

const DAILY_VOTE_LIMIT = 40;

let state = { bands: [] };
let isAdmin = false;
let filterState = { search: "" };
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

function getTiers() {
  const sorted = [...state.bands].sort((a, b) => (b.score || 0) - (a.score || 0));
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
    title.textContent = cfg.label;
    title.style.background = cfg.color;

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
  placeholder.textContent = "🎵";
  return placeholder;
}

function buildBandMeta(band) {
  const parts = [];
  if (Array.isArray(band.genres) && band.genres.length) {
    parts.push(`<span class="band-genre">${band.genres.slice(0, 2).join(" · ")}</span>`);
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
  upBtn.textContent = "⬆";

  const downBtn = document.createElement("button");
  downBtn.type = "button";
  downBtn.className = "vote-btn vote-down";
  downBtn.textContent = "⬇";

  const voted = myVotes.get(band.id);

  if (voted === "up") {
    upBtn.disabled = true;
    upBtn.classList.add("vote-chosen");
    upBtn.title = "Seu voto atual";
    downBtn.title = "Trocar voto pra descer";
    downBtn.addEventListener("click", () => handleVoteClick(band, "down", upBtn, downBtn));
  } else if (voted === "down") {
    downBtn.disabled = true;
    downBtn.classList.add("vote-chosen");
    downBtn.title = "Seu voto atual";
    upBtn.title = "Trocar voto pra subir";
    upBtn.addEventListener("click", () => handleVoteClick(band, "up", upBtn, downBtn));
  } else {
    upBtn.title = "Votar pra subir";
    downBtn.title = "Votar pra descer";
    upBtn.addEventListener("click", () => handleVoteClick(band, "up", upBtn, downBtn));
    downBtn.addEventListener("click", () => handleVoteClick(band, "down", upBtn, downBtn));
  }

  wrap.append(upBtn, downBtn);
  return wrap;
}

function passesFilter(band) {
  const matchesSearch =
    !filterState.search || band.name.toLowerCase().includes(filterState.search);
  return matchesSearch;
}

function renderTable(tbodyId, list, zoneConfig) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = "";

  if (list.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    tr.innerHTML = `<td colspan="5">Nenhuma banda nessa série ainda</td>`;
    tbody.appendChild(tr);
    return;
  }

  const entries = list
    .map((band, index) => ({ band, index }))
    .filter((entry) => passesFilter(entry.band));

  if (entries.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    tr.innerHTML = `<td colspan="5">Nenhuma banda encontrada com esse filtro</td>`;
    tbody.appendChild(tr);
    return;
  }

  entries.forEach(({ band, index }) => {
    const tr = document.createElement("tr");
    const zoneClass = zoneClassFor(index, list.length, zoneConfig);
    if (zoneClass) tr.classList.add(zoneClass);

    const posTd = document.createElement("td");
    posTd.className = "pos";
    posTd.textContent = index + 1;

    const imageTd = document.createElement("td");
    imageTd.className = "image-col";
    imageTd.appendChild(buildBandImage(band));

    const nameTd = document.createElement("td");
    const nameSpan = document.createElement("span");
    nameSpan.textContent = band.name;
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
}

function renderStats() {
  const statsEl = document.getElementById("stats");
  const total = state.bands.length;
  if (total === 0) {
    statsEl.innerHTML = "";
    return;
  }
  const leader = [...state.bands].sort((a, b) => (b.score || 0) - (a.score || 0))[0];
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

  const upToday = topVoteToday("up");
  if (upToday) {
    const band = bandById(upToday.bandId);
    if (band) {
      cards.push({
        label: "Mais votada pra subir hoje",
        name: band.name,
      });
    }
  }

  const downToday = topVoteToday("down");
  if (downToday) {
    const band = bandById(downToday.bandId);
    if (band) {
      cards.push({
        label: "Mais votada pra cair hoje",
        name: band.name,
      });
    }
  }

  const weekly = [...state.bands].sort(
    (a, b) => (b.pendingUp || 0) + (b.pendingDown || 0) - ((a.pendingUp || 0) + (a.pendingDown || 0))
  )[0];
  if (weekly && (weekly.pendingUp || weekly.pendingDown)) {
    cards.push({
      label: "Mais votos na semana",
      name: weekly.name,
    });
  }

  const riser = [...state.bands].sort(
    (a, b) => (b.score || 0) - (b.previousScore || 0) - ((a.score || 0) - (a.previousScore || 0))
  )[0];
  if (riser && (riser.score || 0) - (riser.previousScore || 0) > 0) {
    cards.push({
      label: "Maior alta na última atualização",
      name: riser.name,
      value: `+${(riser.score || 0) - (riser.previousScore || 0)}`,
    });
  }

  const faller = [...state.bands].sort(
    (a, b) => (a.score || 0) - (a.previousScore || 0) - ((b.score || 0) - (b.previousScore || 0))
  )[0];
  if (faller && (faller.score || 0) - (faller.previousScore || 0) < 0) {
    cards.push({
      label: "Maior queda na última atualização",
      name: faller.name,
      value: `${(faller.score || 0) - (faller.previousScore || 0)}`,
    });
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

function render() {
  const tiers = getTiers();
  SERIES_CONFIG.forEach((cfg, idx) => {
    const zoneConfig = { g4: idx > 0, z4: idx < SERIES_CONFIG.length - 1 };
    renderTable(`tbody-${cfg.key}`, tiers[cfg.key], zoneConfig);
  });
  renderStats();
  renderHighlights();
  renderUpdateDates();
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
  const existing = state.bands.find(
    (b) => b.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (existing) {
    db.collection("bands").doc(existing.id).update(data).catch(reportWriteError);
  } else {
    db.collection("bands")
      .add({ name: trimmed, score: 0, previousScore: 0, pendingUp: 0, pendingDown: 0, ...data })
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
  // followers/genres/popularity foram descontinuados pela API do Spotify — só sobra foto e link.
  return {
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
  return {
    genres: tags.slice(0, 3),
    lastfmListeners: Number(a.stats?.listeners) || null,
    lastfmPlaycount: Number(a.stats?.playcount) || null,
    lastfm: a.url || "",
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
  return { done, withData };
}

async function updateSpotify() {
  if (!isAdmin || !state.bands.length) return;
  const cred = prompt(
    "SPOTIFY — foto + link oficial\n\n" +
      "Cole access token OU ClientID:Secret.\n" +
      "Em branco = só preenche links de busca faltando (sem foto)."
  );
  if (cred === null) return;

  let token = null;
  if (cred.trim()) {
    try {
      token = await resolveSpotifyToken(cred);
    } catch (err) {
      alert(
        "Não consegui autenticar no Spotify: " + err.message +
          "\n\nSe for erro de CORS, gere o access token fora e cole ele direto."
      );
      return;
    }
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
  const key = prompt("LAST.FM — gênero + ouvintes + link\n\nCole sua API key do Last.fm.");
  if (key === null) return;
  const lfmKey = key.trim();
  if (!lfmKey) {
    alert("Sem API key do Last.fm, nada a atualizar.");
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
  db.collection("bands").doc(id).update(data).catch(reportWriteError);
}

function removeBand(id) {
  if (!isAdmin) return;
  const band = state.bands.find((b) => b.id === id);
  if (!band) return;
  if (!confirm(`Remover "${band.name}" da liga?`)) return;
  db.collection("bands").doc(id).delete().catch(reportWriteError);
}

async function handleVoteClick(band, direction, upBtn, downBtn) {
  upBtn.disabled = true;
  downBtn.disabled = true;
  try {
    await castVote(band, direction);
    myVotes.set(band.id, direction);
    render();
  } catch (err) {
    if (err.message === "daily-limit") {
      alert("Você atingiu o limite de votos por hoje. Volte amanhã!");
    } else {
      alert("Erro ao votar: " + err.message);
    }
    render();
  }
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

    const now = firebase.firestore.Timestamp.now();
    const dayMs = 24 * 60 * 60 * 1000;

    if (!previousDirection) {
      if (!voterSnap.exists) {
        tx.set(voterRef, { dailyCount: 1, windowStart: now });
      } else {
        const voter = voterSnap.data();
        const expired = now.toMillis() >= voter.windowStart.toMillis() + dayMs;
        if (expired) {
          tx.update(voterRef, { dailyCount: 1, windowStart: now });
        } else {
          if (voter.dailyCount + 1 > DAILY_VOTE_LIMIT) throw new Error("daily-limit");
          tx.update(voterRef, { dailyCount: voter.dailyCount + 1, windowStart: voter.windowStart });
        }
      }
    }

    if (previousDirection) {
      tx.update(voteRef, { direction, updatedAt: now });
    } else {
      tx.set(voteRef, { uid, bandId: band.id, direction, createdAt: now });
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
  } catch (err) {
    console.error("Erro ao carregar votos de hoje:", err);
  }
}

// Pontos que cada voto líquido vale sobre o seed de popularidade (0–100).
// V=2 → ~50 votos líquidos varrem a faixa inteira; virar rival próximo custa bem menos.
const VOTE_WEIGHT = 2;

async function seedRankingFromListeners() {
  if (!isAdmin) return;
  const nums = state.bands
    .map((b) => (typeof b.listeners === "number" ? b.listeners : null))
    .filter((n) => n && n > 0);
  if (!nums.length) {
    alert("Nenhuma banda tem ouvintes (listeners) pra semear.");
    return;
  }
  // Escala logarítmica pra 0–100 (a distribuição vai de dezenas a dezenas de milhares).
  const logs = nums.map((n) => Math.log(n));
  const minLog = Math.min(...logs);
  const span = Math.max(...logs) - minLog || 1;
  if (
    !confirm(
      `Definir a pontuação de largada de ${state.bands.length} banda(s) pela popularidade (0–100)?\n\n` +
        "Isso SOBRESCREVE os scores atuais e zera os votos pendentes."
    )
  )
    return;
  const btn = document.getElementById("seed-ranking-btn");
  btn.disabled = true;
  try {
    const batch = db.batch();
    state.bands.forEach((band) => {
      const l = typeof band.listeners === "number" && band.listeners > 0 ? band.listeners : null;
      const seed = l ? Math.round((100 * (Math.log(l) - minLog)) / span) : 0;
      batch.update(db.collection("bands").doc(band.id), {
        score: seed,
        previousScore: seed,
        pendingUp: 0,
        pendingDown: 0,
      });
    });
    await batch.commit();
    alert("Ranking semeado pela popularidade. Agora os votos movem a partir daí.");
  } catch (err) {
    alert("Erro ao semear ranking: " + err.message);
  } finally {
    btn.disabled = false;
  }
}

async function closeWeek() {
  if (!isAdmin) return;
  if (!confirm("Aplicar os votos acumulados da semana e atualizar o ranking oficial?")) return;
  const btn = document.getElementById("close-week-btn");
  btn.disabled = true;
  try {
    // Firestore limita 500 escritas por batch; a liga tem bem menos bandas que isso.
    const batch = db.batch();
    state.bands.forEach((band) => {
      const delta = VOTE_WEIGHT * ((band.pendingUp || 0) - (band.pendingDown || 0));
      const ref = db.collection("bands").doc(band.id);
      batch.update(ref, {
        previousScore: band.score || 0,
        score: (band.score || 0) + delta,
        pendingUp: 0,
        pendingDown: 0,
      });
    });
    const now = firebase.firestore.Timestamp.now();
    const next = firebase.firestore.Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000);
    batch.update(db.collection("meta").doc("ranking"), { lastUpdate: now, nextUpdate: next });
    await batch.commit();
    alert("Semana fechada! Ranking atualizado.");
  } catch (err) {
    alert("Erro ao fechar semana: " + err.message);
  } finally {
    btn.disabled = false;
  }
}

function subscribeToBands() {
  db.collection("bands").onSnapshot(
    (snapshot) => {
      state.bands = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      render();
      refreshTodayVotes();
    },
    (err) => {
      console.error("Erro ao carregar bandas:", err);
    }
  );
}

function subscribeToMeta() {
  db.collection("meta")
    .doc("ranking")
    .onSnapshot(
      (snap) => {
        metaState = snap.data() || {};
        renderUpdateDates();
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
    addOrUpdateBand(name, {
      image: imageInput.value.trim(),
      spotify: spotifyInput.value.trim(),
      youtube: youtubeInput.value.trim(),
      instagram: normalizeInstagram(instagramInput.value),
    });
    nameInput.value = "";
    imageInput.value = "";
    spotifyInput.value = "";
    youtubeInput.value = "";
    instagramInput.value = "";
    nameInput.focus();
  });

  document.getElementById("autofill-btn").addEventListener("click", () => {
    const name = document.getElementById("band-name").value.trim();
    if (!name) {
      document.getElementById("band-name").focus();
      return;
    }
    const q = encodeURIComponent(name);
    const spotifyInput = document.getElementById("band-spotify");
    const youtubeInput = document.getElementById("band-youtube");
    // Gambiarra sem backend: monta links de busca a partir do nome.
    // Só preenche campos vazios pra não sobrescrever o que já foi digitado à mão.
    if (!spotifyInput.value.trim()) spotifyInput.value = `https://open.spotify.com/search/${q}`;
    if (!youtubeInput.value.trim()) youtubeInput.value = `https://www.youtube.com/results?search_query=${q}`;
    // Foto e link exato do artista precisam da Spotify API (rode enrich-bands.js para import em massa).
  });

  document.getElementById("update-spotify-btn").addEventListener("click", updateSpotify);
  document.getElementById("update-lastfm-btn").addEventListener("click", updateLastfm);

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

  document.getElementById("close-week-btn").addEventListener("click", closeWeek);
  document.getElementById("seed-ranking-btn").addEventListener("click", seedRankingFromListeners);
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
    toggleBtn.textContent = `🔓 Sair (${label})`;
    toggleBtn.classList.add("is-logged-in");
  } else {
    toggleBtn.textContent = "🔒 Admin";
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
  render();
});

buildTierSections();
wireControls();
subscribeToBands();
subscribeToMeta();
