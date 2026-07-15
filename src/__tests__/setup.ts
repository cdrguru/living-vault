import "@testing-library/jest-dom";
import { beforeEach } from "vitest";

// Register GSAP plugins for the test run the same way src/main.tsx does in the
// app. Without this, Flip.getState and the count-up tweens run against an
// uninitialized core and throw. The default reduced-motion shim below keeps
// most tests on the static path; a test can override matchMedia to exercise the
// animated branch.
import "@/motion/registerGsap";

// jsdom does not implement matchMedia. Default to reduced motion: false so the
// app behaves like a normal viewer, while staying overridable per test (set
// window.matchMedia to return { matches: true } to assert the reduced path).
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
}

// Minimal localStorage shim so the Rayfin auth client can read/write tokens
// inside jsdom without crashing.
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem(key: string) {
    return this.store[key] ?? null;
  },
  setItem(key: string, value: string) {
    this.store[key] = String(value);
  },
  removeItem(key: string) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  },
};

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// jsdom does not implement scrollIntoView; the command palette calls it to keep
// the active option in view. A no-op keeps those component tests from throwing.
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

beforeEach(() => {
  localStorageMock.clear();
});
