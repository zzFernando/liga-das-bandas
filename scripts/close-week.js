/**
 * Fecha a semana automaticamente (roda no GitHub Actions, sem navegador).
 *
 * Faz o mesmo que o botão "Fechar semana" do app:
 *   - para cada banda: score += VOTE_WEIGHT × (pendingUp − pendingDown)
 *   - guarda previousScore, zera os votos pendentes
 *   - atualiza meta/ranking com as datas
 *
 * Precisa da variável de ambiente FIREBASE_SERVICE_ACCOUNT com o JSON da
 * chave de conta de serviço do projeto (guardada como secret no GitHub).
 */

const admin = require("firebase-admin");

// Mantém igual ao VOTE_WEIGHT do app.js.
const VOTE_WEIGHT = 2;

function loadCredentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.error("Faltou o secret FIREBASE_SERVICE_ACCOUNT.");
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("FIREBASE_SERVICE_ACCOUNT não é um JSON válido:", e.message);
    process.exit(1);
  }
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(loadCredentials()) });
  const db = admin.firestore();

  const snap = await db.collection("bands").get();
  if (snap.empty) {
    console.log("Nenhuma banda encontrada. Nada a fazer.");
    return;
  }

  const now = admin.firestore.Timestamp.now();
  const docs = snap.docs;

  // Novos scores + posições finais (pra guardar no histórico de cada banda).
  const scored = docs.map((doc) => {
    const b = doc.data();
    const newScore = (b.score || 0) + VOTE_WEIGHT * ((b.pendingUp || 0) - (b.pendingDown || 0));
    return { doc, b, newScore };
  });
  scored.sort((a, b) => b.newScore - a.newScore || (b.b.listeners || 0) - (a.b.listeners || 0));
  const posMap = new Map(scored.map((x, i) => [x.doc.id, i + 1]));

  // Firestore permite 500 escritas por batch; paginamos por segurança.
  for (let i = 0; i < scored.length; i += 400) {
    const batch = db.batch();
    scored.slice(i, i + 400).forEach(({ doc, b, newScore }) => {
      const history = [...(b.history || []), { t: now, pos: posMap.get(doc.id), score: newScore }].slice(-30);
      batch.update(doc.ref, {
        previousScore: b.score || 0,
        score: newScore,
        pendingUp: 0,
        pendingDown: 0,
        history,
      });
    });
    await batch.commit();
  }

  const next = admin.firestore.Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000);
  await db.collection("meta").doc("ranking").update({ lastUpdate: now, nextUpdate: next });

  // Reescreve o documento agregado meta/board (o que os visitantes leem).
  await db.collection("meta").doc("board").set({
    updatedAt: now,
    bands: scored.map(({ doc, b, newScore }) => ({
      id: doc.id,
      name: b.name || "",
      score: newScore,
      previousScore: b.score || 0,
      listeners: b.listeners || 0,
      image: b.image || "",
      spotify: b.spotify || "",
      youtube: b.youtube || "",
      instagram: b.instagram || "",
      genres: b.genres || [],
      lastfm: b.lastfm || "",
      history: [...(b.history || []), { t: now, pos: posMap.get(doc.id), score: newScore }].slice(-12),
    })),
  });

  // Rodada semanal: apaga todos os votos individuais pra a próxima semana começar do zero.
  const votes = await db.collectionGroup("votes").get();
  for (let i = 0; i < votes.docs.length; i += 400) {
    const delBatch = db.batch();
    votes.docs.slice(i, i + 400).forEach((d) => delBatch.delete(d.ref));
    await delBatch.commit();
  }

  console.log(`Semana fechada: ${docs.length} banda(s) atualizada(s), ${votes.size} voto(s) zerado(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erro ao fechar semana:", err);
    process.exit(1);
  });
