// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useRemoteNavigation } from "./useRemoteNavigation";

function createFocusable(x: number, y: number, label: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.setAttribute("data-focusable", "true");
  button.textContent = label;
  // jsdom não calcula layout: simula posição e visibilidade.
  button.getBoundingClientRect = () =>
    ({ left: x, top: y, right: x + 100, bottom: y + 40, width: 100, height: 40, x, y, toJSON: () => ({}) }) as DOMRect;
  Object.defineProperty(button, "offsetParent", { get: () => document.body });
  document.body.appendChild(button);
  return button;
}

function press(key: string) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

describe("useRemoteNavigation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    // jsdom não implementa scrollIntoView.
    Element.prototype.scrollIntoView = () => {};
  });

  it("moves focus to the nearest element in the arrow direction", () => {
    renderHook(() => useRemoteNavigation());
    const left = createFocusable(0, 0, "left");
    const right = createFocusable(200, 0, "right");

    left.focus();
    press("ArrowRight");

    expect(document.activeElement).toBe(right);
  });

  it("moves focus vertically with ArrowDown", () => {
    renderHook(() => useRemoteNavigation());
    const top = createFocusable(0, 0, "top");
    const bottom = createFocusable(0, 200, "bottom");

    top.focus();
    press("ArrowDown");

    expect(document.activeElement).toBe(bottom);
  });

  it("focuses the first element when nothing is focused", () => {
    renderHook(() => useRemoteNavigation());
    const first = createFocusable(0, 0, "first");
    createFocusable(200, 0, "second");

    (document.activeElement as HTMLElement)?.blur?.();
    press("ArrowDown");

    expect(document.activeElement).toBe(first);
  });

  it("picks up elements added to the DOM after mount (cache invalidation)", async () => {
    renderHook(() => useRemoteNavigation());
    const start = createFocusable(0, 0, "start");
    start.focus();
    press("ArrowRight"); // nada à direita ainda
    expect(document.activeElement).toBe(start);

    const added = createFocusable(200, 0, "added");
    await new Promise((resolve) => setTimeout(resolve, 0)); // MutationObserver é assíncrono
    press("ArrowRight");

    expect(document.activeElement).toBe(added);
  });

  it("does not steal arrows from text inputs", () => {
    renderHook(() => useRemoteNavigation());
    const input = document.createElement("input");
    input.setAttribute("data-focusable", "true");
    Object.defineProperty(input, "offsetParent", { get: () => document.body });
    document.body.appendChild(input);
    createFocusable(200, 0, "button");

    input.focus();
    press("ArrowRight");

    expect(document.activeElement).toBe(input);
  });
});
