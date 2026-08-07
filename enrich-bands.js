/**
 * Gambiarra pra enriquecer bandas-import.json automaticamente.
 *
 * O que faz:
 *   - busca cada banda na Spotify Search API (link oficial + foto do artista)
 *   - monta um link de busca do YouTube
 *   - deixa instagram em branco (sem API decente)
 *
 * Uso:
 *   1. Cria um app em https://developer.spotify.com/dashboard
 *   2. Exporta as credenciais:
 *        Windows PowerShell:
 *          $env:SPOTIFY_CLIENT_ID="xxx"; $env:SPOTIFY_CLIENT_SECRET="yyy"
 *        bash:
 *          export SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy
 *   3. node enrich-bands.js
 *
 * Gera: bandas-enriched.json  (revisa antes de importar!)
 */

const fs = require("fs");

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const INPUT = "bandas-import.json";
const OUTPUT = "bandas-enriched.json";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Faltou SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET no ambiente.");
  process.exit(1);
}

async function getToken() {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Token falhou: ${res.status}`);
  return (await res.json()).access_token;
}

async function searchArtist(name, token) {
  const url =
    "https://api.spotify.com/v1/search?type=artist&limit=1&q=" +
    encodeURIComponent(name);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) {
    // rate limit: respeita o Retry-After e tenta de novo
    const wait = (parseInt(res.headers.get("retry-after") || "2", 10) + 1) * 1000;
    await new Promise((r) => setTimeout(r, wait));
    return searchArtist(name, token);
  }
  if (!res.ok) throw new Error(`Search falhou (${res.status}) para "${name}"`);
  const artist = (await res.json())?.artists?.items?.[0];
  if (!artist) return null;
  return {
    spotify: artist.external_urls?.spotify || "",
    image: artist.images?.[0]?.url || "",
    matchedName: artist.name,
  };
}

const youtubeSearch = (name) =>
  "https://www.youtube.com/results?search_query=" + encodeURIComponent(name);

async function main() {
  const data = JSON.parse(fs.readFileSync(INPUT, "utf8"));
  const token = await getToken();
  const out = [];

  for (const band of data.bands) {
    let hit = null;
    try {
      hit = await searchArtist(band.name, token);
    } catch (e) {
      console.warn(`  ! erro em "${band.name}": ${e.message}`);
    }
    const flag =
      hit && hit.matchedName.toLowerCase() !== band.name.toLowerCase()
        ? `  (spotify achou: "${hit.matchedName}" — confere)`
        : "";
    console.log(`${hit ? "✓" : "✗"} ${band.name}${flag}`);

    out.push({
      ...band,
      spotify: hit?.spotify || "",
      image: hit?.image || "",
      youtube: youtubeSearch(band.name),
      instagram: "",
    });
    await new Promise((r) => setTimeout(r, 120)); // gentileza com a API
  }

  fs.writeFileSync(OUTPUT, JSON.stringify({ bands: out }, null, 2));
  const missing = out.filter((b) => !b.spotify).length;
  console.log(`\nPronto -> ${OUTPUT}`);
  console.log(`${out.length - missing}/${out.length} com match no Spotify.`);
  if (missing) console.log(`${missing} sem match: procura "✗" acima pra revisar.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
