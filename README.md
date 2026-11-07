# Pocket Data Nest / AngoStudy

AngoStudy é uma aplicação de estudo local-first: tutor IA com streaming, leitura de
documentos, flashcards, quizzes, modo foco, notas e progresso. Os dados ficam no
navegador do utilizador.

Este README descreve o que está **realmente implementado** — inclui também o que
ainda não existe, para não prometer capacidades falsas.

## Desenvolvimento

O projeto usa React 19, TanStack Router/Start, Vite, Tailwind e Bun.

```sh
git clone https://github.com/Paulinho-Fortunato/pocket-data-nest.git
cd pocket-data-nest
bun install
bun run dev
```

Comandos:

```sh
bun run lint       # ESLint + Prettier
bunx tsc --noEmit  # Type check
bun run test       # Vitest (244 testes)
bun run build      # Build de produção
```

A CI (`.github/workflows/ci.yml`) corre instalação com lockfile congelado, lint,
type check e build. Os testes (248) correm localmente com `bun run test`.

## Tutor IA

- Chama a OpenRouter em streaming (SSE) a partir do browser, com a chave guardada
  localmente. O parser aceita `\n\n` e `\r\n\r\n`, preserva UTF-8 dividido entre
  chunks, processa o último evento sem newline, ignora comentários SSE, trata
  `[DONE]`, erros e abort sem transformar cancelamento em erro genérico, e liberta
  sempre o reader.
- **Pesquisa web não está implementada.** O botão foi removido da UI; nenhum
  pedido de pesquisa é feito.
- **Imagens não são multimodais.** Ficheiros de imagem são rejeitados com uma
  mensagem explícita; anexos aceites são PDF, TXT, Markdown, CSV, JSON e código.

### Leitura de documentos

- Extração no browser (`src/lib/extract.ts`): **todas** as páginas de um PDF
  (com `pages`, `totalPages`, `truncated: false` e metadados: nome, página,
  posição e total) e ficheiros de texto lidos integralmente. Não existe `slice`
  silencioso nem limite de 18 000 caracteres / 40 páginas.
- Se um PDF não tiver camada de texto (digitalização), estiver protegido por
  palavra-passe ou falhar nalgumas páginas, a UI explica o motivo e, quando há
  texto parcial, oferece-o indicando as páginas por ler.
- O documento completo, a página e os chunks são guardados em **IndexedDB**
  (`src/lib/idb.ts`), nunca em `localStorage`. O `localStorage` fica só para
  preferências pequenas (`angostudy:*`).
- `DocumentRecord` é versionado (`schemaVersion`) e validado com Zod.
- Chunking determinístico (`src/lib/documents.ts`): fronteiras por parágrafo,
  linha, frase ou palavra (nunca corta palavras), overlap pequeno, e cada chunk
  guarda `documentId`, `chunkId`, `text`, `pageStart`, `pageEnd`, `charStart`,
  `charEnd` e `hash`.
- Estratégia de contexto:
  - documento que cabe no orçamento → enviado integralmente (`full`);
  - pergunta específica → recuperação lexical determinística de trechos
    (`retrieval`, com interface `ChunkRanker` pronta para embeddings);
  - pergunta global ("resume…") → resumo hierárquico por lotes
    (`hierarchical`).
- O bloco de documento vai entre marcadores e com a instrução de que é conteúdo
  **não confiável**, não instruções de sistema.
- A UI mostra o nome, total de páginas, caracteres e quantos trechos foram usados,
  e nunca afirma leitura completa quando só usou parte do documento.

## Renderização das respostas

- `ReactMarkdown` + `remark-gfm` + `remark-math`, com um normalizador de LaTeX
  testável (`src/lib/markdown.ts`) que não toca em code fences nem em código
  inline. Suporta `\(...\)`, `\[...\]`, `$...$`, `$$...$$` e ambientes comuns.
