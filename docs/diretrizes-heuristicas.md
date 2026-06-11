# Diretrizes e heurísticas de design

## 1. Princípios nucleares

- Semântica antes da aparência: os componentes devem ser escolhidos pela função da interação, não apenas pelo visual.
- Zero hardcode: é terminantemente proibido inserir valores fixos para cores, tipografia, espaçamentos, raio, bordas e sombras. Tudo deve usar tokens.
- Paleta parcimoniosa: as superfícies devem ser majoritariamente neutras. A cor da marca deve ser usada com moderação, focada em conversão e ações primárias.

## 2. Tokens e convenções

- Sintaxe canônica: no CSS, utilizar `--categoria/subtoken`.
- Aplicação de variáveis:
  - Cor e tipografia: `var(--token)` direto.
  - Layout, raio, borda e sombra: `calc(var(--token) * 1px)`.
- Escala escalonada: espaçamentos são escalas, não pixels absolutos. Exemplo: `spacing/8` não significa 8px literais.

## 3. Cores semânticas

- As cores são divididas por intenção. Nunca misturar a semântica de uma categoria com outra.
- Categorias: Background, Non Interactive, Link, Conversion Button, Actionable, Non Primary Button, Disabled, Keyboard Focus.
- Foundation status fixos:
  - Success (verde): ações positivas e confirmações.
  - Error (vermelho): erros e ações destrutivas.
  - Alert (amarelo/laranja): atenção e avisos.
  - Info (azul): informações contextuais.
- Regra de borda: `Non Interactive/Outline` é exclusivo para bordas e divisores, nunca para textos.

## 4. Tipografia

- Fonte padrão: IBM Plex Sans, com fallback para sans-serif.
- Hierarquia: Display -> Heading -> Title -> Subtitle -> Body Large -> Body Small -> Auxiliar/Restricted.
- Aplicação: propriedades como `fontSize` e `fontWeight` nunca devem ser hardcoded. Usar classes tipográficas e variáveis de cor.

## 5. Layout, spacing, radius, border e shadow

- Spacing: usar apenas valores da escala (4, 8, 12, 16, 20, 24, 32, 48).
- Radius por contexto:
  - Small (4): inputs, chips, tags e botões.
  - Medium (8): cards e containers.
  - Large (16): bottom sheets e modals.
  - Pill (40): elementos em pílula.
- Borders e shadows: espessuras (hairline, thin, medium, thick) e sombras (direção e distância) devem ser baseadas em tokens.

## 6. Ícones

- Padrão: ícones outline (contorno) por padrão. O estado ativo/selecionado usa a versão fill (preenchido).
- Restrições: proibido usar emojis ou bibliotecas externas (Material, Font Awesome, etc.).
- Implementação: ícones em componentes devem ser definidos via props (`iconLeft`, `rightIcon`), sem sobrescrever estilos internos.

## 7. Decisão de componentes

- Navegação: Navbar (global), TabBar (mesma tela), Breadcrumb (hierarquia).
- Ações: Button Primary (máx. 1 por contexto), Button Secondary/Tertiary (suporte), Button Conversion (comercial), Button Warning (destrutivo, exige confirmação).
- Entrada de dados: Input (texto curto), Textarea (texto longo), Radio (exclusiva, até 5 opções), Select (exclusiva, mais de 5 opções), Checkbox (múltipla), Switch (toggle imediato).
- Feedback: Toast (efêmero), Alert/Banner (persistente), Skeleton (loading previsível), Loader (loading genérico).
- Decisões críticas: Modal, Bottom Sheet, Drawer.
- Acessibilidade/usabilidade: botões com área de toque mínima de 48px; labels de campos sempre visíveis (nunca usar placeholder como label).

## 8. Heurísticas de usabilidade

- H1 - Visibilidade do status: ações assíncronas exigem loading e bloqueio de re-clique. Conclusões geram Toast ou Alert. Campos inválidos mostram erro inline e helper text.
- H3 - Controle e liberdade: sobreposições (modais/drawers) devem ter opções claras de saída (fechar, cancelar, backdrop clicável, swipe).
- H5 - Prevenção de erros: o submit só é liberado com dados válidos. Ações destrutivas exigem confirmação.
- H6 - Reconhecimento maior que lembrança: labels explícitos em ícones e campos. Diferenciação visual clara de estados selecionados.
- H8 - Estética e minimalismo: sem elementos redundantes. Uso estratégico do spacing (divisores só quando necessário).

## 9. Escrita e tom de voz

- Pilares: gentil (empática, não culpa o usuário), confiante (direta, sem hesitação) e simplificadora (frases curtas, voz ativa).
- Microcopy: call to actions (CTAs) usam verbo no infinitivo mais substantivo. Exemplo: "Salvar endereço". Evitar jargão técnico ou códigos de erro brutos.
- Formatação: números em algarismos, datas em DD/MM/AAAA, horas com h minúsculo (exemplo: 10h45), moeda com espaço (R$ 9,90).