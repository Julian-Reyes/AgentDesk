import { beforeEach } from "vitest";

/**
 * Tests never call real model APIs (CLAUDE.md). Rather than trusting that,
 * the global fetch is replaced before every test, so a test that accidentally
 * reaches the network fails loudly. Tests that exercise the HTTP client inject
 * their own fake fetch instead.
 */
beforeEach(() => {
  globalThis.fetch = (async (input: unknown) => {
    throw new Error(`Tests must not call real APIs (tried to fetch ${String(input)}). Use the fake provider or inject a fake fetch.`);
  }) as typeof fetch;
});
