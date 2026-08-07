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

  // Firestore permite 500 escritas por batch; a liga tem menos que isso, mas
  // paginamos por segurança caso cresça.
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach((doc) => {
      const b = doc.data();
      const delta = VOTE_WEIGHT * ((b.pendingUp || 0) - (b.pendingDown || 0));
      batch.update(doc.ref, {
        previousScore: b.score || 0,
        score: (b.score || 0) + delta,
        pendingUp: 0,
        pendingDown: 0,
      });
    });
    await batch.commit();
  }

  const now = admin.firestore.Timestamp.now();
  const next = admin.firestore.Timestamp.fromMillis(now.toMillis() + 7 * 24 * 60 * 60 * 1000);
  await db.collection("meta").doc("ranking").update({ lastUpdate: now, nextUpdate: next });

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
