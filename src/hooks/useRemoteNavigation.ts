import { useEffect, useRef } from "react";

const focusSelector = "[data-focusable='true']:not([disabled])";
const BACK_KEYS = new Set(["Escape", "Backspace", "BrowserBack", "GoBack"]);

function isEditable(element: Element | null): boolean {
  if (!element) return false;
  const tag = element.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    (element as HTMLElement).isContentEditable
  );
}

export function useRemoteNavigation() {
  const cachedElementsRef = useRef<HTMLElement[] | undefined>(undefined);

  useEffect(() => {
    function invalidateCache() {
      cachedElementsRef.current = undefined;
    }

    function getFocusableElements() {
      if (cachedElementsRef.current) {
        return cachedElementsRef.current;
      }

      const elements = Array.from(
        document.querySelectorAll<HTMLElement>(focusSelector)
      ).filter((element) => element.offsetParent !== null);
      cachedElementsRef.current = elements;
      return elements;
    }

    // Invalida o cache quando o DOM muda (rails carregando sob demanda,
    // menus abrindo, diálogos) em vez de varrer o documento a cada tecla.
    const observer = new MutationObserver(invalidateCache);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "data-focusable", "style", "class"]
    });

    function handleKeyDown(event: KeyboardEvent) {
      // Tecla "Voltar" do controle remoto / Fire Stick fora de inputs.
      if (BACK_KEYS.has(event.key) && !isEditable(document.activeElement)) {
        if (window.history.length > 1) {
          event.preventDefault();
          window.history.back();
        }
        return;
      }

      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
        return;
      }

      // Não rouba setas de campos de texto (cursor do texto / IME da TV).
      if (isEditable(document.activeElement)) {
        return;
      }

      const activeElement = document.activeElement as HTMLElement | null;
      const focusableElements = getFocusableElements();

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
        if (!isMostlyVisible(nextElement)) {
          nextElement.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
        event.preventDefault();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      observer.disconnect();
      document.removeEventListener("keydown", handleKeyDown);
    };
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

function isMostlyVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const margin = 72;
  return (
    rect.top >= margin &&
    rect.left >= 0 &&
    rect.bottom <= window.innerHeight - margin &&
    rect.right <= window.innerWidth
  );
}
