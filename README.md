# Play TV

Player IPTV com interface estilo streaming para servidores **Xtream Codes**. Conecta ao seu servidor e mostra TV ao vivo, filmes e séries organizados por categoria, com perfis, favoritos e progresso de reprodução.

## Download

| Plataforma | Link | Observação |
|---|---|---|
| **Windows (instalador)** | [Play-TV-X-Setup.exe](https://github.com/lu150ml/play_tv/releases/latest/download/Play-TV-X-Setup.exe) | Recomendado. Atualiza sozinho quando sai versão nova. |
| Windows (portátil) | [Play-TV-X-Portable.exe](https://github.com/lu150ml/play_tv/releases/latest/download/Play-TV-X-Portable.exe) | Roda sem instalar. |
| **Android / Android TV / Fire Stick** | [Play-TV-Android.apk](https://github.com/lu150ml/play_tv/releases/latest/download/Play-TV-Android.apk) | Permita "instalar apps de fontes desconhecidas". Atualiza pelo próprio app. |

Os links sempre apontam para a versão mais recente. Histórico e notas de cada versão: [Releases](https://github.com/lu150ml/play_tv/releases).

> No Windows pode aparecer o aviso "O Windows protegeu o computador" porque o instalador não é assinado. Clique em **Mais informações → Executar assim mesmo**.

## Como usar

1. Instale e abra o app.
2. Informe o endereço do servidor (ex.: `http://meuservidor.com`), usuário e senha da assinatura.
3. O catálogo carrega sozinho. Filmes e séries aparecem conforme cada categoria chega.
4. Use **Atualizar lista** no menu lateral para buscar novidades do servidor a qualquer momento.

## Organização do repositório

O repositório tem **dois apps**, cada um na sua branch:

| App | Branch | Tecnologia | Versão |
|---|---|---|---|
| **Play TV X** (Windows) | `codex/electron-catalog-refresh-fix-v0.4.20` | React + Electron | 0.4.x |
| **Play TV** (Android) | `codex/android-details-v1.4.2` | React + Capacitor | 1.5.x |

A branch `main` guarda só a versão web inicial e este README.

### Gerar e publicar a versão Windows

Na branch do Windows:

```bash
npm install
npm test
npm run dist:win      # gera o instalador em release/
npm run release:win   # gera e publica a release no GitHub (requer GitHub CLI)
```

A configuração do instalador (nome, ícone, tipo de pacote) fica na seção `"build"` do `package.json`. O código do Electron fica em `electron/` (`main.cjs` janela, `updater.cjs` atualização automática, `server.cjs` proxy do servidor IPTV). Antes de publicar, suba a versão em `package.json`.

### Gerar e publicar a versão Android

Na branch do Android:

```bash
npm install
npm test
npm run android:apk:release   # APK assinado em android/app/build/outputs/apk/release/
```

Para publicar: suba `versionCode`/`versionName` em `android/app/build.gradle`, copie o APK para `artifacts/play-tv-<versão>-release.apk` e atualize `android-update.json` (versão, link e sha256). Os aparelhos leem esse arquivo para se atualizar. A assinatura usa `android/keystore.properties` (fora do git).

## Desenvolvimento

```bash
npm install
npm run dev        # http://localhost:5173 com proxy Xtream embutido
npm run lint
npm run test       # testes unitários (Vitest)
npm run test:e2e   # testes E2E (Playwright)
```

Commits em Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`...).
