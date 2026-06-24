# Guia de uso por persona — VDMais Fila Inteligente

Este guia explica **como usar o produto na prática**, do ponto de vista de cada
perfil de usuário. Para subir o ambiente e configurar o projeto, veja o
[README](../README.md).

Cada seção descreve **quem é a persona**, **qual tela ela usa**, e a
**jornada passo a passo**.

---

## Visão geral dos perfis

| Persona | Tela | O que faz |
| --- | --- | --- |
| **Representante (RE)** | `/fila/:erId` | Entra na fila e acompanha a própria senha |
| **Operadora** | `/operacao` | Chama, atende, rechama e finaliza senhas no caixa |
| **Atendente (check-in)** | `/checkin` | Coloca a RE na fila quando ela não consegue sozinha |
| **Gestora** | `/gestao` | Abre/encerra o dia, acompanha métricas e corrige exceções |
| **Administrador** | `/admin` | Cria ERs, caixas e contas de equipe |
| **Painel/TV** | `/painel/:erId?token=...` | Exibe as chamadas para todo o salão (token de exibição) |

> O fluxo de configuração inicial é sempre: **Admin → Gestora abre o dia →
> Operadoras abrem os caixas → REs entram na fila**.

---

## 1. Representante (RE) — a cliente da fila

**Quem é:** a revendedora/representante de estética que chega ao Espaço de
Relacionamento e precisa ser atendida.

**Como entra na fila (3 canais):**

1. **QR Code (preferencial):** escaneia o QR Code assinado exposto no ER.
2. **Link alternativo:** acessa o link assinado e confirma o ER antes de
   continuar.
3. **Check-in assistido:** quando está sem celular/internet, um atendente a
   coloca na fila (ver persona Atendente).

**Jornada passo a passo:**

1. Acessa a fila pelo QR Code ou link.
2. Faz **login** (código de RE ou CPF + senha) ou cria um **cadastro mínimo**
   (nome, CPF, data de nascimento, telefone, código de RE).
3. O sistema valida os dados e verifica se ela já tem senha ativa naquele ER
   (não é permitido ter duas).
4. A senha é gerada e ela vai para a tela `/fila/:erId/senha`, que mostra:
   - **o código da senha** (ex.: `A012`);
   - a **posição atual** na fila;
   - botões de **pausar**, **retomar** e **sair da fila**.
5. Ela acompanha a chamada pelo **painel de TV** do salão.

**Ações disponíveis na tela da senha:**

- **Pausar ("Não estou pronta"):** sai temporariamente da fila sem perder o
  cadastro. O tempo pausado **não conta** nas métricas de espera. A pausa tem
  tolerância (padrão 5 min): se a RE não retomar a tempo, a senha volta
  automaticamente ao **fim** da fila (não é mais cancelada).
- **Retomar:** volta à sua **posição original**, ficando atrás apenas das senhas
  **preferenciais** que entraram durante a pausa.
- **Sair da fila:** cancela a própria senha. Para voltar, precisa entrar de novo.

> Se a RE fechar a página e voltar pelo mesmo acesso, o sistema **recupera a
> senha ativa** após o login.

> Se o acesso estiver inválido ou expirado, a RE deve ler o QR Code atualizado
> ou pedir um novo link à equipe. Não há CAPTCHA.

---

## 2. Operadora — quem conduz o atendimento no caixa

**Quem é:** a profissional que opera um caixa e atende as REs.

**Tela:** `/operacao`

**Início da operação:**

1. Faz login com a conta de **operadora**.
2. Seleciona um caixa livre e clica em **Assumir e abrir caixa**.
   - Uma operadora opera **um caixa por vez**; um caixa pertence a **uma
     operadora por vez**.

**Atendendo a fila:**

1. **Chamar próximo:** chama a próxima senha em espera — **preferenciais primeiro**
   (atendimento preferencial, Lei 10.048), depois por ordem de chegada. A operação é
   atômica — **duas operadoras nunca chamam a mesma senha**. A senha vai para
   **Chamando** e aparece no painel de TV.
2. Quando a RE chega ao caixa:
   - **Iniciar atendimento:** a senha passa a **Em atendimento**.
   - **Finalizar atendimento:** conclui; o caixa volta a ficar disponível para a
     próxima chamada.
