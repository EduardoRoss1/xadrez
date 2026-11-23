# Front-end Xadrez Web

## Jogar contra a máquina

Faça login, abra **Jogar**, selecione **Fácil**, **Médio** ou **Difícil** e clique em
**Jogar contra a máquina**. O jogador usa as brancas e o computador responde com
as pretas. Essas partidas aparecem no histórico e não alteram o Elo.

- Fácil: sorteia uma jogada legal.
- Médio: busca minimax de até 2 meios-lances, com avaliação de material e posição.
- Difícil: busca de até 3 meios-lances, com poda alfa-beta e limite de 6.000 nós.
  A busca usa a última profundidade concluída quando atinge o limite.

A máquina roda em Java, no servidor, sem serviço externo. É uma IA simples para
treino, sem equivalência a um Elo oficial. O estado do tabuleiro fica em memória,
como nas demais partidas do projeto; reiniciar o servidor reinicia o tabuleiro.

Endpoint: `POST /matches/computer?userId=ID&difficulty=EASY|MEDIUM|HARD`.
As rotas existentes de tabuleiro e jogadas também atendem essas partidas.
`ComputerPlayer` contém a busca; `MatchService` coordena a resposta automática.

Para validar: `bash mvnw test -Dspring.datasource.url='jdbc:h2:mem:tests;DB_CLOSE_DELAY=-1'`.

Este front-end foi criado dentro do próprio projeto Spring Boot, em:

`src/main/resources/static`

Assim, ao rodar o backend, o front abre no navegador pelo mesmo endereço da API.

## Como executar

1. Abrir o projeto no VS Code ou IntelliJ.
2. Rodar a aplicação Spring Boot.
3. Acessar no navegador:

`http://localhost:8080`

## Funcionalidades implementadas no front

- Tela inicial responsiva.
- Cadastro de usuário.
- Login de usuário.
- Perfil do usuário.
- Atualização de usuário.
- Exclusão de usuário.
- Listagem de usuários para demonstrar CRUD.
- Histórico de partidas do usuário.
- Procurar partida.
- Cancelar busca de partida.
- Criar partida manual para apresentação.
- Tela de jogo com tabuleiro 8x8.
- Seleção de origem e destino da jogada.
- Envio da jogada para o backend.
- Atualização manual e automática do tabuleiro.
- Mensagem para partida não encontrada.

## Observação importante

O backend não possui WebSocket. Por isso, a atualização em tempo real foi simulada com polling, ou seja, o front consulta o tabuleiro automaticamente a cada alguns segundos.

## Duração e última jogada

O histórico mostra o tempo decorrido desde a criação da partida. Ao finalizar
(por mate, desistência ou encerramento), a duração fica fixa. Reiniciar o tabuleiro
reinicia essa contagem. Partidas antigas sem data inicial mostram “Não disponível”.

O tabuleiro informa a última jogada do oponente em texto e destaca suas duas casas
em amarelo, com **O** (origem) e **D** (destino). O motor mantém um último lance por
cor, inclusive contra a máquina; movimentos inválidos e a análise da IA não alteram
esse registro. No playground, é exibido o último lance do lado que acabou de jogar.

No alto contraste, o último lance usa contorno ciano tracejado e marcas O/D. Os
movimentos possíveis continuam como bolinhas/amarelas ou anéis de captura. As casas
possuem rótulos para leitor de tela com coordenada, peça, cor e indicação do lance.

As durações são persistidas pelas datas da partida. O último lance permanece em
memória junto com o tabuleiro, seguindo a arquitetura atual: reiniciar o servidor
perde o estado do tabuleiro, enquanto o histórico e as datas continuam no banco.

Testes do frontend (com Node instalado): `node --test tests/match-display.test.cjs tests/narration.test.cjs`.

## Histórico vertical e peças capturadas

O histórico do Perfil mostra um cartão completo por vez, com rolagem vertical,
encaixe dos cartões e botões de anterior/próxima (↑ e ↓). Use a roda do mouse,
deslize verticalmente no celular ou, com foco no histórico, use as teclas cima/baixo,
Home e End. A altura se adapta ao conteúdo e ao tamanho da tela. Não há rotação
automática; a preferência por movimento reduzido é respeitada.

Acima e abaixo do tabuleiro aparecem as peças capturadas **pelas pretas** e
**pelas brancas**, com total de peças e agrupamento por tipo (por exemplo, peão ×2).
As capturas vêm do motor de regras, incluindo en passant e capturas com promoção.
Reiniciar a partida limpa os dois contadores. Ícones recebem descrição textual para
leitores de tela e fundos contrastantes no modo de acessibilidade.

## Narração por voz

O botão **Narração por voz**, ao lado de **Alto contraste**, liga a leitura em áudio.
A escolha fica salva no navegador, como no alto contraste. A voz é a do próprio
navegador (Web Speech API, em português do Brasil), sem serviço externo.

Com a narração ativa, o site fala:

- todos os lances, com quem jogou (você, oponente, máquina, ou brancas/pretas no
  playground), peça, casas de origem e destino, captura, promoção e roque;
- a peça selecionada e a lista de casas para onde ela pode ir, ou o motivo de não
  poder ser selecionada (por exemplo, "Aguarde seu turno.");
- xeque, xeque-mate, empate, "Sua vez", o resumo ao abrir uma partida e o fim de jogo;
- os avisos do site, a tela aberta, o status da busca de partida e "Máquina pensando…";
- o botão, link ou campo sob o mouse ou com foco do teclado (as casas do tabuleiro
  dizem coordenada, peça e cor);
- qualquer texto selecionado com o mouse ou com Shift + setas.

Avisos do jogo têm prioridade: interrompem a leitura do mouse, que é substituída
quando o mouse passa para outro botão, para não acumular atraso. Ao recarregar a
página com a narração ativa, o navegador só libera o áudio após o primeiro clique ou
tecla; as falas pendentes são reproduzidas nesse momento. O código fica em
`narrator.js`; os textos dos lances, em `match-display.js`.

## Hospedar online de graça (Render)

O `Dockerfile` na raiz empacota o projeto inteiro (API + front) para rodar na nuvem.
O Render tem plano gratuito para isso e gera um endereço `https://….onrender.com`
acessível por qualquer pessoa.

1. Crie um repositório no GitHub (ex.: `xadrez-web`) e envie o projeto, na pasta dele:
   ```bash
   git init
   git add .
   git commit -m "Xadrez Web"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/xadrez-web.git
   git push -u origin main
   ```
   O `.gitignore` já deixa de fora `target/` e o banco local `data/`.
2. Em https://render.com, entre com a conta do GitHub e clique em
   **New → Web Service**. Escolha o repositório.
3. Confirme **Language: Docker** (detectado pelo `Dockerfile`) e **Instance Type: Free**.
   Clique em **Create Web Service**. O primeiro build leva alguns minutos.
4. Quando aparecer **Live**, o link fica no topo da página do serviço.

Limitações do plano gratuito:

- Sem acessos por ~15 minutos, o serviço "dorme"; o próximo acesso leva cerca de
  1 minuto para acordar. **Abra o link uns minutos antes de apresentar.**
- O banco é apagado quando o serviço dorme, reinicia ou recebe um novo deploy. As
  contas `demo` e `guest` são recriadas; crie as demais durante a apresentação.
- O processador é mais lento: a máquina no nível Difícil pode levar alguns segundos.
- A conta admin `demo` usa a senha `demo`. Com o site público, entre como `demo`
  e troque a senha em **Perfil** antes de divulgar o link (volta para `demo` quando o
  banco é apagado).

Cada `git push` para a branch `main` gera um novo deploy automaticamente.
