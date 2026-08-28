# Play TV X

Play TV X e um player IPTV para servidores compativeis com Xtream Codes. O projeto hoje cobre duas linhas principais:

- Android, para celular, tablet e Android TV, com player nativo Media3
- PC/Windows, empacotado com Electron, com release e atualizacao automatica nas builds instaladas

Em 28 de agosto de 2026, as versoes mais recentes conhecidas desta base sao:

- Android: `1.4.4` (`versionCode 14`)
- PC / Electron: `0.4.13`

## Funcionalidades principais

- Login com servidor Xtream Codes via `player_api.php`
- Carregamento progressivo do catalogo em secoes separadas: TV, Musica, Filmes e Series
- Home com trilhos horizontais por categoria e amostragem de conteudo
- Perfis com favoritos, historico e progresso persistido
- Busca por titulo, descricao, genero e categoria
- Tela de detalhes para filmes antes de reproduzir
- Tela de detalhes para series com temporadas, episodios e progresso
- TV ao vivo e Musica abrindo direto no player
- Retomada do ponto salvo e autoplay do proximo episodio dentro do player
- Legendas quando disponiveis

## Recursos por plataforma

### Android

- App nativo com Capacitor + Media3
- Downloads de filmes e episodios com fila persistente
- Escolha de pasta de downloads
- Atualizacao do APK pelo proprio app
- Rodape com versao instalada e estado da atualizacao
- Picture-in-Picture no player nativo
- Protecao de credenciais e dados sensiveis no dispositivo

### PC / Electron

- Build Windows com instalador NSIS e versao portatil
- Atualizacao automatica via GitHub Releases nas builds instaladas
- `latest.yml`, `.blockmap` e hashes para o updater
- Gerenciamento de downloads pelo processo principal do Electron
- Fallback de compatibilidade para streams que precisam de tratamento adicional

## Fluxo atual de navegacao

- TV ao vivo e Musica abrem direto no player
- Filmes abrem primeiro na tela de detalhes e depois seguem para reproducao
- Series abrem primeiro na tela de detalhes, com selecao manual de temporada e episodio

## Funcionalidades recentes

- Home reorganizada com trilhos por categoria
- Separacao de Musica da secao de TV
- Tela de detalhes para filmes com sinopse, ano, duracao, genero, elenco, diretor, progresso e favorito
- Tela de detalhes para series com continuar, progresso, favorito e escolha manual de episodios
- Foco automatico no player quando a reproducao e iniciada
- Melhorias na experiencia de atualizacao no Android e no Electron
- Melhorias na carga progressiva do catalogo

## Stack

| Camada | Android | PC / Electron |
|---|---|---|
| UI | React + TypeScript | React + TypeScript |
| Shell nativo | Capacitor | Electron |
| Player | Media3 | HTML5 video + hls.js |
| Estado | Zustand | Zustand |
| Atualizacao | Manifesto APK + instalacao no app | `electron-updater` + GitHub Releases |
| Testes | Vitest, Playwright, testes Android | Vitest, testes Electron, Playwright |

## Estrutura principal

```text
src/
  components/   shell, trilhos, cards, player e rodape
  hooks/        navegacao, imagens e estado
  pages/        Home, TV, Musica, Filmes, Series, Busca, Downloads e Player
  platform/     adaptadores de plataforma Android
  services/     Xtream, busca, progresso, recomendacao, categorias e atualizacao
  stores/       estado persistido da biblioteca
  types/        tipos de catalogo, episodios, perfis e filtros

android/
  app/          projeto Android nativo

electron/
  main.cjs      processo principal
  preload.cjs   ponte segura do desktop
```

## Primeiros passos

```bash
npm install
npm run dev
```

Na tela de login informe a URL do seu servidor Xtream Codes, usuario e senha. O catalogo e carregado automaticamente. Para explorar sem servidor, o app pode iniciar com um catalogo local de demonstracao.

## Comandos uteis

```bash
npm run dev
npm run build
npm run lint
npm test
npm run test:e2e
npm run android:apk:debug
npm run android:apk:release
npm run subtitles:serve
```

Consulte [docs/android.md](docs/android.md) para preparar o SDK, configurar a assinatura e gerar o APK.

## Publicacao e versoes disponiveis

### Android

- Linha atual local: `1.4.4`
- Atualizacao distribuida por manifesto consultado pelo app instalado

### PC / Electron

- Release publicada mais recente: `v0.4.13`
- Instalador NSIS com atualizacao automatica
- Versao portatil sem updater automatico

Release publica atual do PC:

- [Play TV X v0.4.13](https://github.com/lu150ml/play_tv/releases/tag/v0.4.13)

## Observacoes

- Downloads completos de temporadas continuam fora do escopo atual
- Arquivos experimentais e `banco_de_dados.html` nao fazem parte do fluxo normal de release
