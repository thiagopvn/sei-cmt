# Pauta

Aplicativo (PWA) para organizar a vida pessoal e profissional em um só lugar: **escala de serviços e trocas**, **finanças** (contas, cartões, valores a receber), **tarefas com prazo**, **rotinas**, **compromissos** e **cronômetro**. Instala no celular, funciona sem internet e avisa os prazos.

## O que o app faz

**Início (painel inteligente)**
- Mostra se você está de serviço agora ou de folga, e quando é o próximo serviço.
- **Radar** que cruza todos os módulos: tarefas atrasadas, prazos próximos, contas a vencer, fatura fechando, serviço pago sem pagamento, trocas pendentes e **conflitos com o dia de serviço** (ex.: prova, prazo ou buscar a filha num dia em que você está de serviço).
- Agenda de hoje (com rotinas para marcar) e próximos 7 dias.
- **Captura rápida em português**: `Enviar PAD até sexta #pad !alta`, `Buscar filha na creche toda terça e quinta às 17h30 @família`, `Pagar condomínio todo dia 10`.

**Escala**
- Gerador automático: 24×72, 24×48, 24×96, 12×36, 12×60, dias fixos da semana ou a cada N dias.
- Serviços ordinários, extras pagos (com valor), sobreaviso e outros.
- **Trocas**: quem tira o seu serviço e quando você devolve (ou “a combinar”); saldo por colega (quem deve a quem) e botão para conversar no WhatsApp.
- **Pagamentos**: previsão de pagamento de cada serviço extra, avisos de pagamento atrasado e botão “Recebi”.

**Finanças**
- Entradas, saídas e saldo previsto do mês; contas atrasadas.
- Contas fixas mensais ou anuais (aluguel, creche, IPVA…), receitas e despesas avulsas.
- **Cartões de crédito** com dia de fechamento e vencimento; compras parceladas caem sozinhas nas faturas certas; limite usado.
- Serviços extras e trabalhos pagos (TCC, IPM, sindicância…) entram automaticamente em “A receber”.
- Gráficos de para onde vai o dinheiro e de fontes de renda.

**Tarefas**
- Separadas por **áreas** (Trabalho, Faculdade, Concurso, Família, Pessoal; editáveis) para nada se misturar.
- Tipos com passo a passo pronto: Documento, SEI, PAD, Solicitação de material, IPM, Sindicância, TCC, Prova… (modelos editáveis).
- Prazo, prioridade, situação (a fazer, em andamento, aguardando, concluída), nº do processo, avisos X dias antes, valor a receber.
- Visões: lista por prazo, quadro (arrastar entre colunas), **rotinas** (diárias, semanais, mensais, anuais, com sequência e histórico) e **tempo** (cronômetro/Pomodoro por tarefa, com relatório).

**Agenda**
- Mês com camadas (serviços, prazos, compromissos, rotinas, finanças) e filtro por área; painel do dia; lista dos próximos 45 dias.
- Compromissos de um dia, de vários dias (férias/afastamento) ou repetidos; lembretes.

**Ajustes**
- Lembretes (horário, antecedência de prazos, contas e serviços), notificações do celular, tema claro/escuro.
- Regras de pagamento dos serviços extras, áreas, modelos, categorias financeiras, contatos de colegas.
- **Backup** (exportar/restaurar arquivo) e dados de exemplo.

## Conta e nuvem (Firebase)

Os dados ficam no **Firebase Realtime Database** do projeto `projetodemop`, separados por conta (`users/{uid}/data`), e sincronizam em tempo real entre celular e computador.

- **Login:** e-mail e senha (com “esqueci minha senha”) ou conta Google.
- **Sem internet:** o app abre e funciona com a cópia salva no aparelho; as alterações ficam numa fila e são enviadas quando a conexão volta.
- **Segurança:** as regras em `database.rules.json` só deixam cada conta ler e gravar os próprios dados.
- **Sem conta:** também dá para usar só no aparelho (“Usar sem conta”). Ao entrar depois, o que foi criado no aparelho é juntado à conta.

### Configuração no console do Firebase (uma vez)

1. **Authentication → Começar → Método de login:** ative **E-mail/senha** e **Google**.
2. **Authentication → Configurações → Domínios autorizados:** adicione o domínio onde o app está publicado (ex.: `seu-app.vercel.app`).
3. **Realtime Database → Regras:** cole o conteúdo de `database.rules.json` e clique em **Publicar**.
   (Ou, com a Firebase CLI: `firebase deploy --only database`.)

### Testar com o emulador (opcional, para desenvolvimento)

```bash
npx firebase-tools emulators:start --only auth,database
# em outro terminal
npm start
# abra http://localhost:5173/?emulador
```

## Instalar no celular

1. Publique o site (ex.: Vercel, veja abaixo) e abra o endereço no celular.
2. **Android (Chrome):** menu ⋮ → *Instalar app*. **iPhone (Safari):** Compartilhar → *Adicionar à Tela de Início*.

Os lembretes aparecem com o app aberto ou em segundo plano. Ative as notificações em **Ajustes → Lembretes**. Faça backup também em **Ajustes → Backup** se quiser uma cópia em arquivo.

## Rodar e publicar

Não há dependências nem etapa de build: é HTML, CSS e JavaScript puro (módulos ES). O SDK do Firebase é carregado do CDN oficial (`gstatic.com`) e guardado pelo service worker para funcionar offline.

```bash
npm start   # servidor local em http://localhost:5173
npm test    # testes da lógica (escala, trocas, finanças, recorrência, captura rápida, sincronização…)
```

Para publicar na **Vercel**, importe o repositório como projeto estático (sem build). O `vercel.json` já configura o service worker.

## Estrutura

```
index.html, manifest.webmanifest, sw.js   app, PWA e modo offline
css/app.css                               visual (claro/escuro, celular primeiro)
js/main.js                                navegação, eventos, cronômetro, lembretes
js/store.js                               estado e cópia local
js/cloud/                                 Firebase: login e sincronização (config, lógica de sync, conexão)
database.rules.json                       regras de segurança do Realtime Database
js/domain/                                regras: escala, trocas, finanças, tarefas, agenda, radar
js/views/                                 telas: início, agenda, tarefas, escala, finanças, ajustes, login
js/forms/                                 formulários
js/ui/                                    componentes (janelas, campos, gráficos, captura rápida)
tests/                                    testes automatizados (node --test)
```
