# Manutenção com IA

Estas instruções se aplicam a solicitações feitas pelos botões da extensão no Windows do usuário. Trabalhe somente no escopo pedido, preserve alterações alheias e não copie credenciais para issues, commits ou logs.

## Localizar os fontes

O pedido contém a raiz da instalação e os fontes editáveis. Por padrão, a raiz é `%LOCALAPPDATA%\MulticaExtensoes`. Confira installation.json para sourceRoot, profile, archive e backup.

- `data/docs/*.md`: documentação viva.
- `versions/1.0.0/src/ui`: interface de Docs e Marketplace.
- `versions/1.0.0/src/main/modules.cjs`: backend.
- `versions/1.0.0/pool`: interface e adaptadores do Pool.
- `data/docs/_history`: versões anteriores dos documentos.

Releia o documento imediatamente antes de sobrescrever para não perder uma edição humana. Mantenha versões anteriores quando fizer alterações importantes.

## Alterações de interface

Os fontes são externos ao ASAR. Reabrir uma aba carrega alterações de HTML, CSS e JavaScript. Não é preciso reconstruir o Multica para editar documentos ou a interface dos módulos.

Não coloque dados remotos em innerHTML. O Markdown permite texto, títulos, listas, código e links HTTPS. Credenciais ficam no backend; o frontend usa IPC com origem verificada.

## Alterações do backend ou menu

Backend exige reiniciar a interface. Menu e rotas exigem gerar um novo pacote a partir do original verificado. Use os scripts do repositório; não edite app.asar em uso nem desative fuses ou verificações de assinatura.

Instalar.ps1 foi feito para execução manual na sessão do Windows. Dentro de um agente, use somente PrepareOnly para validar um pacote e entregue o resultado para instalação pelo usuário. Esse limite evita misturar as credenciais de tarefa com o perfil humano do desktop.

## Preservar tarefas

Nunca encerre multica.exe pelo nome. Use o CLI para identificar o daemon e compare o PID antes de qualquer ação de manutenção. O instalador termina somente o PID verificado da interface, preservando o daemon. Se a verificação falhar, a instalação recusa encerrar processos.

Não publique código, altere agentes ou envie mensagens externas além do que o pedido autoriza.

## Testes

- Docs: editar, histórico, conflitos e bloqueio de nomes fora da pasta.
- IA: somente agentes deste PC e workspace; criação pelo CLI com arquivo de descrição.
- Marketplace: busca, paginação, detalhes, tratamento de erros e isolamento por ID de usuário.
- OAuth: valide o contrato com mocks; a autorização real pertence ao usuário no navegador.
- Instalador: preparar, aplicar, reinstalar sem duplicar, reverter por hash e recusar builds desconhecidos.

Relate o que mudou, o que foi verificado e qualquer limitação concreta.
