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
