# Achados Testados

Vitrine de afiliado do Mercado Livre com reviews, vídeos e avaliações.

- `public/` — o site (index.html + logos)
- `functions/api/` — rotas da Cloudflare Pages: `ml-produto` (preço do catálogo do ML), `avaliacoes` e `sugestoes` (banco D1)
- `lib/servidor.js` — validação e criação das tabelas do banco
- `netlify/` — versão antiga da função, usada na Netlify
- `extras/` — integração com Firebase e regras do Firestore (para depois)

## Cloudflare Pages
- Build: sem comando; pasta de saída `public`
- Banco D1 `achados-db` ligado com o nome `DB` (as tabelas são criadas sozinhas)
- Variáveis: `ML_CLIENT_ID`, `ML_CLIENT_SECRET` (secreta), `MODERAR` = `sim` para aprovar avaliações antes (opcional)
- Ler sugestões: painel da Cloudflare → D1 → achados-db → tabela `sugestoes`

As chaves do Mercado Livre nunca ficam no código.
