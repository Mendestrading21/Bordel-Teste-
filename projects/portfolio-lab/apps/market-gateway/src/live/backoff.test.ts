import { describe, expect, it } from "vitest";

import { backoffDelayMs, CircuitBreaker, DEFAULT_BACKOFF } from "./backoff.js";

/** Générateur déterministe : un backoff testé avec Math.random serait instable. */
const noJitter = (): number => 0.5;
const minJitter = (): number => 0;
const maxJitter = (): number => 1;

describe("backoffDelayMs", () => {
  it("croît exponentiellement", () => {
    expect(backoffDelayMs(1, DEFAULT_BACKOFF, noJitter)).toBe(1_000);
    expect(backoffDelayMs(2, DEFAULT_BACKOFF, noJitter)).toBe(2_000);
    expect(backoffDelayMs(3, DEFAULT_BACKOFF, noJitter)).toBe(4_000);
    expect(backoffDelayMs(4, DEFAULT_BACKOFF, noJitter)).toBe(8_000);
  });

  it("plafonne le délai", () => {
    expect(backoffDelayMs(50, DEFAULT_BACKOFF, noJitter)).toBe(DEFAULT_BACKOFF.maxMs);
  });

  it("applique une gigue de part et d'autre", () => {
    // Sans gigue, tous les clients déconnectés par une même panne reviennent au
    // même instant et reproduisent la surcharge.
    expect(backoffDelayMs(3, DEFAULT_BACKOFF, minJitter)).toBe(2_000);
    expect(backoffDelayMs(3, DEFAULT_BACKOFF, maxJitter)).toBe(6_000);
  });

  it("ne renvoie jamais de délai négatif", () => {
    const aggressive = { baseMs: 100, maxMs: 1_000, jitterRatio: 2 };
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      expect(backoffDelayMs(attempt, aggressive, minJitter)).toBeGreaterThanOrEqual(0);
    }
  });

  it("refuse un numéro de tentative invalide", () => {
    expect(() => backoffDelayMs(0)).toThrow(RangeError);
    expect(() => backoffDelayMs(-1)).toThrow(RangeError);
  });
});

describe("CircuitBreaker", () => {
  function breaker(now: () => number) {
    return new CircuitBreaker({ failureThreshold: 3, openDurationMs: 30_000, now });
  }

  it("reste fermé sous le seuil d'échecs", () => {
    const circuit = breaker(() => 0);
    circuit.recordFailure();
    circuit.recordFailure();
    expect(circuit.state()).toBe("closed");
    expect(circuit.canAttempt()).toBe(true);
  });

  it("s'ouvre au seuil et suspend les tentatives", () => {
    // Marteler un fournisseur en panne aggrave la panne et consomme le quota.
    const circuit = breaker(() => 0);
    for (let i = 0; i < 3; i += 1) {
      circuit.recordFailure();
    }
    expect(circuit.state()).toBe("open");
    expect(circuit.canAttempt()).toBe(false);
  });

  it("passe en demi-ouvert après la durée d'ouverture", () => {
    let clock = 0;
    const circuit = breaker(() => clock);
    for (let i = 0; i < 3; i += 1) {
      circuit.recordFailure();
    }
    clock = 30_000;
    expect(circuit.state()).toBe("half-open");
    expect(circuit.canAttempt()).toBe(true);
  });

  it("se referme complètement après un succès", () => {
    const circuit = breaker(() => 0);
    for (let i = 0; i < 3; i += 1) {
      circuit.recordFailure();
    }
    circuit.recordSuccess();
    expect(circuit.state()).toBe("closed");
    expect(circuit.consecutiveFailures()).toBe(0);
  });

  it("compte les échecs consécutifs", () => {
    const circuit = breaker(() => 0);
    circuit.recordFailure();
    circuit.recordFailure();
    expect(circuit.consecutiveFailures()).toBe(2);
    circuit.recordSuccess();
    circuit.recordFailure();
    expect(circuit.consecutiveFailures()).toBe(1);
  });
});
