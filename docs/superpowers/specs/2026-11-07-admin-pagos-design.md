# Panel admin de pagos (S6) — diseño

**Fecha**: 2026-11-07
**Sprint**: 3 (frontend, admin)
**Paso del roadmap**: #4 en `docs/10-orden-de-ejecucion.md`
**Decisiones relacionadas**: D18 (máx. 2 reintentos tras rechazo, cancela al 3.º), D19 (SLA 24h en `IN_REVIEW`, no
aplica a este paso — es la alerta de `AdminInicio`/S5), D21/D64 (comprobante único por hash y por
`(paymentMethodId, operationNumber)`, ya bloqueado en backend), D29 (el catálogo **de cliente** nunca muestra
cantidad exacta de stock — **no aplica aquí**: el panel admin es interno y el stock exacto es justamente lo que
pide RF-ADM-11).

## Contexto

Backend completo y probado desde Sprint 1/Sprint 3 (`backend/src/orders/admin-payments.controller.ts`,
`admin-payments.service.ts`): `GET /admin/payments?status=`, `POST /admin/payments/:id/approve`,
`POST /admin/payments/:id/reject`. Las funciones SQL (`fn_approve_payment`, `fn_reject_payment`) ya manejan la
transacción atómica, D18 y la liberación de licencia al 3.er rechazo. El frontend no tiene ninguna pantalla real de
`/admin/*` — `src/app/admin/page.tsx` es un placeholder de una línea.

Mockup de referencia: `docs/design/artboards/AdminPagos.dc.html` (maestro-detalle, checklist de verificación,
motivos de rechazo con confirmación bloqueada hasta elegir uno, banner de éxito, estado vacío "Estás al día").

Este spec cubre **solo S6 (Pagos)**. No incluye S5 (Inicio/resumen), S7 (Inventario), S8 (Reclamos) — el shell de
`/admin` se construye ahora porque S6 es la primera pantalla real, pero las otras rutas quedan como placeholders.

### Decisiones tomadas en esta sesión

1. **Extender el backend, no improvisar en el cliente**: `AdminPaymentResponseDto`/`AdminPaymentItemDto` hoy no
   traen nombre/correo del cliente ni nombre de producto/plan ni stock disponible — el mockup los pide todos. No
   existe ningún endpoint de catálogo/inventario que resuelva esto desde el cliente (no hay `GET /admin/plans`
   de listado, y `GET /admin/inventory` es Sprint 3/S7, todavía `⬜`). Se agregan los tres directo al DTO de
   pagos vía joins/`count()` ya disponibles en el mismo query de `list()` — sin migración, sin tocar
   `approve`/`reject`.
2. **Shell de `/admin` completo ahora**: `src/app/admin/layout.tsx` con el sidebar del mockup (Inicio / Pagos /
   Inventario / Reclamos + "Ver tienda"), usando los tokens de diseño del proyecto (no los hex del mockup).
   Pagos es la única pantalla funcional; Inventario y Reclamos quedan como placeholders de una línea (mismo
   patrón que `admin/page.tsx` hoy) para que el sidebar no tenga links rotos. Evita rehacer el shell cuando
   lleguen S7/S8 — solo agregan su página.
3. **Refetch completo tras cada acción**: aprobar/rechazar vuelve a pedir `GET /admin/payments?status=PENDING`
   completo (sin recargar la página) en vez de mutar la lista en memoria. Más simple que reconciliar estado
   local, y resuelve solo el caso de dos admins trabajando la misma cola a la vez (409 → el ítem stale
   desaparece en el siguiente refetch).
4. **`availableStock` por ítem, no un endpoint de inventario aparte**: cada `AdminPaymentItemDto` lleva un
   `availableStock: number` (conteo `license_items` con `status = 'AVAILABLE'` para ese `planId`, calculado en
   el mismo query batched que ya junta los `order_items`). No es el módulo de Inventario (S7) — es solo el dato
   puntual que RF-ADM-11 pide ver "sin cambiar de pantalla".
5. **"Reserva: MM:SS" es informativo, no bloquea nada**: se reutiliza `<Countdown>` tal cual (ya existe de
   S2/S3) para mostrar cuánto quedaba de la reserva original. Una vez el pago está `PENDING`/pedido `IN_REVIEW`,
   la regla de dominio #3 ya garantiza que no se libera por expiración — el admin puede aprobar o rechazar sin
   importar si el contador llegó a cero. No se conecta `onExpire` a ninguna acción.

## Flujo completo

```
/admin/pagos  (Server Component)
  - GET /admin/payments?status=PENDING&pageSize=50 al entrar
  - Pasa la lista a <AdminPaymentsQueue> (client)

<AdminPaymentsQueue>
  - Cola a la izquierda, ordenada por antigüedad (ya viene así del backend)
  - Click en un ítem → lo selecciona (detalle a la derecha), cierra el flujo de rechazo si estaba abierto
  - Detalle: cliente (nombre+correo), pedido #N, Reserva: MM:SS (informativo), comprobante
    (imagen inline o link si es PDF, "Ampliar imagen" en pestaña nueva), producto+plan, monto esperado,
    método de pago, "Stock para entregar: quedan N licencias", checklist de verificación (3 checkboxes,
    solo UI — no bloquean el botón, son recordatorio visual como en el mockup)
  - "Aprobar y entregar licencia" → POST .../approve
      éxito → refetch cola → autoselecciona el más antiguo restante → banner verde "Pedido #N aprobado..."
      error (404/409) → banner rojo con el mensaje → refetch cola igual (resincroniza)
  - "Rechazar" → abre selector de motivo (3 botones, RF-ADM-13); "Confirmar rechazo" deshabilitado hasta elegir
      confirmar → POST .../reject { reason } → refetch cola → autoselecciona siguiente → banner
      "Cancelar" → cierra el selector sin enviar nada
  - Cola vacía → "Estás al día. No hay pagos pendientes..."
```