3. Se a RE **não aparece de imediato**:
   - **Chamar novamente:** dispara uma **segunda chamada** da mesma senha (re-anuncia
     e faz o cartão piscar de novo no painel), **sem mexer na fila**.
   - **Não compareceu:** encerra a senha como _não compareceu_ e libera o caixa.

> Se a senha ficar em chamada além da tolerância (padrão 10 min) sem ação, o
> sistema a marca como _não compareceu_ automaticamente e libera o caixa, para
> que ele não fique preso.

**Atendimento preferencial:**

- No menu (⋯) de uma senha em **Aguardando**, use **Marcar preferencial** /
  **Remover preferencial** — idosos, gestantes, lactantes, pessoas com deficiência,
  com crianças de colo e obesos (Lei 10.048). A senha preferencial passa à frente
  das normais; entre preferenciais, vale a ordem de chegada. No check-in assistido,
  o atendente pode já incluir a RE como preferencial. A gestora também pode
  marcar/remover na fila ativa.

**Pausa do caixa:**

- **Pausar caixa** (com motivo) quando precisar de um intervalo — o caixa deixa
  de receber chamadas e não conta como capacidade ativa.
- **Retomar caixa** para voltar a operar.

**Regra importante:** não é possível chamar a próxima senha com um atendimento em
aberto no mesmo caixa — finalize ou registre não comparecimento antes.

---

## 3. Atendente (check-in) — apoio à entrada na fila

**Quem é:** a pessoa que coloca a RE na fila quando ela não consegue sozinha
(sem celular, sem internet, dificuldade no cadastro).

**Tela:** `/checkin`

**Jornada passo a passo:**

1. Faz login com a conta de **atendente**.
2. **Busca** a RE por CPF, telefone ou código de RE.
3. Se a RE **já existe**, confirma os dados e gera a senha.
4. Se **não existe**, faz um **cadastro mínimo** e gera a senha na sequência.
5. Entrega o código da senha para a RE acompanhar pelo painel.

> As senhas criadas por aqui ficam registradas com o canal **check-in assistido**,
> o que permite acompanhar quanto da fila veio por esse caminho.

---

## 4. Gestora — quem comanda a operação do dia

**Quem é:** a responsável pela unidade, que abre/encerra a operação e acompanha
os indicadores.

**Tela:** `/gestao`

**Rotina:**

1. Faz login com a conta de **gestora** (e seleciona o ER, se necessário).
2. **Abrir operação** no início do dia — é o que habilita as REs a entrarem na
   fila e as operadoras a chamarem. Se a operação do dia anterior tiver ficado
   **sem encerramento**, a abertura **saneia** as sobras: senhas pendentes do dia
   anterior são encerradas automaticamente (a RE já não está na loja) e os caixas
   são liberados, desbloqueando a operação do novo dia.
3. Durante o dia, acompanha em tempo real:
   - **Métricas:** aguardando, pausados, espera média/mediana, atendimento
     médio/mediano, tempo entre chamada e início, finalizados, não
     comparecimentos, cancelamentos, restaurações, encerramentos automáticos na
     virada de dia, caixas ativos/pausados;
   - **Distribuição:** por canal de entrada, por hora, horários de pico,
     atendimentos por caixa e por operadora;
   - **Fila e caixas:** quem está aguardando, em chamada e em atendimento.
4. **Encerrar operação** ao final do dia.

**Exceções que a gestora resolve:**

- **Cancelar** qualquer senha com motivo.
- **Restaurar** uma senha que ficou como _não compareceu_ — ou que foi
  _cancelada antes do atendimento_ (ex.: cancelamento indevido). A senha volta
  para o **fim** da fila (diferente da rechamada da operadora, que é uma segunda
  chamada da senha que ainda está em chamada). Senhas canceladas **após o início
  do atendimento** não podem ser restauradas, e a restauração é bloqueada se a RE
  já tiver outra senha ativa.
- **Corrigir** um atendimento que ficou em aberto (finalizar ou cancelar).
- **Liberar caixa** quando uma operadora abandona o caixa (saiu sem fechar, a
  sessão expirou). A senha em aberto é resolvida automaticamente (finalizada ou
  marcada como não compareceu) e o caixa volta a ficar disponível.

> Ao **encerrar a operação do dia**, atendimentos que ficaram em aberto são
> finalizados automaticamente, e senhas em chamada paradas além da tolerância
> são encerradas como não comparecimento por um processo automático.

