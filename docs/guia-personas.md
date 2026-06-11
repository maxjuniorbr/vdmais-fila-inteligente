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
| **Painel/TV (público)** | `/painel/:erId` | Exibe as chamadas para todo o salão |

> O fluxo de configuração inicial é sempre: **Admin → Gestora abre o dia →
> Operadoras abrem os caixas → REs entram na fila**.

---

## 1. Representante (RE) — a cliente da fila

**Quem é:** a revendedora/representante de estética que chega ao Espaço de
Relacionamento e precisa ser atendida.

**Como entra na fila (3 canais):**

1. **QR Code (preferencial):** escaneia o QR Code exposto no ER → abre
   `/fila/:erId`.
2. **Link alternativo:** acessa `/fila/:erId?source=link` → confirma o ER antes
   de continuar.
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
  cadastro. O tempo pausado **não conta** nas métricas de espera.
- **Retomar:** volta para o **fim** da fila (recebe nova posição).
- **Sair da fila:** cancela a própria senha. Para voltar, precisa entrar de novo.

> Se a RE fechar a página e voltar pelo mesmo acesso, o sistema **recupera a
> senha ativa** após o login.

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

1. **Chamar próximo:** chama a primeira senha em espera. A operação é atômica —
   **duas operadoras nunca chamam a mesma senha**. A senha vai para **Chamando**
   e aparece no painel de TV.
2. Quando a RE chega ao caixa:
   - **Iniciar atendimento:** a senha passa a **Em atendimento**.
   - **Finalizar atendimento:** conclui; o caixa volta a ficar disponível para a
     próxima chamada.
3. Se a RE **não aparece de imediato**:
   - **Rechamar:** dispara uma **segunda chamada** da mesma senha (re-anuncia e
     faz o cartão piscar de novo no painel), **sem mexer na fila**.
   - **Não compareceu:** encerra a senha como _não compareceu_ e libera o caixa.

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
   fila e as operadoras a chamarem.
3. Durante o dia, acompanha em tempo real:
   - **Métricas:** aguardando, pausados, espera média/mediana, atendimento
     médio/mediano, tempo entre chamada e início, finalizados, não
     comparecimentos, cancelamentos, restaurações, caixas ativos/pausados;
   - **Distribuição:** por canal de entrada, por hora, horários de pico,
     atendimentos por caixa e por operadora;
   - **Fila e caixas:** quem está aguardando, em chamada e em atendimento.
4. **Encerrar operação** ao final do dia.

**Exceções que a gestora resolve:**

- **Cancelar** qualquer senha com motivo.
- **Restaurar** uma senha marcada como _não compareceu_ — volta para o **fim**
  da fila (diferente da rechamada da operadora, que é uma segunda chamada da
  senha que ainda está em chamada).
- **Corrigir** um atendimento que ficou em aberto (finalizar ou cancelar).

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
   - copia/testa os três acessos do ER:
     - **QR Code presencial** — o endereço para gerar o QR Code no balcão;
     - **Link alternativo** — com `?source=link`, exige confirmar o ER;
     - **Painel de TV** — endereço público para abrir na TV do salão.
4. Entrega os acessos à equipe e o ER está pronto para operar.

---

## 6. Painel/TV (público) — a vitrine da fila

**O que é:** a tela exibida na TV do salão, em `/painel/:erId`. Não exige login.

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

**Privacidade:** o painel mostra apenas a senha, o **primeiro nome + inicial** e o
caixa de destino. Nunca expõe CPF, telefone, código completo de RE ou data de
nascimento.

---

## Ciclo de vida da senha (resumo)

```
Aguardando → Chamando → Em atendimento → Finalizado
                 │              
                 ├─→ Não compareceu  (operadora; pode restaurar → Aguardando, no fim)
                 └─→ Rechamar        (operadora; segunda chamada, continua Chamando)

Aguardando → Pausado → Aguardando (RE pausa/retoma; volta ao fim da fila)
Aguardando/Pausado → Cancelado    (RE sai da fila, ou staff cancela com motivo)
```

---

## Dicas de operação

- **QR Code é o canal principal.** Link e check-in assistido são apoio.
- **Uma senha ativa por RE por ER** — o sistema bloqueia duplicidade.
- **Rechamar antes de marcar não comparecimento** — dá uma segunda chance à RE
  que está por perto mas não ouviu a primeira chamada.
- **No plano gratuito de hospedagem**, o backend pode "dormir" após inatividade;
  a primeira chamada do dia pode demorar alguns segundos para responder.
