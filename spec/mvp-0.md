## Relação com o MVP Full

O **MVP Full** continua sendo o alvo do produto e deve representar a visão completa discutida até aqui: fila virtual, previsibilidade, segmentação de jornadas, Pedido Expresso, regras avançadas, dados operacionais e evolução da gestão de fluxo dos ERs.

O **MVP 0** é um recorte mínimo para validação inicial. Ele existe para testar a hipótese central e validar o SaaS em operação real com o menor escopo viável.

Este MVP não pretende resolver todos os problemas da fila. Ele deve validar se uma fila digital presencial consegue substituir a fila física informal, organizar a chamada, dar visibilidade à operação e capturar dados mínimos confiáveis de espera e atendimento.

---

## 1. Objetivo do MVP 0

Substituir a fila física informal por uma fila digital presencial, com entrada simples da representante, cadastro/autenticação mínima, chamada por TV/painel, operação pelos caixas e registro dos eventos essenciais.

Objetivo prático:

> Validar o funcionamento operacional do SaaS em um ER, organizando a fila presencial e coletando dados mínimos antes de evoluir para o MVP Full.
> 

---

## 2. O que o MVP 0 valida

O MVP 0 deve validar:

- se a RE consegue entrar na fila digital dentro do ER;
- se a operação consegue usar o sistema sem travar o atendimento;
- se a TV/painel reduz confusão na chamada;
- se a fila digital substitui a fila física informal;
- se o sistema impede múltiplas senhas ativas para a mesma RE no mesmo ER;
- se a chamada por caixa funciona sem conflito entre operadoras;
- se é possível medir tempo de espera e tempo de atendimento;
- se a operação aceita registrar não comparecimento, cancelamento e finalização;
- se o SaaS é estável o suficiente para operação de loja.

---

## 3. Escopo resumido

Dentro do MVP 0:

- fila única presencial;
- entrada por QR Code;
- entrada por link do site;
- check-in assistido por atendente;
- cadastro/autenticação mínima no próprio SaaS/app;
- geração de senha;
- bloqueio de senha ativa duplicada;
- TV/painel de chamada;
- interface da operadora;
- operação por caixa logado;
- chamada do próximo da fila;
- controle de chamada simultânea;
- estados mínimos da senha;
- não comparecimento;
- cancelamento;
- restauração manual excepcional;
- métricas básicas;
- registro de eventos mínimos.

Fora do MVP 0:

- integração com base oficial de REs;
- integração com PDV;
- validação de status oficial da RE;
- validação de elegibilidade comercial;
- Pedido Expresso;
- fila prioritária;
- múltiplas filas;
- entrada remota controlada;
- confirmação de presença;
- geolocalização;
- ETA;
- notificações push;
- WhatsApp;
- SMS;
- reposicionamento;
- reentrada inteligente;
- motor preditivo;
- recomendação de melhor horário;
- analytics comercial;
- ticket médio;
- vínculo com compra, pedido, ofertas ou promoções.

---

## 4. Entrada na fila

A RE poderá entrar na fila por três canais:

1. **QR Code no ER**  
    
    Canal preferencial. A RE escaneia o QR Code dentro da unidade e acessa a fila daquele ER.
    
2. **Link do site**  
    
    Canal alternativo. Deve ser usado com orientação clara para evitar entrada indevida fora do contexto do ER.
    
3. **Check-in assistido**  
    
    Canal operacional. Um atendente inclui a RE na fila quando ela não conseguir se cadastrar, estiver sem celular, sem internet ou precisar de apoio.
    

Recomendação operacional:

> QR Code deve ser o canal principal. Link e check-in assistido existem como fallback.
> 

---

## 5. Cadastro e autenticação mínima

Como o MVP 0 não terá integração com bases corporativas, o cadastro será criado ou validado dentro do próprio SaaS/app.

Campos obrigatórios:

- nome completo;
- CPF;
- data de nascimento;
- telefone celular;
- código de RE;
- login/senha ou autenticação equivalente;
- ER de atendimento, definido pelo QR Code, link ou atendente.

