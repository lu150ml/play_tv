# Relatorio educativo: catalogo Xtream, navegacao e player

Este documento explica o que aconteceu, por que parecia funcionar, quais erros apareceram e quais decisoes tecnicas foram tomadas. A ideia e servir como um tutorial para voce entender o raciocinio por tras do projeto.

## 1. O primeiro erro: conexao falsa

Na primeira versao, o botao `Connect` simulava uma conexao. A tela mudava para o catalogo, mas os dados vinham de `mockCatalog`, um catalogo local de demonstracao.

Isso e comum em MVPs: primeiro se valida a interface, depois se troca a fonte de dados. O problema e que, para um player IPTV, "conectar" precisa significar tres coisas reais:

- validar usuario e senha no servidor;
- buscar categorias disponiveis;
- buscar canais, filmes e series do provedor.

Decisao tomada: implementar um adaptador Xtream Codes usando `player_api.php`. Agora a app chama o servidor real, valida `user_info.auth` e substitui o catalogo demo pelo catalogo vindo do servidor.

## 2. O segundo erro: CORS no navegador

Muitos servidores IPTV nao permitem chamadas diretas feitas pelo navegador. Mesmo que a URL esteja certa, o browser pode bloquear a resposta por CORS.

Por isso foi criado um proxy local no Vite:

```text
/api/xtream -> http://servidor/player_api.php
```

Decisao tomada: o frontend fala com `/api/xtream`, e o dev server encaminha a chamada para o servidor Xtream. Isso deixa o login e o carregamento de catalogo funcionando no ambiente local.

## 3. O terceiro erro: catalogo real sem navegacao clara

O filtro de tipo ja existia dentro do painel de busca, mas isso nao era claro para uso em TV ou controle remoto.

Em uma experiencia parecida com streaming, o usuario espera ver opcoes diretas:

- Todos;
- TV ao vivo;
- Filmes;
- Series.

Decisao tomada: adicionar botoes grandes de navegacao por tipo. Eles funcionam com mouse, toque, teclado e controle remoto, e mostram a quantidade de itens carregados em cada grupo.

## 4. O quarto erro: player visual sem video real

Antes, a tela de reproducao era bonita, mas nao tinha um elemento `<video>` tocando a URL do servidor. Por isso a midia nunca iniciava.

Decisao tomada: adicionar um video real e ligar o player ao campo `streamUrl` vindo do catalogo.

Para filmes e muitos VODs, o stream costuma ser algo como:

```text
/movie/usuario/senha/id.mp4
```

Para TV ao vivo, o stream costuma ser:

```text
/live/usuario/senha/id.m3u8
```

O Chrome nao toca HLS `.m3u8` nativamente em todos os casos. Por isso foi adicionado `hls.js`, que permite tocar HLS no Chrome e em muitos ambientes Android TV.

## 5. O quinto erro: series nao sao videos diretos

Este foi o detalhe mais importante. No Xtream, uma serie do catalogo nao e uma midia unica. Ela e uma pasta/logica de temporadas e episodios.

O fluxo correto e:

1. buscar a lista de series com `get_series`;
2. quando o usuario abre uma serie, chamar `get_series_info`;
3. ler os episodios retornados;
4. montar a URL real do episodio:

```text
/series/usuario/senha/episode_id.mp4
```

Decisao tomada: o player agora carrega episodios sob demanda. Quando voce abre uma serie, ele busca os episodios, seleciona o primeiro e mostra botoes para trocar de episodio.

## 6. Por que a reproducao ainda pode falhar em alguns servidores

Mesmo com o player real, IPTV tem alguns pontos fora do controle da interface:

- stream offline;
- URL expirada;
- usuario sem permissao para aquele item;
- formato nao suportado pelo navegador;
- servidor bloqueando CORS em segmentos HLS;
- servidor aceitando catalogo, mas bloqueando streaming fora do app oficial.

Por isso o player agora mostra mensagens de erro dentro da tela. Essas mensagens ajudam a separar erro de interface de erro do provedor.

## 7. Decisoes importantes

- Mantive o catalogo demo como fallback inicial para desenvolvimento.
- O login real substitui o catalogo demo quando a conexao Xtream funciona.
- Os botoes de tipo foram colocados fora da busca porque navegacao de TV precisa ser obvia e rapida.
- A reproducao nao tenta autoplay agressivo. O usuario aciona Play, o que evita bloqueios comuns do navegador.
- Series carregam episodios sob demanda para nao travar o login baixando informacao demais.
- As credenciais da conexao ficam apenas no estado da sessao para buscar episodios; elas nao sao persistidas no `localStorage`.

## 8. Como testar mentalmente daqui para frente

Quando algo nao tocar, pense nesta ordem:

1. O login validou?
2. O catalogo apareceu como `Xtream server catalog`?
3. O item tem `streamUrl` direto ou e uma serie?
4. Se e serie, os episodios apareceram?
5. Ao clicar Play, aparece erro no player?
6. O erro parece de app, formato, CORS ou servidor?

Esse raciocinio ajuda a depurar sem sair mudando codigo aleatoriamente.
