# Rotas do AngoStudy

[![CI](https://github.com/Paulinho-Fortunato/pocket-data-nest/actions/workflows/ci.yml/badge.svg)](https://github.com/Paulinho-Fortunato/pocket-data-nest/actions/workflows/ci.yml)

Este diretório contém as rotas do TanStack Router (file-based). O README principal
do projeto está em [`../../README.md`](../../README.md) e descreve o estado real da
implementação.

## Mapa das rotas

| Ficheiro         | Rota          | Estado                                                 |
| ---------------- | ------------- | ------------------------------------------------------ |
| `index.tsx`      | `/`           | Painel com progresso, meta semanal e atalhos           |
| `tutor.tsx`      | `/tutor`      | Tutor IA com streaming, documentos e flashcards        |
| `flashcards.tsx` | `/flashcards` | Prática de recuperação e gestão de decks               |
| `quiz.tsx`       | `/quiz`       | Quiz local e quiz gerado por IA                        |
| `foco.tsx`       | `/foco`       | Pomodoro / modo foco                                   |
| `notas.tsx`      | `/notas`      | Notas com apoio de IA                                  |
| `progresso.tsx`  | `/progresso`  | Estatísticas e sequência de dias                       |
| `metodos.tsx`    | `/metodos`    | Métodos de estudo                                      |
| `definicoes.tsx` | `/definicoes` | Perfil, chave/modelo/proxy de IA e cópias de segurança |
| `__root.tsx`     | —             | Shell, barra superior, navegação e captura de erros    |

`src/routeTree.gen.ts` é gerado pelo plugin do TanStack Router — **não editar à mão**.

## Dados usados pelas rotas

- **Preferências e coleções pequenas** (perfil, notas, flashcards, conversas):
  `localStorage` com o prefixo `angostudy:`, lidas e escritas através de
  `useStats`, `useCards`, `useNotes` e `useChatMessages` (`src/lib/store.ts`),
  que validam cada valor com Zod.
- **Documentos extraídos** (texto completo, páginas e chunks): **IndexedDB**
  (`src/lib/idb.ts`). A rota `/tutor` guarda o `DocumentRecord` versionado e
  mantém no `localStorage` apenas o identificador do documento ativo.
- **Chave OpenRouter**: `localStorage`, com aviso de risco e remoção explícita nas
  Definições. Sempre que exista um proxy configurado, a chave deixa de ser usada.

## O que ainda não existe

- Pesquisa web real (a opção foi removida da UI).
- Envio de imagens para o modelo (multimodal): a UI rejeita imagens com uma
  mensagem clara.
- Sincronização entre dispositivos: os dados são locais; a cópia de segurança é um
  ficheiro JSON exportado manualmente.
