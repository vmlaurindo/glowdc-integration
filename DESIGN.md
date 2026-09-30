# Sistema visual do Maxio Hub

## Cena de uso

Uma pessoa da operação abre o painel durante o expediente ou numa checagem
noturna para responder em poucos segundos: a origem está conectada, chegaram
leads e os eventos foram observados ou enviados? A interface privilegia leitura
rápida, estados inequívocos e ações explícitas.

## Paleta

Os componentes consomem tokens semânticos; valores brutos ficam somente na
camada de tema.

| Papel | Escuro | Claro |
| --- | --- | --- |
| Fundo | `#090a0c` | `#f4f3f1` |
| Superfície | `#121417` | `#ffffff` |
| Texto | `#f4f2ef` | `#191a1d` |
| Texto secundário | `#989ca5` | `#656871` |
| Ação MAXIO | `#e35a2c` | `#cf461f` |
| Ênfase MAXIO | `#d51a68` | `#bd155d` |
| Sucesso | `#42d6a0` | `#087f5b` |

## Tipografia

- IBM Plex Sans: navegação, títulos, campos e conteúdo.
- IBM Plex Mono: métricas, identificadores, etiquetas e horários.
- Escala compacta, sem serifas ou tipografia de campanha.

## Layout

```text
desktop
┌──────────────┬──────────────────────────────────────────────┐
│ m.hub        │ workspace / estado / tema                   │
│              ├──────────────────────────────────────────────┤
│ OPERAÇÃO     │ título e contexto                           │
│ visão geral  │ métricas compactas                          │
│ leads        │ conteúdo principal + trilho/estado          │
│ operação     │                                              │
│              │                                              │
│ CONFIGURAÇÃO │                                              │
│ conectar     │                                              │
│ usuário/sair │                                              │
└──────────────┴──────────────────────────────────────────────┘

mobile
┌─────────────────────────────────────────────────────────────┐
│ m.hub / workspace / tema                                   │
├─────────────────────────────────────────────────────────────┤
│ conteúdo                                                   │
├─────────────────────────────────────────────────────────────┤
│ visão | leads | operação | conectar                        │
└─────────────────────────────────────────────────────────────┘
```

## Assinatura

A faixa de sinal MAXIO — coral evoluindo para magenta — aparece apenas no
indicador de marca, foco/ação principal e seleção ativa. Menta comunica sucesso,
e nunca substitui a cor da marca.

## Regras de interação

- Alvos interativos têm no mínimo 44 px.
- Tema persiste no navegador e respeita a preferência do sistema na primeira visita.
- Foco visível, labels persistentes e mensagens com `role` apropriado.
- Movimentos entre 150–220 ms e removidos quando `prefers-reduced-motion` está ativo.
- Ícones são SVG consistentes, com rótulo textual ou nome acessível.
- Nenhuma ação externa nova é introduzida nesta mudança.