- Durante o streaming, fences abertos são fechados e delimitadores incompletos
  são neutralizados, para a árvore nunca quebrar.
- Code blocks têm linguagem visível, botão Copiar e feedback acessível; ações por
  mensagem (copiar, regenerar, ouvir) ficam **fora** do markdown; links externos
  abrem com `target="_blank"` + `rel="noopener noreferrer"` e protocolos
  perigosos são filtrados. Nunca se usa `dangerouslySetInnerHTML`.
- `prefers-reduced-motion`, foco por teclado, `aria-live` e scroll inteligente
  (só acompanha o fim se o utilizador estiver perto dele) são respeitados.

## Dados, segurança e cópias de segurança

- Perfil, notas, flashcards, progresso e preferências usam `localStorage` sob o
  prefixo `angostudy:`; todos os valores são validados com Zod
  (`src/lib/schemas.ts`). As conversas e os documentos extraídos vivem em
  IndexedDB, porque podem exceder a quota do `localStorage`.
- A chave OpenRouter fica no `localStorage` — **risco real**: qualquer script na
  origem pode lê-la. As Definições explicam o risco e têm um botão
  **Remover chave**.
- Alternativa: preencher o campo *Proxy de IA* (`ai_proxy_url`). A app passa a
  falar com esse endpoint (o segredo fica no servidor) através da abstração
  `createProxyTransport` em `src/lib/ai.ts`.
- Exportar/importar (`src/lib/backup.ts`): envelope versionado, validação por
  schema, migração de cópias antigas (formato plano), rejeição de JSON inválido,
  rejeição de chaves não permitidas e escolha explícita entre **juntar** e
  **substituir**. A cópia inclui conversas e documentos (até 200), mas nunca a
  chave OpenRouter. O importador recusa ficheiros acima de 64 MB.
- Cabeçalhos de segurança (`src/server.ts` + `src/lib/security-headers.ts`):
  CSP sem `unsafe-eval`, `object-src 'none'`, `nosniff`, `Referrer-Policy` e
  `Permissions-Policy`. `frame-ancestors` fica de fora de propósito para o
  preview em iframe. `public/_headers` garante a mesma CSP em hosts estáticos.
- Gerar flashcards valida a resposta do modelo (JSON, campos, limites de tamanho,
  duplicados e número pedido) e mostra erros recuperáveis.

## Build e desempenho

- PDF.js e o pipeline de Markdown são carregados por `import()` dinâmico; KaTeX
  só é descarregado quando uma mensagem contém fórmulas. O bundle inicial fica
  abaixo dos 500 kB.
- `vite-tsconfig-paths` **não** pode ser removido: apesar de o Vite 8 suportar
  `resolve.tsconfigPaths`, o `@lovable.dev/vite-tanstack-config` importa e
  registra o plugin incondicionalmente (é peer dependency). Ficou documentado em
  `vite.config.ts`.

## Qualidade

- ESLint sem erros. A regra `react-refresh/only-export-components` continua ativa,
  exceto nos ficheiros de `src/components/ui/**`, onde os componentes shadcn/ui
  co-localizam variantes e hooks de propósito (ver `eslint.config.js`).
- API de servidor atualizada para `validator` (TanStack Start atual).
- Testes de regressão para: leitura integral e ausência de truncagem (>18 000
  caracteres, PDF >40 páginas), chunking, recuperação de contexto, resumo
  hierárquico, markdown durante streaming, KaTeX, code blocks, SSE (JSON
  dividido, Unicode dividido, último evento sem newline, comentário, `[DONE]`,
  erro, abort), validação de cópias de segurança (incluindo conversas e
  documentos), limite de 500 mensagens sem apagar o histórico e escape dos
  delimitadores de conteúdo não confiável.

## Lovable

Este projeto está ligado ao [Lovable](https://lovable.dev). Evita reescrever o
histórico publicado: os commits enviados para `main` são sincronizados com o
editor.
