// Busca preço (com promoção) e estrelas de um anúncio do Mercado Livre.
// Uso: /api/ml-produto?id=MLB5238328371
// As chaves ficam nas variáveis de ambiente da Netlify (ML_CLIENT_ID e ML_CLIENT_SECRET),
// nunca no site. A resposta fica em cache na CDN por 6 horas.
import type { Config } from "@netlify/functions"

const API = "https://api.mercadolibre.com"
let cachedToken: { value: string; expiresAt: number } | null = null

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value
  const clientId = Netlify.env.get("ML_CLIENT_ID")
  const clientSecret = Netlify.env.get("ML_CLIENT_SECRET")
  if (!clientId || !clientSecret) throw new Error("Faltam ML_CLIENT_ID ou ML_CLIENT_SECRET nas variáveis da Netlify.")
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.access_token) throw new Error(`Login no ML recusado (${res.status}): ${data.message || data.error || "sem detalhes"}`)
  cachedToken = { value: data.access_token, expiresAt: Date.now() + ((data.expires_in ?? 21600) - 300) * 1000 }
  return cachedToken.value
}

async function mlGet(path: string, token: string) {
  const res = await fetch(API + path, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } })
  const body = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, body }
}

export default async (req: Request) => {
  const id = (new URL(req.url).searchParams.get("id") || "").toUpperCase().trim()
  if (!/^MLB\d{6,14}$/.test(id)) {
    return Response.json({ erro: "Informe o código do anúncio, ex.: ?id=MLB5238328371" }, { status: 400 })
  }

  let token: string
  try { token = await getToken() }
  catch (e) { return Response.json({ erro: (e as Error).message }, { status: 500, headers: { "cache-control": "no-store" } }) }

  const catalogo = (new URL(req.url).searchParams.get("catalogo") || "").toUpperCase().trim()
  if (/^MLB\d{6,14}$/.test(catalogo)) {
    const [prod, itens, rev1, rev2] = await Promise.all([
      mlGet(`/products/${catalogo}`, token),
      mlGet(`/products/${catalogo}/items?limit=1`, token),
      mlGet(`/reviews/item/${id}?catalog_product_id=${catalogo}&limit=1`, token),
      mlGet(`/reviews/product/${catalogo}?limit=1`, token)
    ])
    const rv = rev1.ok ? rev1.body : rev2.ok ? rev2.body : null
    const bb = prod.body?.buy_box_winner
    return Response.json({
      catalogo, statusProduto: prod.status, statusItens: itens.status,
      nome: prod.body?.name ?? null,
      preco: bb?.price ?? itens.body?.results?.[0]?.price ?? null,
      precoAntigo: bb?.original_price ?? itens.body?.results?.[0]?.original_price ?? null,
      anuncioVencedor: bb?.item_id ?? itens.body?.results?.[0]?.item_id ?? null,
      estrelas: rv?.rating_average ?? null, totalOpinioes: rv?.paging?.total ?? null,
      statusOpinioes: [rev1.status, rev2.status],
      fotos: (prod.body?.pictures || []).slice(0, 8).map((p: any) => p.url).filter(Boolean),
      especificacoes: (prod.body?.main_features || []).map((f: any) => f.text).filter(Boolean).slice(0, 10),
      atributos: (prod.body?.attributes || []).filter((a: any) => a.name && a.value_name).slice(0, 25).map((a: any) => `${a.name}: ${a.value_name}`),
      erro: prod.ok ? null : prod.body?.message ?? null
    }, { headers: { "cache-control": "no-store" } })
  }

  const [preco, opinioes, item] = await Promise.all([
    mlGet(`/items/${id}/sale_price?context=channel_marketplace`, token),
    mlGet(`/reviews/item/${id}?limit=1`, token),
    mlGet(`/items/${id}?attributes=id,title,status,permalink,available_quantity`, token)
  ])

  const p = preco.ok ? preco.body : null
  const r = opinioes.ok ? opinioes.body : null
  const resultado = {
    id,
    titulo: item.ok ? item.body?.title ?? null : null,
    ativo: item.ok ? item.body?.status === "active" : null,
    preco: p?.amount ?? null,
    precoAntigo: p?.regular_amount ?? null,
    descontoPct: p?.amount && p?.regular_amount ? Math.round((1 - p.amount / p.regular_amount) * 100) : 0,
    estrelas: r?.rating_average ?? null,
    totalOpinioes: r?.paging?.total ?? null,
    consultadoEm: new Date().toISOString(),
    diagnostico: { preco: preco.status, opinioes: opinioes.status, item: item.status }
  }
  const tudoOk = preco.ok || opinioes.ok
  return Response.json(resultado, {
    status: tudoOk ? 200 : 502,
    headers: tudoOk
      ? { "cache-control": "public, max-age=0, must-revalidate", "netlify-cdn-cache-control": "public, durable, s-maxage=21600, stale-while-revalidate=3600" }
      : { "cache-control": "no-store" }
  })
}

export const config: Config = { path: "/api/ml-produto" }
