// Suites que o Test Lab sabe rodar. Cada uma e um comando executado na raiz do
// projeto; "needsBuild" faz o runner compilar o app (dist/) antes, uma vez.
const suites = [
  {
    id: "typecheck",
    name: "Tipos (TypeScript)",
    description: "tsc --noEmit em todo o projeto.",
    command: "npx tsc --noEmit",
    group: "rapido"
  },
  {
    id: "lint",
    name: "Lint (ESLint)",
    description: "Regras de codigo e hooks do React.",
    command: "npx eslint .",
    group: "rapido"
  },
  {
    id: "unit",
    name: "Unitarios (Vitest)",
    description: "Servicos, stores e componentes React em jsdom.",
    command: "npx vitest run",
    group: "rapido"
  },
  {
    id: "backend",
    name: "Processo principal (Electron)",
    description: "Servidor local, downloads, transcodificacao e atualizador.",
    command: "node --test --test-isolation=none electron/*.test.cjs",
    group: "rapido"
  },
  {
    id: "flows",
    name: "Fluxos do app (E2E)",
    description: "Abre o Play TV X real contra um servidor Xtream falso: login, perfil, abas, busca, filme, serie e canal.",
    command: "node --test tests/electron/flows.test.cjs",
    group: "e2e",
    needsBuild: true
  },
  {
    id: "media",
    name: "Midia e reproducao (E2E)",
    description: "HLS, transcodificacao de MKV, canal 24h com redirect e MP4 direto.",
    command: "node --test tests/electron/desktop.test.cjs",
    group: "e2e",
    needsBuild: true
  },
  {
    id: "live",
    name: "Aceitacao com servidor real",
    description: "Login no seu servidor Xtream, busca uma serie e confere se o video toca.",
    command: "node tests/electron/live-acceptance.cjs",
    group: "real",
    needsBuild: true,
    requires: [
      { env: "PLAY_TV_LIVE_SERVER", label: "Servidor", placeholder: "http://host:porta" },
      { env: "PLAY_TV_LIVE_USERNAME", label: "Usuario" },
      { env: "PLAY_TV_LIVE_PASSWORD", label: "Senha", secret: true },
      { env: "PLAY_TV_LIVE_SERIES", label: "Serie para testar", placeholder: "Nome exato da serie" }
    ]
  }
];

const buildStep = {
  id: "build",
  name: "Compilar app (vite build)",
  command: "npx vite build"
};

module.exports = { suites, buildStep };
