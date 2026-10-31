# Pocket Data Nest (AngoStudy)

[![CI](https://github.com/Paulinho-Fortunato/pocket-data-nest/actions/workflows/ci.yml/badge.svg)](https://github.com/Paulinho-Fortunato/pocket-data-nest/actions/workflows/ci.yml)

AngoStudy é uma aplicação de estudo local-first: tutor IA com streaming, flashcards, quizzes, modo foco, notas e progresso, com os dados guardados no navegador.

## Funcionalidades

- **Tutor IA** — respostas em streaming (efeito de digitação), upload de PDF e textos, resumo de vídeos do YouTube e voz
- **Flashcards** — prática de recuperação com decks e XP
- **Quiz e Modo foco** — revisão gamificada e pomodoro
- **PWA** — instalável e funcional offline
- **IndexedDB** — histórico de conversas e anexos grandes sem limite localStorage

## Desenvolvimento

O projeto usa React, TanStack Router/Start, Vite e Bun.

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

A integração com o Tutor IA é opcional. Para a ativar, guarda uma chave OpenRouter em **Definições**; a chave fica no armazenamento local do navegador.

## Dados locais

A aplicação não exige uma base de dados: perfil, stats, flashcards e notas são guardados no `localStorage` com o prefixo `angostudy:`; o histórico de conversas e anexos grandes ficam em IndexedDB. A página **Definições** permite exportar e importar uma cópia dos dados.

## Lovable

Este projeto está ligado ao [Lovable](https://lovable.dev). Evita reescrever o histórico publicado: os commits enviados para `main` são sincronizados com o editor.
