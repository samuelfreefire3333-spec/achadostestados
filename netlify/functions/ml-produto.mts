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
