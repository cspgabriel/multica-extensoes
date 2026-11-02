# Temas do Multica

Abra **Temas** no menu do workspace ou no cabeçalho de Marketplace e Docs. Há dez paletas, com prévias, busca e filtros para temas claros e escuros.

| Tema | Aparência | Paleta |
|---|---|---|
| Aurora | Escura | Azul da noite e violeta |
| Grafite | Escura | Cinza mineral e turquesa |
| Oceano | Escura | Azul profundo e ciano |
| Floresta | Escura | Verde profundo e menta |
| Ametista | Escura | Ameixa e lilás |
| Café | Escura | Chocolate e âmbar |
| Porcelana | Clara | Branco suave e índigo |
| Areia | Clara | Papel quente e terracota |
| Jardim | Clara | Sálvia e verde botânico |
| Céu | Clara | Azul claro e cobalto |

**Aplicar** salva a escolha neste desktop. O tema modifica os tokens da interface nativa, incluindo chat, menus e barras laterais, e acompanha as páginas Marketplace, Docs e Pool de Contas IA. As miniaturas usam a mesma paleta aplicada pelo aplicativo.

**Voltar ao tema original** remove somente a preferência da extensão. A seleção original de aparência clara, escura ou do sistema é preservada. Enquanto um tema personalizado está ativo, ele define o modo claro/escuro; para voltar ao controle nativo, use a restauração.

Nada é salvo no workspace ou enviado para serviços externos. Outras janelas abertas na mesma origem recebem a preferência por evento de armazenamento; os módulos locais recebem apenas o ID validado do tema, por uma ponte vinculada ao iframe. Erros de armazenamento são mostrados sem informar uma seleção salva que não ocorreu.

## Desenvolvimento e validação

Os valores primitivos estão em `src/themes/catalogue.js`. `lib/themes.cjs` gera os tokens semânticos para o Multica e os adaptadores dos módulos. Os componentes usam esses tokens, sem substituir fontes, espaçamentos ou identidade dos provedores do Pool.

- `npm run build:themes`: atualiza a folha de estilos compartilhada.
- `npm test`: verifica as dez paletas, contraste de texto de pelo menos 4,5:1 nas superfícies previstas, persistência, restauração, isolamento da ponte e compatibilidade do patch. Isso não constitui uma auditoria completa de acessibilidade do aplicativo.
- `npm run test:themes:browser`: QA opcional em Chromium, com Playwright instalado no ambiente de desenvolvimento; usa uma interface nativa simulada e o código real da galeria, sem contas reais. Evidências em `dist/qa-themes`.
- `npm run preview:themes`: gera um HTML independente com os dez temas. Essa prévia não altera o Multica instalado.

A instalação no aplicativo continua sujeita ao build original verificado e à execução manual do instalador na sessão do Windows. A lista de hashes aceitos e as verificações de integridade não são ampliadas por este recurso.
