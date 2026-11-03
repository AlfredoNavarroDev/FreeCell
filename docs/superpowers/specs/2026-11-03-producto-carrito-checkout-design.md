# Página de producto, carrito y checkout — diseño

**Fecha**: 2026-11-03
**Sprint**: 2 (frontend, cierre) / arranca alcance de Sprint 3 en checkout
**Paso del roadmap**: #3 en `docs/10-orden-de-ejecucion.md`
**Decisiones relacionadas**: D14 (`requiresToolUsername` → `toolUsername` en el pedido), D18 (máx. 2 reintentos de
pago, cancela al 3.º — fuera de alcance de este paso, lo maneja Sprint 3/admin), D21/D64 (comprobante único por
`(paymentMethodId, operationNumber)` y por `proofHash`), D29 (nunca exponer stock exacto), D30 (carrito multi-ítem
reservado en una sola transacción en `POST /orders`), D43/D72 (declaración legal obligatoria, por intento de pago),
D61/D66 (moneda por pedido, catálogo fijo en PEN por defecto), D63/D65 (métodos de pago configurables, `CRYPTO`
solo `USD`), D68 (ficha de producto con descripción/incluye/compatibilidad/guía/FAQ), D70 (comprobante ≤5MB,
JPG/PNG/PDF, URL firmada vale 5 min), D71 (hash SHA-256 lo calcula el cliente), D73 (reveal limitado 20/min/IP,
fuera de alcance — es "Mis pedidos", paso 6), D74 (tope de cliente nuevo por moneda).

## Contexto

El backend de pedidos y pagos (Sprint 1/2) está completo y probado: `POST /orders`, `GET /orders/:id`,
`POST /orders/:id/cancel`, `POST /orders/:id/payment/upload-url`, `POST /orders/:id/payment` — todos requieren JWT
(`backend/src/orders/`, `backend/src/payments/`, `backend/src/storage/`). El frontend no tiene página de producto
(`/p/[slug]`), carrito, ni checkout. El catálogo (S1, paso 2) ya está conectado a la API real pero la tarjeta de
producto **no linkea** a `/p/[slug]` todavía (decisión explícita del spec anterior, porque la ruta no existía).

Este spec cubre **S2 (producto) y S3 (checkout)**. No incluye: selector de moneda PEN/USD (mejora aislada
posterior — ver "Fuera de alcance"), "Mis pedidos"/reveal de clave (S4, paso 6), panel admin de pagos (S6, paso 4).

### Decisiones tomadas en esta sesión

1. **Carrito client-side**: `React Context` + `localStorage`, sin fila en backend ni en Redis. Nada reserva stock
   hasta que el cliente confirma en Resumen y se llama `POST /orders`. Justificación: el backend ya reserva N
   ítems en una sola transacción (D30); mantener el carrito en memoria/localStorage antes de ese punto evita
   reservar de más y no requiere infraestructura nueva (ni tabla, ni claves Redis, ni merge entre sesiones).
2. **Login diferido**: se puede navegar y armar el carrito sin sesión; el login (NextAuth, ya implementado) se
   exige recién al entrar a `/checkout`. Consistente con que `POST /orders` siempre requiere JWT.
3. **Moneda fija `PEN`** para este paso. El catálogo (S1) ya quedó fijo en PEN sin selector; producto y checkout
   siguen la misma línea. El selector PEN/USD —y con él, los métodos `CRYPTO` (D63: solo aceptan `USD`)— se agrega
   después como mejora aislada que toca S1+S2+S3 juntos. No hace falta código nuevo para habilitarlo más adelante:
   `GET /payment-methods?currency=USD` ya filtra correctamente cuando llegue ese momento.
4. **Rutas separadas por paso de checkout**: `/checkout`, `/checkout/[orderId]/pago`, `/checkout/[orderId]/entrega`
   (en vez de una sola ruta con estado interno). Cada paso es bookmarkeable y sobrevive a un refresh porque el
   `orderId` en la URL identifica el pedido real en backend (`GET /orders/:id` re-hidrata la pantalla).

## Flujo completo

```
/p/[slug]  (producto)
  → "Añadir al carrito"  → sigue en /p/[slug], CartContext crece
  → "Comprar ahora"      → añade + redirige a /checkout

/checkout  (Resumen)
  - Lista ítems del CartContext (plan, cantidad, precio unitario, subtotal)
  - Si no hay sesión → redirige a /login?callbackUrl=/checkout
  - "Continuar a pago" → POST /orders { currency: "PEN", items, toolUsername? }
      éxito → limpia CartContext, redirige a /checkout/{orderId}/pago
      error → se queda en Resumen, muestra el error (ver tabla de errores)

/checkout/[orderId]/pago  (Pago)
  - GET /orders/:id al montar (hidrata countdown desde expiresAt, valida que sea del usuario)
  - Countdown de expiresAt; si ya venció → banner + bloquea el formulario
  - Selector de método de pago (GET /payment-methods?currency=PEN) con instructions
  - Input operationNumber, input de archivo (comprobante)
  - Al elegir archivo: valida tipo/tamaño en cliente (espejo de D70, UX temprana;
    el backend es la validación real) → POST /orders/:id/payment/upload-url →
    PUT directo a R2 con la uploadUrl → calcula proofHash (SHA-256 del archivo, Web Crypto)
  - Checkbox declaración legal obligatorio (D43/D72)
  - "Confirmar pago" → POST /orders/:id/payment { paymentMethodId, proofKey, proofHash,
    operationNumber, acceptsLegalDeclaration }
      éxito → redirige a /checkout/{orderId}/entrega
      error → se queda en Pago (ver tabla de errores)

/checkout/[orderId]/entrega  (Entrega)
  - GET /orders/:id → muestra estado IN_REVIEW, SLA de revisión (política ya decidida, no medida en vivo),
    número de pedido, botón "Volver al catálogo"
```

