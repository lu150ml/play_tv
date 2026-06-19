import { useEffect } from "react";

const focusSelector = "[data-focusable='true']:not([disabled])";

export function useRemoteNavigation() {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement | null;
      const focusableElements = Array.from(
        document.querySelectorAll<HTMLElement>(focusSelector)
      ).filter((element) => element.offsetParent !== null);

      if (focusableElements.length === 0) {
        return;
      }

      if (!activeElement || !focusableElements.includes(activeElement)) {
        focusableElements[0]?.focus();
        event.preventDefault();
        return;
      }

      const nextElement = findNextElement(activeElement, focusableElements, event.key);

      if (nextElement) {
        nextElement.focus();
        nextElement.scrollIntoView({ block: "nearest", inline: "nearest" });
        event.preventDefault();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);
}

function findNextElement(
  currentElement: HTMLElement,
  elements: HTMLElement[],
  key: string
): HTMLElement | undefined {
  const currentRect = currentElement.getBoundingClientRect();
  const currentCenter = getCenter(currentRect);

  const candidates = elements
    .filter((element) => element !== currentElement)
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) => isInDirection(currentCenter, getCenter(rect), key))
    .sort((left, right) => {
      const leftCenter = getCenter(left.rect);
      const rightCenter = getCenter(right.rect);
      return distance(currentCenter, leftCenter) - distance(currentCenter, rightCenter);
    });

  return candidates[0]?.element;
}

function getCenter(rect: DOMRect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
}

function isInDirection(
  current: { x: number; y: number },
  candidate: { x: number; y: number },
  key: string
): boolean {
  if (key === "ArrowRight") {
    return candidate.x > current.x + 8;
  }

  if (key === "ArrowLeft") {
    return candidate.x < current.x - 8;
  }

  if (key === "ArrowDown") {
    return candidate.y > current.y + 8;
  }

  return candidate.y < current.y - 8;
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}