Campos opcionais:

- e-mail;
- aceite de termos/uso de dados;
- canal de entrada;
- observação operacional para check-in assistido.

Validações possíveis no MVP 0:

- preenchimento obrigatório;
- formato básico de CPF, data e telefone;
- CPF já cadastrado;
- telefone já cadastrado;
- código de RE já cadastrado;
- existência de senha ativa no mesmo ER;
- origem da entrada: QR Code, link ou check-in assistido.

Validações fora do MVP 0:

- status oficial da RE;
- RE ativa, inativa ou bloqueada;
- vínculo da RE com aquele ER;
- validade oficial do código de RE;
- elegibilidade comercial;
- regras corporativas de atendimento.

Formulação correta:

> No MVP 0, a autenticação será baseada em cadastro mínimo no próprio SaaS/app, sem validação em tempo real contra a base oficial de representantes. O sistema controlará unicidade, login, senha ativa e rastreabilidade operacional, mas não garantirá elegibilidade comercial plena da RE.
> 

---

## 6. Jornada ponta a ponta da RE

### 6.1 Entrada por QR Code

1. RE chega ao ER.
2. RE escaneia o QR Code da unidade.
3. Sistema abre a página/app da fila daquele ER.
4. RE faz login ou cria cadastro mínimo.
5. Sistema valida dados básicos.
6. Sistema verifica se já existe senha ativa para aquela RE naquele ER.
7. Sistema cria a senha.
8. RE vê sua senha e orientação de acompanhamento.
9. Senha entra na fila em estado **Aguardando**.
10. RE acompanha a chamada pela TV/painel.

Mensagem sugerida:

> Você entrou na fila do ER. Acompanhe sua chamada pela TV. Permaneça atenta ao número da sua senha.
> 

### 6.2 Entrada por link do site

1. RE acessa o link da fila.
2. Seleciona ou confirma o ER.
3. Faz login ou cria cadastro mínimo.
4. Sistema cria senha, se não houver senha ativa.
5. RE recebe senha e orientação.

Risco:

> Este canal pode permitir entrada fora do ER, já que o MVP 0 não possui confirmação de presença.
> 

Mitigações mínimas:

- orientar uso somente no ER ou chegando para atendimento;
- registrar canal de entrada;
- acompanhar no-show por canal.

### 6.3 Check-in assistido

1. RE chega ao ER.
2. Solicita entrada na fila.
3. Atendente acessa a tela de check-in.
4. Atendente busca cadastro por CPF, telefone ou código de RE.
5. Se existir cadastro, confirma dados.
6. Se não existir, cria cadastro mínimo.
7. Sistema cria senha.
8. RE recebe sua senha.
9. Senha entra na fila.

Casos cobertos:

- RE sem celular;
- RE sem internet;
- dificuldade de login;
- erro de cadastro;
- celular descarregado;
- necessidade de apoio operacional.

---

## 7. Estados da senha

Estados mínimos:

1. **Aguardando**  
    
    Senha criada e posicionada na fila.
    
2. **Chamando**  
    
    Operadora chamou a senha. A TV exibe senha, nome abreviado e caixa destino.
    
3. **Em atendimento**  
    
    RE compareceu ao caixa e a operadora iniciou atendimento.
    
4. **Finalizado**  
    
    Atendimento concluído pela operadora.
    
5. **Não compareceu**  
    
    RE foi chamada, mas não compareceu dentro da janela operacional.
    
6. **Cancelado**  
    
    Senha removida antes do atendimento por desistência, erro ou ação operacional.
    
7. **Restaurado**  
    
    Evento de exceção. Uma senha marcada como “não compareceu” pode ser restaurada manualmente por perfil autorizado.
    

Observação:

> Restaurado deve ser tratado preferencialmente como evento. Após restauração, a senha volta para Aguardando.
> 

---

## 8. Jornada ponta a ponta da operadora

### 8.1 Início da operação

1. Operadora acessa o sistema.
2. Faz login.
3. Seleciona ou assume um caixa.
4. Caixa fica em estado **Ativo**.
5. Operadora visualiza a fila atual.
6. Botão **Chamar próximo** fica disponível.

