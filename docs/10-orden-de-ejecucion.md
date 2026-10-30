# 10 · Orden de ejecución recomendado

Roadmap de **prioridad**, no de sprint. Complementa `docs/08-plan-de-sprints.md` (que define alcance/DoD por
sprint) respondiendo una pregunta distinta: **en qué orden conviene construir lo que falta**, dado el estado real
de `backend/src/` y `frontend/src/` verificado el 2026-10-29.

Criterio: cerrar primero el **loop de venta completo** (reservar → pagar → aprobar → entregar → revelar clave) de
punta a punta, porque es lo que valida que el negocio funciona. Recién después tiene sentido invertir en
operación secundaria (inventario, reclamos, soporte) y en observabilidad/admin (reportes, settings, deploy).

## Orden

| # | Qué | Por qué va ahí |
|---|---|---|
| 1 | ✅ Backend: `POST/GET /admin/payments` (approve/reject) — 2026-10-29 | Sin esto ningún pedido sale de `IN_REVIEW`. Pieza más chica con más impacto: desbloquea probar todo el resto end-to-end. |
| 2 | Frontend: conectar catálogo a API real (reemplazar `src/lib/mock-catalog.ts`) | Base para página de producto y carrito; hoy S1 no habla con el backend. |
| 3 | Frontend: página producto (`/p/[slug]`) + carrito + checkout (S2/S3) | El flujo de compra en sí. Backend (`/orders`, `/orders/:id/payment*`) ya está completo para esto. |
| 4 | Frontend: panel admin de pagos (S6) | Junto con el paso 1, cierra el loop compra→aprobación→entrega de forma visible y probable. |
| 5 | Backend + frontend: inventario (`/admin/inventory*`, S7) | Sin carga de lotes real, el stock depende solo del seed; necesario para operar más de una vez. |
| 6 | Frontend: "Mis pedidos" + reveal de clave (S4) | Cierra la experiencia del cliente; endpoints ya listos (`GET /orders`, `POST /orders/:id/license/reveal`). |
| 7 | Backend + frontend: reclamos (`/claims`, S8) | Parte del dominio core (reposición, D25/D26), pero depende de que ya haya pedidos `DELIVERED` reales. |
| 8 | Backend + frontend: soporte / tickets (S9/S11) | Menor urgencia que ventas; no bloquea facturación. |
| 9 | Backend + frontend: reseñas (S11) | Cosmético, no bloquea ventas. |
| 10 | Admin: inicio/summary + reportes (S5, D55) | Útil cuando ya hay datos reales corriendo, no antes. |
| 11 | Admin: catálogo CRUD UI (S10) | Backend ya ✅; hoy se puede operar por seed/Postman, baja urgencia de UI. |
| 12 | Settings admin + Bull Board (`/admin/settings`, `/admin/queues`) | Operacional, no bloquea nada crítico. |
| 13 | Deploy real (Fly.io + Vercel + Neon + R2) | Mover apenas el loop de los pasos 1–4 funcione end-to-end en local, para validar en producción antes de construir el resto. |

## Cómo usar este archivo

- Antes de preguntar "¿qué sigue?", leer este archivo en vez de re-derivar el orden desde cero.
- Si se completa un paso, marcarlo (✅) y anotar la fecha; si el orden cambia por una decisión de negocio, registrar
  esa decisión en `docs/09-decisiones-y-preguntas-abiertas.md` y actualizar la tabla de arriba.
- El detalle de **qué** incluye cada paso (DTOs, endpoints, pantallas) vive en `docs/02`, `docs/06`, `docs/07` y
  `docs/08`; este archivo solo fija el **orden**.

## Estado (2026-10-29)

Paso 1 completo (`/admin/payments`: list/approve/reject, migración `AdminPaymentFunctions`, 15 pruebas e2e).
Próximo: **paso 2** (conectar catálogo del frontend a la API real).
