// POST /api/sugestoes — visitante sugere um produto para testar. SOMENTE TEXTO.
// Para ler: painel da Cloudflare → Storage & Databases → D1 → achados-db → tabela "sugestoes".
import { json, clean, hasLink, isMercadoLivre, visitante, preparaBanco, novoId, lerJson, tetoGlobal } from "../../lib/servidor.js";

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await lerJson(request); } catch (e) { return json({ erro: e.message === "grande" ? "Envio grande demais." : "Envio inválido." }, e.message === "grande" ? 413 : 400); }
  if (body.website) return json({ ok: true }); // honeypot: robô

  const produto = clean(body.produto, 120), motivo = clean(body.motivo, 400), nome = clean(body.nome, 40), link = clean(body.link, 300);
  if (produto.length < 3) return json({ erro: "Diga qual produto você quer que eu teste." }, 400);
  if (hasLink(`${produto} ${motivo} ${nome}`)) return json({ erro: "Links só no campo de link do Mercado Livre." }, 400);
  if (link && !isMercadoLivre(link)) return json({ erro: "O link precisa ser do Mercado Livre." }, 400);

  try {
    await preparaBanco(env);
    const quem = await visitante(request, env);
    const agora = Date.now();
    const recente = await env.DB.prepare("SELECT COUNT(*) AS n FROM sugestoes WHERE visitante = ? AND criado_em > ?").bind(quem, agora - 60_000).first();
    if (recente?.n > 0) return json({ erro: "Aguarde 1 minuto para enviar outra sugestão." }, 429);
    const doDia = await env.DB.prepare("SELECT COUNT(*) AS n FROM sugestoes WHERE visitante = ? AND criado_em > ?").bind(quem, agora - 86_400_000).first();
    if (doDia?.n >= 10) return json({ erro: "Limite de sugestões de hoje atingido. Obrigado!" }, 429);
    if (await tetoGlobal(env, "sugestoes", Number(env.TETO_SUGESTOES_HORA || 60))) return json({ erro: "Muitas sugestões agora. Tente de novo mais tarde." }, 429);
    await env.DB.prepare("INSERT INTO sugestoes (id, produto, motivo, link, nome, visitante, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(novoId(), produto, motivo, link, nome, quem, agora).run();
    return json({ ok: true });
  } catch (e) {
    return json({ erro: "Não consegui salvar agora. Tente de novo em alguns minutos." }, 500);
  }
}
