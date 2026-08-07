/**
 * Backup automático (roda no GitHub Actions). Exporta a coleção de bandas e o
 * meta/ranking pra um arquivo JSON versionado em backups/, commitado no repo.
 *
 * Precisa da variável FIREBASE_SERVICE_ACCOUNT (mesmo secret do fechar-semana).
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

function loadCredentials() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    console.error("Faltou o secret FIREBASE_SERVICE_ACCOUNT.");
    process.exit(1);
  }
  return JSON.parse(raw);
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(loadCredentials()) });
  const db = admin.firestore();

  const bandsSnap = await db.collection("bands").get();
  const metaSnap = await db.collection("meta").doc("ranking").get();

  const backup = {
    exportedAt: new Date().toISOString(),
    meta: metaSnap.exists ? metaSnap.data() : null,
    bands: bandsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };

  const dir = path.join(__dirname, "..", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `backup-${date}.json`);
  // Serializa Timestamps de forma legível (toDate) sem quebrar.
  fs.writeFileSync(
    file,
    JSON.stringify(backup, (k, v) => (v && v._seconds !== undefined ? new Date(v._seconds * 1000).toISOString() : v), 2)
  );

  console.log(`Backup salvo: backups/backup-${date}.json (${backup.bands.length} bandas)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Erro no backup:", err);
    process.exit(1);
  });
