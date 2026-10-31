# Pocket Data Nest

AngoStudy é uma aplicação de estudo local-first: tutor IA, flashcards, quizzes, modo foco, notas e progresso, com os dados guardados no navegador.

## Desenvolvimento

O projecto usa React, TanStack Router, Vite e Bun.

```sh
git clone https://github.com/Paulinho-Fortunato/pocket-data-nest.git
cd pocket-data-nest
bun install
bun run dev
```

Comandos úteis:

```sh
bun run lint       # ESLint + Prettier
bun run test       # Vitest
bun run build      # Build de produção
```

A integração com o Tutor IA é opcional. Para a activar, guarda uma chave OpenRouter em **Definições**; a chave fica no armazenamento local do navegador.

## Dados locais

A aplicação não exige uma base de dados: perfil, notas, flashcards, conversas e progresso são guardados no `localStorage` com o prefixo `angostudy:`. A página **Definições** permite exportar e importar uma cópia dos dados.

## Lovable

Este projecto está ligado ao [Lovable](https://lovable.dev). Evita reescrever o histórico publicado: os commits enviados para `main` são sincronizados com o editor.
