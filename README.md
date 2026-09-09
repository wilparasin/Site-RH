# Portal RH — 2B

Portal onde cada funcionário acessa os próprios contra cheques e o banco de horas.

## Acesso dos funcionários

- **Usuário**: primeiro e segundo nome, juntos e em minúsculas (`ANA CLARA OLIVEIRA` → `anaclara`).
  Partículas são puladas: `MARIA DA CONCEICAO SARDINHA` → `mariaconceicao`.
- **Senha**: criada pelo próprio funcionário no primeiro acesso — basta informar o usuário na
  tela de login. O RH nunca vê a senha.
- Esqueceu a senha? O admin usa **Funcionários → ⋮ → Redefinir senha**, e o funcionário cria
  uma nova no acesso seguinte.

## Contra cheques

A tela **Contra Cheques** aceita os dois formatos:

1. **PDF único da contabilidade** (sistema Domínio) com todos os recibos. O sistema lê cada
   página, identifica o funcionário (nome, código da folha, empresa e competência), separa as
   páginas — inclusive os comunicados endereçados a cada um — e mostra a lista para conferência
   antes de enviar. Quem ainda não tem cadastro pode ser criado ali mesmo, com o usuário
   sugerido a partir do nome.
2. **Arquivos individuais**, com o CPF no começo do nome do arquivo
   (`08084426605-Maio2026.pdf`) — formato antigo, mantido por compatibilidade.

O recibo é ligado ao cadastro **pelo nome completo**, e só por ele. O código da folha é
guardado apenas como informação: ele se repete entre as filiais (o código 7 pertence a uma
pessoa na Loja 2 e a outra na Matriz) e a razão social é a mesma nas duas, então usá-lo para
casar entregaria o contra cheque ao colega. Quando o nome não bate com nenhum cadastro — ou
bate com mais de um — nada é enviado automaticamente: a linha fica na tela para o admin
escolher o funcionário ou criar o acesso.

## Banco de horas

A tela **Banco de Horas** recebe a planilha do mês como o RH já a monta (uma por loja —
`SOLUÇÃO H.E. MATRIZ`, `FILIAL`...): o mês na primeira linha e, na segunda, o cabeçalho
`FUNCIONÁRIO | ACUMULADO | <mês> | TOTAL | MOTIVO`.

- **Identificação só pelo nome.** A planilha traz o primeiro nome (`ALBERTO`), com o
  sobrenome aparecendo quando ele é preciso para desempatar (`RAFAELA BOTTARO`). As linhas
  mais específicas são resolvidas primeiro e a pessoa escolhida sai da disputa: `RAFAELA
  BOTTARO` fica com Rafaela Sofia Bottaro e `RAFAELA`, sozinha, sobra para Rafaela Soares.
  O que continua em dúvida — nome que não existe no cadastro, ou duas pessoas possíveis —
  volta na tela de conferência para o admin escolher. Nada é gravado por adivinhação.
- **Os três números** são guardados: o saldo `acumulado` dos meses anteriores, o saldo do
  próprio `mês` e o `total`. As horas vêm como hora do Excel (inclusive negativas, `-0:22`),
  no formato `H:MM` ou em horas decimais.
- **O período** é lido da própria planilha (`JULHO 2026`); o campo na tela só serve para
  corrigir.
- **Reimportar o mesmo mês** substitui os saldos daquele mês, em vez de empilhar linhas
  repetidas no histórico.

Cada funcionário vê apenas o próprio saldo, com o acumulado, o mês e o total, mais o
histórico dos meses anteriores.

## Banco de dados

Ao subir o projeto pela primeira vez, execute no SQL Editor do Supabase, nesta ordem:

1. `supabase-schema.sql` — tabelas, RLS e o bucket `contra-cheques`.
2. `supabase-migracao-acesso-usuario.sql` — colunas de acesso por usuário
   (`usuario`, `senha_definida`, `codigo_folha`, `empresa`).
3. `supabase-migracao-banco-horas.sql` — colunas do saldo por mês
   (`acumulado_minutos`, `mes_minutos`, `mes`, `ano`) e um registro por
   funcionário/período. **Sem ela a importação do banco de horas não grava.**

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