---

## 5. Administrador — quem prepara os ERs

**Quem é:** o responsável global pelo SaaS. **Não pertence a um ER específico** —
pode administrar vários.

**Tela:** `/admin`

**Jornada passo a passo:**

1. Faz login com a conta **ADMIN**.
2. Cria um **ER** (Espaço de Relacionamento).
3. Em **Gerenciar ER**:
   - cadastra os **caixas** físicos;
   - cria as contas de **gestora**, **operadoras** e (se usar) **atendente**;
   - copia/testa os acessos do ER:
     - **QR Code presencial** — URL assinada válida por 24 horas (QR digital, regerado a cada dia);
     - **Link alternativo** — URL assinada válida por 24 horas e com confirmação
       do ER;
     - **Painel de TV** — gera o **token de acesso** e copia a URL com o token
       para abrir na TV do salão. O token pode ser revogado ou regerado a
       qualquer momento se o endereço vazar.
4. Entrega os acessos à equipe e o ER está pronto para operar.

> A validade aparece ao lado de cada acesso. Quando expirar, copie a nova URL e
> regenere o QR Code ou redistribua o link. QR Codes antigos sem `#entry=` não
> funcionam nesta versão.

---

## 6. Painel/TV — a vitrine da fila

**O que é:** a tela exibida na TV do salão, em `/painel/:erId`. Não exige perfil
de usuário, mas o acesso é protegido por um **token de exibição** gerado na
administração: a URL da TV inclui `?token=...`. Sem token válido, o painel
(HTTP e tempo real) é recusado. O token é revogável e atrelado ao ER.

**O que mostra:**

- **Chamando agora:** um cartão por caixa em chamada (1 grande, vários em grade).
  A chamada **mais recente pisca** para chamar atenção. É aqui que aparece a
  segunda chamada (rechamada) da operadora.
- **Em atendimento:** as senhas que já foram para o caixa.
- **Próximas senhas:** a fila à frente. A **primeira fica fixa** (a próxima a ser
  chamada) e as demais entram em **rodízio automático** quando há mais do que
  cabem na tela, para que toda a fila apareça ao longo do tempo.
- **Tempos médios:** espera e atendimento.
- **Cabeçalho:** título e relógio com data e hora (com segundos).
- **Operação encerrada:** com o dia fechado, a TV troca o quadro de chamadas por
  uma tela **"Atendimento encerrado por hoje"** (cabeçalho e relógio seguem
  visíveis), em vez de parecer uma fila vazia em operação.

**Privacidade:** o painel mostra apenas a senha, o **primeiro nome + inicial** e o
caixa de destino. Nunca expõe CPF, telefone, código completo de RE ou data de
nascimento.

---

## Ciclo de vida da senha (resumo)

```
Aguardando → Chamando → Em atendimento → Finalizado
                 │              
                 ├─→ Não compareceu  (operadora; pode restaurar → Aguardando, no fim)
                 ├─→ Não compareceu  (automático: tempo limite de chamada excedido)
                 └─→ Chamar novamente (operadora; segunda chamada, continua Chamando)

Aguardando → Pausado → Aguardando (RE pausa/retoma; retomada manual mantém a posição; timeout vai ao fim)
Aguardando/Pausado → Cancelado    (RE sai da fila, ou staff cancela com motivo)
Cancelado (antes do atendimento) → Aguardando (gestora restaura → fim da fila)

Encerramento do dia: Em atendimento em aberto → Finalizado (automático)
Liberação de caixa (gestora): senha em aberto resolvida + caixa liberado
Virada de dia sem encerramento: senhas pendentes do dia anterior →
Não compareceu (encerramento automático, evento ticket_force_closed);
caixas liberados (counters_reset_for_day)
```

---

## Dicas de operação

- **QR Code é o canal principal.** Link e check-in assistido são apoio.
- **Uma senha ativa por RE por ER** — o sistema bloqueia duplicidade.
- **Rechamar antes de marcar não comparecimento** — dá uma segunda chance à RE
  que está por perto mas não ouviu a primeira chamada.

---

## Documentação relacionada

- [README](../README.md) — setup local e visão geral
- [MVP — escopo e validação](./mvp.md) — o que está dentro e fora do produto
- [Arquitetura Backend](./arquitetura-backend.md) · [Arquitetura Frontend](./arquitetura-frontend.md) — referência técnica
