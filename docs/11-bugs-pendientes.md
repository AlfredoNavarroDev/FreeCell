# 11 · Bugs pendientes de resolver

Bugs **reales** (no flakiness de test, no deuda de diseño) encontrados durante desarrollo/verificación, que no
bloquearon el paso en curso pero quedan pendientes de una investigación o fix dedicado. No duplicar aquí
riesgos de negocio (eso va en `docs/09`, sección C) ni ítems de alcance futuro (eso va en `docs/10`).

## Cómo usar este archivo

- Antes de cerrar un bug de esta lista, verificarlo contra el código actual (puede haberse resuelto como
  efecto secundario de otro cambio, o puede haber mutado).
- Al resolver uno, moverlo a "Resueltos" con la fecha y el commit, no borrarlo.
- Si aparece un bug nuevo durante cualquier paso del roadmap (`docs/10`) que no bloquee ese paso, regístralo
  aquí en vez de dejarlo solo en memoria/conversación.

## Pendientes

### BUG-01 · Streaming SSR de Next 16 no colapsa en browser context nuevo (`/cuenta`, `/admin`)

**Encontrado:** 2026-11-07, durante verificación manual de admin-pagos (S6), paso 4.
**Síntoma:** en páginas dinámicas que leen `auth()` (confirmado en `/cuenta` y `/admin`), el contenido queda
duplicado en el DOM (`<p>`/`<main>` repetidos) de forma **permanente**, no transitoria (probado esperando
hasta 8 s). Rompe `frontend/e2e/logout.spec.ts` de forma 100% reproducible (no es flaky).

**Condición que lo dispara:** un `BrowserContext` de Playwright recién creado (`browser.newContext()`, sin
navegación previa) que hace login y luego navega (`page.goto`) a la página dinámica. En un contexto con
historial de navegación previo (una pestaña ya usada), siempre colapsa bien — nunca se reprodujo ahí.

**Confirmado con evidencia directa (no es ambigüedad de selector de Playwright):**
- El HTML crudo (`page.request.get`, sin ejecutar JS) trae el contenido **2 veces siempre**, en todo
  contexto, dev y producción — esto es el patrón normal de streaming de Next (shell oculto + script de
  "reveal" que debe reemplazarlo por el contenido final). No es el bug en sí.
- El bug real: ese script de reveal (visible en el HTML como `$RC`/`$RV`, agendado con `setTimeout`) **nunca
  se ejecuta** en los contextos nuevos — confirmado esperando 0, 500, 1000, 2000, 3000, 5000 y 8000 ms, sin
  que colapse nunca a 1 copia.
- Reproduce igual en `next dev` (Turbopack) **y en build de producción** (`next build && next start`) — no
  es artefacto de dev/HMR.
- Reproduce igual en `/cuenta` y en `/admin` — no es específico de una sola página.

**Hipótesis descartadas (con prueba, no solo sospecha):**
1. Cache de Turbopack (`.next/`) stale — descartado: limpiar cache no cambió el resultado para este caso
   puntual (sí arregló otros 2 specs no relacionados ese día, pero no este).
2. Falta de pre-compilación de la ruta — descartado: pre-calentar la ruta con una visita real antes del test
   no cambió el resultado.
3. El `<form action={logoutAction}>` con Server Action embebido — descartado: se quitó el form de
   `/cuenta/page.tsx` en una prueba controlada (revertida después) y la duplicación siguió exactamente igual.
4. Cantidad de navegaciones dentro del mismo context nuevo — descartado: 3 `goto()` seguidos a la misma
   ruta, en el mismo context nuevo, duplican las 3 veces.

**Lo que falta investigar:** qué hace distinto, a nivel de Playwright/Chromium, un `BrowserContext` recién
creado de uno con historial de navegación — no se llegó a esa causa raíz última. Es la pista más prometedora
para seguir.

**Impacto real estimado:** bajo pero no cero — en producción, un usuario real abriendo una pestaña nueva
también usa (en los términos de este bug) un "browser context" sin historial previo de este sitio en esa
sesión del navegador, así que no se puede descartar que vea el contenido duplicado momentáneamente en su
primera visita a `/cuenta` o `/admin` en una sesión nueva. No se verificó (ni se descartó) en un browser real
fuera de Playwright.

**No bloqueó:** el merge de admin-pagos (S6, paso 4) — ninguna de las 6 tareas de ese plan toca `/cuenta`, y
`/admin` solo heredó el bug (ya existía en `/cuenta` antes; no lo introdujo el shell nuevo de `/admin`).

**Dónde seguir:** `frontend/e2e/logout.spec.ts` (test que lo detecta), `frontend/src/app/cuenta/page.tsx` y
`frontend/src/app/admin/page.tsx` (páginas afectadas), `frontend/src/auth.ts` (la llamada a `auth()` que
ambas comparten).

## Resueltos

(ninguno todavía)