## Componentes y archivos nuevos

| Archivo | Responsabilidad |
|---|---|
| `backend/src/orders/dto/admin-payment-response.dto.ts` | Agrega `productName`/`planName`/`availableStock` a `AdminPaymentItemDto`; agrega `customerName`/`customerEmail` a `AdminPaymentResponseDto` |
| `backend/src/orders/admin-payments.service.ts` | `list()`: join a `users`, join a `plans`+`products`, `count()` de `license_items` por `planId` (batched, mismo patrón que el join de `order_items` ya existente) |
| `frontend/src/app/admin/layout.tsx` | Sidebar (Inicio/Pagos/Inventario/Reclamos + "Ver tienda" + nombre admin vía sesión), badge `[N]` en Pagos desde `total` de `GET /admin/payments?status=PENDING&pageSize=1` |
| `frontend/src/app/admin/inventario/page.tsx`, `frontend/src/app/admin/reclamos/page.tsx` | Placeholders de una línea (mismo patrón que `admin/page.tsx`) |
| `frontend/src/app/admin/pagos/page.tsx` | Server component: fetch inicial, pasa a `<AdminPaymentsQueue>` |
| `frontend/src/components/admin-payments-queue.tsx` | Client: cola + detalle + flujo de rechazo + refetch + auto-avance |
| `frontend/src/lib/admin-payments-client.ts` | Server Actions: `fetchAdminPayments(status?)`, `approvePayment(id)`, `rejectPayment(id, reason)` — mismo patrón que `orders-client.ts` |

Tocado: ninguno fuera de lo anterior — `proxy.ts` ya protege `/admin/*` por rol (no requiere cambios).

## Manejo de errores

| Origen | Código | UI |
|---|---|---|
| `GET /admin/payments` | fetch caído | Reusa patrón `loading.tsx`/`error.tsx` del catálogo (botón reintentar) |
| `POST .../approve` | 404 (pago no existe) | Banner rojo "Este pago ya no existe" + refetch |
| `POST .../approve` | 409 (ya revisado) | Banner rojo "Otro admin ya revisó este pago" + refetch |
| `POST .../reject` | 404/409 | Mismo tratamiento que approve |
| `POST .../reject` sin motivo elegido | — | "Confirmar rechazo" deshabilitado (no llega a enviarse) |

## Testing

- **Unitario**: si surge una función pura para elegir "el siguiente pendiente" tras aprobar/rechazar (excluyendo
  el ítem actual), se testea aislada con Vitest — igual que `cart-logic.ts`.
- **Integración** (fetch mockeado, estilo `orders-client.test.ts`): `admin-payments-client.ts` cubre los 3
  endpoints y sus códigos de error (404/409).
- **E2E (Playwright, `frontend/e2e/admin-payments.spec.ts`)**:
  - Flujo de **rechazo**: cliente sube comprobante → admin entra a `/admin/pagos`, lo rechaza con un motivo →
    pedido vuelve a `PENDING_PAYMENT`. No consume licencia permanentemente (sigue `RESERVED`); limpieza reusa
    `releaseOrderLicenses` de `e2e/db.ts` (ya existe).
  - Flujo de **aprobación**: cliente sube comprobante → admin aprueba → pedido `DELIVERED`, licencia `SOLD`.
    Esto consume 1 de las 5 licencias fijas del seed **de forma permanente** (correcto: aprobado = vendido, sin
    vuelta atrás vía API). Se agrega un helper nuevo en `e2e/db.ts` (`releaseDeliveredOrderLicense(orderId)`)
    que revierte la licencia de `SOLD` a `AVAILABLE` y el pedido de `DELIVERED` a `CANCELLED` (con
    `cancelReason: 'E2E_TEST_CLEANUP'`) **solo para sostenibilidad del entorno de dev/test local** — mismo
    criterio ya aplicado en el fix de Task 15 del paso anterior (datos de cuentas de test descartables, no de
    producción).
  - Login como admin: reusa `ADMIN_EMAIL`/`ADMIN_PASSWORD` de `backend/.env` (ya cargado por
    `e2e/global-setup.ts`).

## Fuera de alcance (explícitamente diferido)

- `AdminInicio` (S5): resumen del día, alertas (incluida la de SLA 24h de D19), actividad reciente.
- `GET /admin/inventory` real y la pantalla de Inventario (S7) — `availableStock` acá es solo el conteo puntual
  por ítem, no el módulo de carga de lotes/umbrales.
- Reclamos (S8).
- Notificación por correo real de aprobación/rechazo (ya se encola, el envío real de la cola es trabajo
  aparte — no es parte de este paso).
- Checklist de verificación como gate que bloquea el botón "Aprobar" — en el mockup y en este spec es solo
  recordatorio visual, no validación forzada.

## Documentación a actualizar al cerrar

- `docs/02-requerimientos-funcionales.md`: RF-ADM-10 a RF-ADM-14 🟡 → ✅ con fecha de cierre.
- `docs/06-api.md`: marcar la fila de `GET /admin/payments` con la nota de los campos nuevos del DTO.
- `docs/10-orden-de-ejecucion.md`: marcar paso 4 ✅ con fecha de cierre; siguiente paso pasa a ser el 5
  (Inventario, S7).
