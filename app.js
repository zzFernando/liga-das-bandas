const SERIE_A_SIZE = 10;
const SERIE_B_SIZE = 10;

let state = { bands: [] };
let isAdmin = false;

function formatNumber(n) {
  return n.toLocaleString("pt-BR");
}

function getTiers() {
  const sorted = [...state.bands].sort((a, b) => b.listeners - a.listeners);
  return {
    a: sorted.slice(0, SERIE_A_SIZE),
    b: sorted.slice(SERIE_A_SIZE, SERIE_A_SIZE + SERIE_B_SIZE),
    c: sorted.slice(SERIE_A_SIZE + SERIE_B_SIZE),
  };
}

function zoneClassFor(index, length, { g4, z4 }) {
  if (length <= 4) return "";
  if (g4 && index < 4) return "g4";
  if (z4 && index >= Math.max(4, length - 4)) return "z4";
  return "";
}

function renderTable(tbodyId, list, zoneConfig) {
  const tbody = document.getElementById(tbodyId);
  tbody.innerHTML = "";

  if (list.length === 0) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    tr.innerHTML = `<td colspan="4">Nenhuma banda nessa série ainda</td>`;
    tbody.appendChild(tr);
    return;
  }

  list.forEach((band, index) => {
    const tr = document.createElement("tr");
    const zoneClass = zoneClassFor(index, list.length, zoneConfig);
    if (zoneClass) tr.classList.add(zoneClass);

    const posTd = document.createElement("td");
    posTd.className = "pos";
    posTd.textContent = index + 1;

    const nameTd = document.createElement("td");
    nameTd.textContent = band.name;

    const listenersTd = document.createElement("td");
    listenersTd.className = "listeners";
    listenersTd.textContent = formatNumber(band.listeners);
    if (isAdmin) {
      listenersTd.title = "Clique para editar";
      listenersTd.style.cursor = "pointer";
      listenersTd.addEventListener("click", () => startEditListeners(listenersTd, band));
    }

    const actionsTd = document.createElement("td");
    actionsTd.className = "actions";
    if (isAdmin) {
      const removeBtn = document.createElement("button");
      removeBtn.className = "icon-btn danger";
      removeBtn.type = "button";
      removeBtn.textContent = "remover";
      removeBtn.addEventListener("click", () => removeBand(band.id));
      actionsTd.appendChild(removeBtn);
    }

    tr.append(posTd, nameTd, listenersTd, actionsTd);
    tbody.appendChild(tr);
  });
}

function startEditListeners(cell, band) {
  const input = document.createElement("input");
  input.type = "number";
  input.min = "0";
  input.step = "1";
  input.className = "listeners-input";
  input.value = band.listeners;
  cell.textContent = "";
  cell.appendChild(input);
  input.focus();
  input.select();

  let settled = false;

  const commit = () => {
    if (settled) return;
    settled = true;
    const value = parseInt(input.value, 10);
    if (!Number.isNaN(value) && value >= 0) {
      updateListeners(band.id, value);
    } else {
      render();
    }
  };

  const cancel = () => {
    if (settled) return;
    settled = true;
    render();
  };

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") commit();
    if (e.key === "Escape") cancel();
  });
  input.addEventListener("blur", commit);
}

function renderStats() {
  const statsEl = document.getElementById("stats");
  const total = state.bands.length;
  if (total === 0) {
    statsEl.innerHTML = "";
    return;
  }
  const leader = [...state.bands].sort((a, b) => b.listeners - a.listeners)[0];
  statsEl.innerHTML = `
    <span><strong>${total}</strong> banda${total === 1 ? "" : "s"} na liga</span>
    <span>Líder geral: <strong>${leader.name}</strong> (${formatNumber(leader.listeners)})</span>
  `;
}

function render() {
  const tiers = getTiers();
  renderTable("tbody-a", tiers.a, { g4: false, z4: true });
  renderTable("tbody-b", tiers.b, { g4: true, z4: true });
  renderTable("tbody-c", tiers.c, { g4: true, z4: false });
  renderStats();
}

function reportWriteError(err) {
  alert("Erro ao salvar no banco: " + err.message);
}

function addOrUpdateBand(name, listeners) {
  if (!isAdmin) return;
  const trimmed = name.trim();
  const existing = state.bands.find(
    (b) => b.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (existing) {
    db.collection("bands").doc(existing.id).update({ listeners }).catch(reportWriteError);
  } else {
    db.collection("bands").add({ name: trimmed, listeners }).catch(reportWriteError);
  }
}

function updateListeners(id, listeners) {
  if (!isAdmin) return;
  db.collection("bands").doc(id).update({ listeners }).catch(reportWriteError);
}

function removeBand(id) {
  if (!isAdmin) return;
  const band = state.bands.find((b) => b.id === id);
  if (!band) return;
  if (!confirm(`Remover "${band.name}" da liga?`)) return;
  db.collection("bands").doc(id).delete().catch(reportWriteError);
}

function subscribeToBands() {
  db.collection("bands").onSnapshot(
    (snapshot) => {
      state.bands = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      render();
    },
    (err) => {
      console.error("Erro ao carregar bandas:", err);
    }
  );
}

function wireControls() {
  document.getElementById("band-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const nameInput = document.getElementById("band-name");
    const listenersInput = document.getElementById("band-listeners");
    const name = nameInput.value;
    const listeners = parseInt(listenersInput.value, 10);
    if (!name.trim() || Number.isNaN(listeners) || listeners < 0) return;
    addOrUpdateBand(name, listeners);
    nameInput.value = "";
    listenersInput.value = "";
    nameInput.focus();
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
          const listeners = Number(b.listeners) || 0;
          const existing = state.bands.find((sb) => sb.name.toLowerCase() === name.toLowerCase());
          const ref = existing ? bandsRef.doc(existing.id) : bandsRef.doc();
          batch.set(ref, { name, listeners });
        });
        await batch.commit();
      } catch (err) {
        alert("Arquivo inválido ou erro ao importar: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });
}

function usernameToEmail(username) {
  return `${username}@${ADMIN_EMAIL_DOMAIN}`;
}

function setAdminUI(loggedIn, label) {
  const toggleBtn = document.getElementById("admin-toggle-btn");
  document.getElementById("add-band-panel").classList.toggle("hidden", !loggedIn);
  document.getElementById("backup-panel").classList.toggle("hidden", !loggedIn);
  if (loggedIn) {
    toggleBtn.textContent = `🔓 Sair (${label})`;
    toggleBtn.classList.add("is-logged-in");
  } else {
    toggleBtn.textContent = "🔒 Admin";
    toggleBtn.classList.remove("is-logged-in");
  }
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
  isAdmin = !!user;
  setAdminUI(isAdmin, user ? user.email.split("@")[0] : "");
  render();
});

wireControls();
subscribeToBands();