## Componentes y archivos nuevos

| Archivo | Responsabilidad |
|---|---|
| `src/app/p/[slug]/page.tsx` | Server component: fetch `GET /catalog/products/:slug`, 404 si no existe/inactivo |
| `src/components/product-tabs.tsx` | Pestañas Descripción / Cómo activar / Preguntas |
| `src/components/plan-picker.tsx` | Client: toggle NEW/RENEWAL, cantidad, "Añadir al carrito"/"Comprar ahora"; deshabilita si `stockState === "OUT_OF_STOCK"` |
| `src/lib/cart-context.tsx` | `CartProvider` + hook `useCart()`; persiste en `localStorage`, hidratación segura en SSR |
| `src/components/cart-badge.tsx` | Contador de ítems en `site-header.tsx` |
| `src/app/checkout/page.tsx` | Resumen del carrito, dispara `POST /orders` |
| `src/app/checkout/[orderId]/pago/page.tsx` | Selección de método, subida de comprobante, declaración legal |
| `src/app/checkout/[orderId]/entrega/page.tsx` | Confirmación, estado `IN_REVIEW` |
| `src/components/countdown.tsx` + `src/lib/use-countdown.ts` | Cuenta regresiva reutilizable desde `expiresAt` |
| `src/lib/orders-client.ts` | Cliente fetch para los 4 endpoints de pedidos/pagos (análogo a `catalog-client.ts`) |
| `src/lib/proof-hash.ts` | `computeProofHash(file): Promise<string>` — SHA-256 hex vía `crypto.subtle` |

Tocado: `src/components/site-header.tsx` (agrega `CartBadge`), `src/components/catalog-grid.tsx`/`product-card.tsx`
(agrega el link real a `/p/[slug]`, hoy ausente a propósito).

## Manejo de errores

| Origen | Código | UI |
|---|---|---|
| `POST /orders` | 409 stock / tope D74 | Vuelve a Resumen, mensaje por ítem afectado, no limpia el carrito |
| `POST /orders` | 403 correo no verificado | Mensaje + link para reenviar verificación (flujo NextAuth existente) |
| `POST /orders` | 400 moneda/`toolUsername` | Cubre condición de carrera; UI ya debería prevenirlo antes de enviar |
| Countdown | `expiresAt` vencido | Banner "reserva vencida", bloquea subir comprobante, botón vuelve a `/checkout` limpio |
| `upload-url` | 400 tipo/tamaño | Mensaje inline, no sube el archivo |
| `POST /orders/:id/payment` | 409 operación/hash duplicado, método no vigente, reserva vencida | Mensaje específico por causa |
| `POST /orders/:id/payment` | 400 declaración no aceptada / `proofKey` no corresponde | Re-marca el checkbox o pide reintentar la subida |
| Cualquier fetch caído | — | Reusa el patrón ya existente de `loading.tsx`/`error.tsx` del catálogo (botón reintentar) |

## Testing

- **Unitario**: `cart-context` (add/update/remove/clear, merge de cantidad para el mismo plan, persistencia en
  `localStorage`), `proof-hash` (hash mockeado), `use-countdown` (fake timers), `plan-picker` (toggle, deshabilitado
  si agotado).
- **Integración** (fetch mockeado, estilo `catalog-client.test.ts`): `orders-client.ts` cubre los 4 endpoints y sus
  códigos de error (403/404/409/400).
- **E2E (Playwright, nuevo — `web/e2e/`, carpeta propuesta en `docs/08`)**: flujo feliz completo (catálogo →
  producto → añadir 2 planes distintos → checkout → pago con upload de R2 mockeado → pantalla de entrega) y un
  caso negativo (reserva vencida bloquea subir comprobante).
- No se repite la prueba de concurrencia de reserva de stock (ya cubierta e2e en backend desde Sprint 1); el
  frontend solo verifica que el 409 se muestra correctamente.

## Fuera de alcance (explícitamente diferido)

- Selector de moneda PEN/USD y, con él, métodos `CRYPTO` visibles en checkout.
- "Mis pedidos" y reveal de clave (S4, paso 6 del roadmap).
- Panel admin de pagos / aprobar-rechazar (S6, paso 4).
- Reintento de pago tras rechazo (D18) — depende de que exista el panel admin de pagos primero.

## Documentación a actualizar al cerrar

- `docs/02-requerimientos-funcionales.md`: RF-COM-03 🟡 → estado parcial (checkout sin selector de moneda).
- `docs/10-orden-de-ejecucion.md`: marcar paso 3 ✅ con fecha de cierre.