Estados do caixa:

- indisponível;
- ativo;
- chamando;
- em atendimento;
- pausado.

### 8.2 Chamar próximo

1. Operadora clica em **Chamar próximo**.
2. Sistema localiza a próxima senha em estado **Aguardando**.
3. Sistema aplica lock transacional na senha.
4. Sistema vincula a senha ao caixa e à operadora.
5. Senha muda para **Chamando**.
6. TV/painel exibe a chamada.
7. Operadora aguarda a RE comparecer.

Regra crítica:

> Duas operadoras não podem chamar a mesma senha. A operação “chamar próximo” precisa ser atômica.
> 

### 8.3 Iniciar atendimento

1. RE chega ao caixa.
2. Operadora confirma visualmente senha/nome.
3. Operadora clica em **Iniciar atendimento**.
4. Senha muda para **Em atendimento**.
5. TV/painel pode manter a senha em lista de “em atendimento”.
6. Sistema registra horário de início.

### 8.4 Finalizar atendimento

1. Operadora conclui atendimento no PDV.
2. Operadora volta ao SaaS/app.
3. Clica em **Finalizar atendimento**.
4. Senha muda para **Finalizado**.
5. Caixa volta para **Ativo**.
6. Operadora pode chamar o próximo.

Observação:

> Como não há integração com PDV, a finalização no SaaS depende de ação manual da operadora.
> 

Mitigações para esquecimento:

- alerta visual de atendimento em aberto;
- contador de tempo em atendimento;
- bloqueio para chamar próximo enquanto houver atendimento aberto;
- opção de correção pela gestora.

---

## 9. Fluxos de exceção

### 9.1 Não comparecimento

1. Operadora chama a senha.
2. TV exibe a chamada.
3. RE não aparece dentro da tolerância definida.
4. Operadora clica em **Não compareceu**.
5. Senha muda para **Não compareceu**.
6. Caixa volta para **Ativo**.
7. Operadora chama próximo.

Regra padrão:

> RE que não compareceu deve entrar novamente na fila.
> 

### 9.2 Restauração manual

1. RE aparece depois da chamada perdida.
2. Operadora ou gestora localiza senha marcada como **Não compareceu**.
3. Perfil autorizado clica em **Restaurar senha**.
4. Sistema exige motivo.
5. Sistema registra operador, horário e justificativa.
6. Senha volta para **Aguardando**.

Recomendação para MVP 0:

> Restauração volta ao fim da fila.
> 

Motivos possíveis:

- RE estava no salão e não ouviu chamada;
- falha de TV/painel;
- erro operacional;
- orientação da gestora;
- outro.

### 9.3 Cancelamento

A senha pode ser cancelada antes do atendimento.

Motivos mínimos:

- desistência da RE;
- cadastro incorreto;
- senha duplicada;
- entrada indevida;
- erro operacional;
- falha técnica;
- outro.

Regra:

- cancelamento exige motivo;
- registra usuário responsável;
- senha cancelada não volta à fila;
- se necessário, nova senha deve ser criada.

### 9.4 Caixa pausado

1. Operadora clica em **Pausar caixa**.
2. Caixa muda para **Pausado**.
3. Operadora não pode chamar próximo.
4. Caixa não conta como capacidade ativa.
5. Ao retornar, operadora clica em **Retomar caixa**.

Motivos possíveis de pausa:

- intervalo;
- suporte operacional;
- problema técnico;
- fechamento de caixa;
- outro.

---

## 10. TV / painel de chamada

Formato recomendado:

> Senha A023 — Maria S. — Caixa 04
> 

Exibir:

- senha;
- primeiro nome;
- inicial do segundo nome ou sobrenome;
- caixa destino;
- status da chamada.

Não exibir:

- CPF;
- código completo de RE;
- telefone;
- data de nascimento;
- valor de compra;
- informações comerciais;
- status cadastral.

Estrutura sugerida:

### Chamando agora

- A023 — Maria S. — Caixa 04

