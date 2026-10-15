// Cloudflare Pages Function — GET /api/ml-produto?catalogo=MLB74127236
// Busca nome, preço (com promoção), fotos e especificações no catálogo do Mercado Livre.
// Chaves: variáveis ML_CLIENT_ID e ML_CLIENT_SECRET do projeto (nunca no código).
// Resposta guardada em cache por 6 horas.
const API = "https://api.mercadolibre.com";
const SEIS_HORAS = 6 * 60 * 60;
let tokenCache = null;

async function getToken(env) {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.value;
  if (!env.ML_CLIENT_ID || !env.ML_CLIENT_SECRET) throw new Error("Faltam ML_CLIENT_ID ou ML_CLIENT_SECRET nas variáveis do projeto.");
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: env.ML_CLIENT_ID, client_secret: env.ML_CLIENT_SECRET })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Login no ML recusado (${res.status})`);
  tokenCache = { value: data.access_token, expiresAt: Date.now() + ((data.expires_in ?? 21600) - 300) * 1000 };
  return tokenCache.value;
}

async function mlGet(path, token) {
  const res = await fetch(API + path, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  return { ok: res.ok, status: res.status, body: await res.json().catch(() => null) };
}

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", ...extra } });

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const catalogo = (url.searchParams.get("catalogo") || "").toUpperCase().trim();
  if (!/^MLB\d{6,14}$/.test(catalogo)) return json({ erro: "Informe o código do catálogo, ex.: ?catalogo=MLB74127236" }, 400);

  const cache = caches.default;
  const chave = new Request(`${url.origin}/api/ml-produto?catalogo=${catalogo}`);
  const emCache = await cache.match(chave);
  if (emCache) return emCache;

  let token;
  try { token = await getToken(env); } catch (e) { return json({ erro: e.message }, 500, { "cache-control": "no-store" }); }

  const [prod, itens] = await Promise.all([
    mlGet(`/products/${catalogo}`, token),
    mlGet(`/products/${catalogo}/items?limit=1`, token)
  ]);
  if (!prod.ok && !itens.ok) return json({ erro: "O Mercado Livre não respondeu.", status: [prod.status, itens.status] }, 502, { "cache-control": "no-store" });

  const bb = prod.body?.buy_box_winner;
  const it = itens.body?.results?.[0];
  const preco = bb?.price ?? it?.price ?? null;
  const precoAntigo = bb?.original_price ?? it?.original_price ?? null;
  const resposta = json({
    catalogo,
    nome: prod.body?.name ?? null,
    preco, precoAntigo,
    descontoPct: preco && precoAntigo ? Math.round((1 - preco / precoAntigo) * 100) : 0,
    anuncio: bb?.item_id ?? it?.item_id ?? null,
    fotos: (prod.body?.pictures || []).slice(0, 8).map(p => p.url).filter(Boolean),
    especificacoes: (prod.body?.main_features || []).map(f => f.text).filter(Boolean).slice(0, 10),
    consultadoEm: new Date().toISOString()
  }, 200, { "cache-control": `public, max-age=${SEIS_HORAS}` });
  waitUntil(cache.put(chave, resposta.clone()));
  return resposta;
}
