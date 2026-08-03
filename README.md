# Play TV X

## Download para Windows

Baixe o instalador ou a versao portatil na [Release mais recente](https://github.com/lu150ml/play_tv/releases/latest). Os arquivos `.sha256` permitem conferir a integridade do download.

Player IPTV com interface estilo streaming para servidores compatíveis com **Xtream Codes**. Conecta ao seu servidor, baixa o catálogo completo (TV ao vivo, filmes e séries) e oferece navegação por categorias, perfis de usuário e progresso de reprodução persistido localmente.

---

## Funcionalidades

- **Login com servidor Xtream Codes** — autentica via `player_api.php` e carrega o catálogo real
- **Catálogo organizado** — TV ao vivo, Filmes e Séries em seções separadas com subcategorias normalizadas
- **Hero banner dinâmico** — destaque personalizado por seção com base no histórico de reprodução
- **Player com HLS e MP4** — suporte a streams `.m3u8` via hls.js e vídeos nativos; retoma do ponto salvo
- **Progresso de reprodução** — salvo localmente por conteúdo e por episódio, com barra de progresso nos cards
- **Perfis de usuário** — múltiplos perfis com favoritos e histórico independentes
- **Busca** — filtra título, descrição, gênero e categoria em tempo real
- **Recomendações personalizadas** — sugere conteúdo com base no que foi assistido por perfil
- **Página de detalhes de série** — temporadas, lista de episódios e navegação direta para cada um
- **Navegação por controle remoto** — suporte a teclado e navegação direcional para uso em TV

---

## Stack

| Camada           | Tecnologia                                     |
| ---------------- | ---------------------------------------------- |
| UI               | React 18 + TypeScript                          |
| Estilo           | Tailwind CSS com design tokens customizados    |
| Roteamento       | React Router v6                                |
| Estado           | Zustand com persistência via localStorage      |
| Player HLS       | hls.js (carregado dinamicamente)               |
| Proxy IPTV       | Plugin Vite — repassa chamadas Xtream sem CORS |
| Testes unitários | Vitest + jsdom                                 |
| Testes E2E       | Playwright (browser, mobile e layout TV)       |
| Qualidade        | ESLint, Prettier, TypeScript strict            |

---

## Estrutura

```
src/
├── components/        # AppShell, CatalogRail, ContentCard, PlayerControls, SearchOverlay
├── data/              # mockCatalog — catálogo de demonstração local
├── hooks/             # useRemoteNavigation — navegação por teclado/controle
├── pages/             # LoginPage, ProfilesPage, CatalogPage, SeriesPage, PlayerPage
├── services/          # catalogService, xtreamService, playbackService,
│                      # bufferService, seriesService, recommendationService, sessionService
├── stores/            # libraryStore — catálogo, perfis, favoritos, progresso
├── styles/            # index.css com variáveis do design system
├── types/             # catalog.ts — tipos ContentItem, Episode, Profile, etc.
└── utils/             # format.ts — formatação de duração e tempo restante
```

---

## Primeiros passos

```bash
npm install
npm run dev        # Inicia em http://localhost:5173
```

Na tela de login informe a URL do seu servidor Xtream Codes (ex: `http://meuservidor.com`), usuário e senha. O catálogo é carregado automaticamente — até 800 itens por tipo (TV, filmes, séries).

Para explorar sem servidor, o app inicia com um catálogo de demonstração local.

---

## Comandos

```bash
npm run dev          # Servidor de desenvolvimento com proxy Xtream embutido
npm run build        # Build de produção (type-check + Vite)
npm run lint         # ESLint
npm run test         # Testes unitários (Vitest)
npm run test:e2e     # Testes E2E (Playwright)
```

---

## Arquitetura do proxy

O Vite dev server inclui um plugin (`xtreamProxyPlugin`) que intercepta `/api/xtream?*` e repassa para `player_api.php` no servidor configurado. Isso evita erros de CORS durante o desenvolvimento. Em produção, o mesmo proxy precisa ser configurado no servidor web (nginx, Caddy, etc.).

---

## Padrão de commits

Conventional Commits em inglês:

```
feat: add catalog home rails
fix: persist playback progress after refresh
refactor: split player controls
test: cover catalog filtering
docs: update readme
chore: configure eslint and prettier
```

Nomes de branch curtos e com escopo: `feat/series-detail`, `fix/hls-buffer`, `chore/deps`.
