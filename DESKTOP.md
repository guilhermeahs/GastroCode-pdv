# Desktop (instalador)

## Objetivo
Rodar o PDV como app de desktop com dados persistidos no Windows (`AppData`).

## Onde os dados ficam
- Banco SQLite: `%APPDATA%\\AppGestaoLoja\\appgestao.db`
- Se existir `appgestao.db` antigo na raiz do projeto, ele e migrado automaticamente no primeiro start.

## Scripts
- `npm run dev:desktop`
  - sobe API + Vite + Electron em modo desenvolvimento
- `npm run desktop`
  - build do frontend e abre o app Electron
- `npm run build:desktop`
  - gera instalador Windows (NSIS) na pasta `release`
- `npm run build:desktop:publish`
  - gera instalador + metadados de update (`latest.yml`) para publicar
- `npm run publish:github`
  - publica no GitHub Releases (quando `GH_OWNER`, `GH_REPO` e `GH_TOKEN` estiverem definidos)

## Requisitos
- Node `v22` (padrao do projeto, veja `.nvmrc`)
- Em Node fora do padrao (ex.: v24), o `better-sqlite3` pode falhar no `npm install`

## Fluxo recomendado
1. `npm install`
2. `npm run dev:desktop`
3. Para gerar instalador: `npm run build:desktop`

## Auto-update (sem reinstalar)
- URL base no `package.json`: `https://example.com/appgestaoloja/updates`
- Para ambiente real, sobrescreva via variavel:
  - PowerShell: `$env:APPGESTAO_UPDATE_URL="https://seu-dominio.com/updates"`
- Alternativa sem variavel de ambiente:
  - No app: **Configuracoes > Atualizacao do aplicativo > URL de publicacao do update**
  - Salve a URL e clique em **Verificar atualizacao**
- Para desativar manualmente em um ambiente:
  - PowerShell: `$env:APPGESTAO_DISABLE_UPDATER="1"`
- Gere build com publicacao:
  - `npm run build:desktop:publish`
- Suba os arquivos de `release/` (especialmente `latest.yml` e `.exe`) para essa URL.
- O build agora injeta changelog no `latest.yml` usando `CHANGELOG.md` (ou `APPGESTAO_RELEASE_NOTES`).
- O script pos-build copia automaticamente instalador + `latest.yml` para `publicar/`.
- No app instalado, a aba **Configuracoes > Atualizacao do aplicativo** permite:
  - Verificar atualizacao
  - Reiniciar e instalar quando o download concluir
  - Visualizar o changelog da nova versao quando disponivel

## Publicar no GitHub Releases (automatico)
1. Crie um repositorio no GitHub (publico ou privado).
2. Gere um token com permissao de `contents:write` no repositorio.
3. No PowerShell, configure:
   - `$env:GH_OWNER="seu-usuario-ou-org"`
   - `$env:GH_REPO="nome-do-repo"`
   - `$env:GH_TOKEN="seu-token"`
4. Publique:
   - `npm run publish:github`
5. O Electron Builder envia `latest.yml`, `.exe` e `.blockmap` para o Release da versao.

Opcional (persistente no Windows para nao precisar repetir):
- `setx GH_OWNER "seu-usuario-ou-org"`
- `setx GH_REPO "nome-do-repo"`
- `setx GH_TOKEN "seu-token"`

Observacao:
- Para o updater reconhecer versao nova, aumente a versao no `package.json` antes de publicar (ex.: `1.0.8`).

## Icone e assinatura
- Icone atual do instalador/app: `build/icon.ico`
- Para usar sua marca, substitua esse arquivo por um `.ico` final.
- Assinatura digital:
  - `electron-builder` assina automaticamente se `CSC_LINK` e `CSC_KEY_PASSWORD` estiverem definidos no ambiente.
