// Detecção de modo TV (Fire Stick, Android TV, telas grandes sem toque).
// Usada para reduzir quantidade de itens montados, desativar efeitos de GPU
// e ajustar alvos de foco para controle remoto.
export function isTvMode(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  if (/AFT|Android TV|BRAVIA|SmartTV|SMART-TV|TV Safari/i.test(ua)) return true;
  const hasTouch = "ontouchstart" in window || window.navigator.maxTouchPoints > 0;
  if (!hasTouch && window.matchMedia("(min-width: 960px)").matches) return true;
  return window.matchMedia("(min-width: 960px) and (orientation: landscape)").matches;
}
