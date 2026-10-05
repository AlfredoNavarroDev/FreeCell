# 00 · Brief para el brainstorming

Este repositorio contiene el **diseño y la base técnica verificada** de una tienda de licencias. El Sprint 1 está hecho y probado.
Antes de construir los sprints 2–4, hay que resolver las preguntas abiertas de `docs/09-decisiones-y-preguntas-abiertas.md`
sin reabrir las decisiones de la sección A.

## Cómo usarlo con Claude Code
1. Abre Claude Code en la raíz del repositorio (lee `CLAUDE.md` automáticamente).
2. Ejecuta la skill de brainstorming y pega el prompt de abajo.
3. Resuelve las preguntas **por bloques** (B1 primero: condiciona el modelo de datos).
4. Al terminar, pide actualizar `docs/` (requerimientos, modelo de datos, API, sprints) y registrar cada decisión en la sección A.

## Prompt sugerido
```
Quiero refinar el diseño de una tienda de licencias de herramientas de servicio técnico de celulares antes de construir
los sprints 2 a 4. Lee CLAUDE.md y toda la carpeta docs/ (empezando por 00, 01, 02 y 09).

Contexto: lo implementado y probado está en api/ (Sprint 1). Las decisiones de la sección A de docs/09 ya están tomadas.
Quiero resolver las preguntas abiertas de la sección B, en este orden: B1 (modelo de producto), B2 (pagos y fraude),
B3 (entrega y reclamos), B5 (operación), B4, B6 y B7.

Reglas:
- Hazme una pregunta a la vez, con opciones concretas y tu recomendación.
- Cuando una respuesta cambie el esquema, la API o un requerimiento, dime exactamente qué documento y qué línea se actualiza.
- No inventes datos de negocio (productos, precios, proveedores): déjalos como placeholders [..].
- Al final, genera una lista de cambios para docs/ y un plan de implementación del Sprint 2 con tareas verificables.
```

## Lo que NO hay que reconsiderar
Alcance de solo licencias, gestión manual, BullMQ, reserva de 30 min, pago con comprobante manual, cifrado AES-GCM,
`SKIP LOCKED`, dinero en céntimos, estilo visual claro.

## Orden de lectura recomendado
`CLAUDE.md` → `01-vision-y-alcance` → `02-requerimientos-funcionales` → `09-decisiones-y-preguntas-abiertas` →
`05-modelo-de-datos` → `04-arquitectura` → `06-api` → `07-diseno-ui` → `03-requerimientos-no-funcionales` → `08-plan-de-sprints`.