### Chamadas recentes

- A022 — Ana C. — Caixa 02
- A021 — Joana M. — Caixa 01
- A020 — Carla R. — Caixa 05

### Em atendimento

- A018 — Caixa 03
- A019 — Caixa 06

Diretriz:

> Mostrar pessoas em atendimento é útil para transparência e percepção de fluxo, mas não deve expor dados sensíveis nem tempo individual de atendimento.
> 

---

## 11. Interface da operadora

Funcionalidades mínimas:

- login;
- assumir caixa;
- abrir caixa;
- pausar caixa;
- retomar caixa;
- visualizar fila;
- chamar próximo;
- ver senha chamada;
- iniciar atendimento;
- finalizar atendimento;
- marcar não compareceu;
- cancelar senha, se autorizado;
- restaurar senha, se autorizado;
- visualizar chamadas recentes;
- visualizar atendimentos em andamento;
- visualizar tempo da senha atual;
- visualizar tempo do atendimento atual.

Tela mínima:

- caixa atual;
- status do caixa;
- senha atual;
- tempo desde chamada;
- tempo em atendimento;
- botão **Chamar próximo**;
- botão **Iniciar atendimento**;
- botão **Finalizar atendimento**;
- botão **Não compareceu**;
- botão **Pausar/Retomar**;
- lista curta de aguardando;
- chamadas recentes.

Permissões sugeridas:

**Operadora comum**

- chamar próximo;
- iniciar atendimento;
- finalizar atendimento;
- marcar não compareceu;
- pausar/retomar próprio caixa.

**Atendente/check-in**

- criar cadastro mínimo;
- incluir RE na fila;
- consultar cadastro;
- cancelar senha com motivo.

**Gestora**

- restaurar senha;
- cancelar qualquer senha;
- visualizar todos os caixas;
- corrigir atendimento em aberto;
- encerrar fila do dia;
- consultar indicadores.

---

## 12. Visão da gestora / operação

Funcionalidades mínimas:

- ver fila completa;
- ver caixas ativos;
- ver caixas pausados;
- ver atendimentos em andamento;
- ver chamadas recentes;
- ver senhas não comparecidas;
- ver senhas canceladas;
- restaurar senha com motivo;
- cancelar senha com motivo;
- abrir/encerrar operação do dia;
- consultar métricas básicas.

Indicadores mínimos:

- total de REs aguardando;
- maior tempo de espera atual;
- tempo médio de espera do dia;
- tempo médio de atendimento do dia;
- caixas ativos;
- caixas pausados;
- atendimentos em andamento;
- atendimentos finalizados;
- não comparecimentos;
- cancelamentos;
- volume por hora.

---

## 13. Regras de fila

### 13.1 Tipo de fila

Fila única FIFO.

Sem:

- prioridade;
- Pedido Expresso;
- múltiplas filas;
- reposicionamento;
- ordenação manual;
- fila remota;
- ETA.

### 13.2 Senha ativa

Regra:

> A mesma RE não pode ter mais de uma senha ativa no mesmo ER.
> 

Critérios para detectar duplicidade:

- mesmo CPF;
- mesmo telefone;
- mesmo código de RE;
- mesmo ID de cadastro no SaaS/app.

### 13.3 Chamada simultânea

Regra:

> A próxima senha só pode ser reservada por uma operadora/caixa por vez.
> 

Isso exige lock no backend.

### 13.4 Sem bypass

Regra:

> Operadora chama sempre o próximo da fila.
> 

A operadora não escolhe manualmente quem chamar. Exceções como restauração e cancelamento ficam registradas e exigem permissão adequada.

---

## 14. Eventos mínimos

Eventos obrigatórios:

```
queue_entry_started
representative_login_started
representative_authenticated
representative_created_or_updated
ticket_creation_requested
duplicate_ticket_checked
duplicate_ticket_blocked
ticket_created
ticket_displayed_to_re
operator_logged_in
counter_assigned
counter_opened
counter_paused
counter_resumed
next_ticket_requested
ticket_locked_for_call
ticket_called
ticket_call_displayed_on_panel
service_started
service_finished
ticket_marked_no_show
ticket_restoration_requested
ticket_restored
ticket_cancelled
operator_logged_out
```

