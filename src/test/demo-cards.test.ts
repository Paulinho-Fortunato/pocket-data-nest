import { describe, expect, it } from "vitest";

import {
  DEMO_DECK,
  defaultCards,
  demoCards,
  demoCardsFor,
  isDemoCard,
  migrateCards,
  type Card,
} from "../lib/store";

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: "real-1",
    q: "O que é a mitose?",
    a: "Divisão celular que produz duas células idênticas.",
    deck: "Biologia",
    known: false,
    ...overrides,
  };
}

describe("empty initial state", () => {
  it("does not seed pre-created cards", () => {
    expect(defaultCards).toEqual([]);
  });

  it("keeps example cards in their own deck, flagged as demo", () => {
    expect(demoCards).toHaveLength(4);
    for (const demo of demoCards) {
      expect(demo.deck).toBe(DEMO_DECK);
      expect(demo.demo).toBe(true);
      expect(isDemoCard(demo)).toBe(true);
    }
    expect(demoCardsFor([card(), ...demoCards])).toHaveLength(4);
  });
});

describe("safe migration of the old pre-seeded cards", () => {
  it("clears a store that only contained the old demo cards", () => {
    const legacy = demoCards.map((demo, index) => ({
      ...demo,
      id: `c${index + 1}`,
      demo: undefined,
    }));
    expect(migrateCards(legacy as Card[])).toEqual([]);
  });

  it("separates legacy cards from real ones without losing user data", () => {
    const legacy: Card[] = [
      { id: "c1", q: "Pergunta antiga", a: "Resposta", deck: "Geral", known: false },
      card(),
    ];
    const migrated = migrateCards(legacy);
    expect(migrated).toHaveLength(2);
    expect(migrated[0]).toMatchObject({ id: "c1", deck: DEMO_DECK, demo: true });
    expect(migrated[1]).toEqual(card());
    expect(migrated.filter(isDemoCard)).toHaveLength(1);
  });

  it("is a no-op for real cards and for an empty store", () => {
    const real = [card()];
    expect(migrateCards(real)).toBe(real);
    expect(migrateCards([])).toEqual([]);
  });
});