Eventos recomendados:

```
authentication_failed
manual_checkin_started
manual_checkin_completed
manual_override_performed
panel_connected
panel_disconnected
panel_updated
counter_closed
daily_queue_opened
daily_queue_closed
```

---

## 15. Métricas mínimas

### Fila

- total de senhas criadas;
- total aguardando;
- tempo médio de espera;
- tempo mediano de espera;
- maior tempo de espera atual;
- tempo de espera por faixa horária;
- senhas por canal de entrada: QR Code, link, check-in assistido;
- tentativas de duplicidade;
- senhas canceladas;
- senhas não comparecidas;
- senhas restauradas.

### Atendimento

- total de atendimentos iniciados;
- total de atendimentos finalizados;
- tempo médio de atendimento;
- tempo mediano de atendimento;
- atendimento por caixa;
- atendimento por operadora;
- atendimentos em aberto;
- tempo médio entre chamada e início do atendimento.

### Operação

- caixas ativos;
- caixas pausados;
- tempo de pausa por caixa;
- volume por hora;
- horários de pico;
- chamadas por operador;
- não comparecimento por canal de entrada.

---

## 16. Critérios de sucesso

O MVP 0 será bem-sucedido se:

1. A RE conseguir entrar na fila por QR Code, link ou check-in assistido.
2. O sistema impedir múltiplas senhas ativas para a mesma RE no mesmo ER.
3. A TV exibir corretamente senha, nome abreviado e caixa destino.
4. A operadora conseguir chamar próximo sem escolher manualmente a pessoa.
5. Duas operadoras não conseguirem chamar a mesma senha.
6. A operadora conseguir iniciar e finalizar atendimento.
7. O sistema registrar não comparecimento.
8. O sistema permitir cancelamento com motivo.
9. A gestora conseguir restaurar senha manualmente com justificativa.
10. A operação conseguir visualizar fila, caixas, atendimentos e chamadas recentes.
11. O sistema calcular tempo médio de espera e atendimento.
12. A solução não aumentar significativamente o esforço da operadora no caixa.

---

## 17. Riscos e mitigação

### Risco 1 — Sem integração, cadastro pode ser falso

Mitigação:

- CPF, telefone e código de RE obrigatórios;
- unicidade por CPF/telefone/código;
- QR Code local preferencial;
- auditoria posterior.

### Risco 2 — Link do site gerar entrada fora do ER

Mitigação:

- usar QR Code como canal principal;
- destacar instrução de uso presencial;
- medir no-show por canal;
- se o problema crescer, restringir link ou adicionar confirmação de presença em versão futura.

### Risco 3 — Operadora esquecer de finalizar atendimento

Mitigação:

- bloqueio para chamar próximo com atendimento aberto;
- alerta visual;
- tela da gestora com atendimentos abertos;
- correção manual autorizada.

### Risco 4 — Chamada simultânea

Mitigação:

- lock transacional obrigatório no backend;
- operação de “chamar próximo” atômica.

### Risco 5 — Fila digital não reduzir tempo real

Mitigação:

- comunicar internamente que o MVP 0 organiza e mede a fila, mas ainda não resolve causas estruturais de demora.

---

## 18. Síntese executiva

O MVP 0 consiste em uma fila digital presencial para ERs, com entrada por QR Code, link ou check-in assistido, cadastro mínimo da representante, senha única por RE/ER, chamada por TV, operação por caixa logado, estados mínimos da senha, controle de chamada simultânea, cancelamento, não comparecimento, restauração manual excepcional e métricas básicas de espera e atendimento.

Ele serve para validar o núcleo operacional do SaaS antes de avançar para fila virtual completa, Pedido Expresso, ETA, integração com PDV e regras avançadas de jornada.

A versão completa do MVP permanece como alvo de produto. O MVP 0 é o menor recorte para testar a hipótese em campo.

Stack mínima — MVP 0 Gestão de Filas