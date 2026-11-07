# Inventario (S7) — diseño

**Fecha**: 2026-11-07
**Sprint**: 3 (backend + frontend, admin)
**Paso del roadmap**: #5 en `docs/10-orden-de-ejecucion.md`
**Decisiones relacionadas**: D57 (lógica crítica también en Postgres — el trigger `trg_license_status_guard` ya
limita las transiciones válidas de `license_items.status`, D58 (hash HMAC con llave derivada para detectar
duplicados sin poder confirmar claves desde un dump), D62 (el lote guarda el costo como se pagó: moneda, monto
y tasa real si fue en USD/USDT — actualizado en esta sesión, ver abajo).

## Contexto

Las entidades `license_items`/`license_batches` y sus invariantes (trigger de transición de estado, `CHECK` de
moneda/tasa, `secretHash` único) ya existen desde Fundaciones (Sprint 1) — este paso no agrega esquema nuevo,
solo los endpoints y la pantalla que faltan para operar sobre ellas. `CryptoService` (`encrypt`/`decrypt`/`hash`)
ya existe y ya tiene un comentario explícito de que `hash()` es para esto ("detectar claves duplicadas al
cargar lotes"). `SettingsService` (clave/valor en `settings`) ya existe con un método de lectura
(`getNumber`); hoy no tiene escritura.

Mockup de referencia: `docs/design/artboards/AdminInventario.dc.html` (totales, filtros, fila por plan con
barra+badge, panel "Cargar licencias"). El mockup no cubre dos cosas que sí pide `docs/02`: el selector de
moneda del costo (RF implícito en D62) y la UI para anular una licencia (RF-ADM-24) — ambas se diseñan en esta
sesión, ver abajo.

Este spec cubre **RF-ADM-20 a RF-ADM-24** (ver stock, cargar lote con preview de duplicados, anular). **No**
cubre RF-ADM-26 (alerta automática de stock bajo, job `low-stock-check`) — ya está asignado a Sprint 4 en
`docs/08-plan-de-sprints.md`, no a este paso.

### Decisiones tomadas en esta sesión

1. **Carga manual únicamente, sin CSV**: el mockup ofrece pegar texto o importar un archivo CSV; el usuario
   decidió que la carga es manual (solo pegar, una clave por línea). Se elimina esa rama del mockup — sin
   input de archivo, sin parsing de CSV. Si en el futuro hace falta CSV, es un cambio aislado al parsing de
   `secrets[]`, no al resto del flujo.
2. **Moneda del costo (actualiza D62): selector PEN/USD en el formulario de carga, pero la tasa ya NO la
   tipea el admin por lote.** La tasa USD→PEN es **universal y la mantiene el admin actualizada** (no varía
   literalmente en cada compra desde la perspectiva de la UI, aunque el valor pueda cambiar con el tiempo).
   Se agrega la clave `usdPenRate` a `settings` (mismo patrón que `reservationTtlMinutes`) con un método de
   escritura nuevo en `SettingsService` (hoy solo tiene `getNumber`). La pantalla de Inventario muestra
   "Tasa USD→PEN actual: S/ X.XX" con un botón para editarla ahí mismo — **no** se adelanta la pantalla
   genérica de `/admin/settings` (ya está en el roadmap como su propio paso futuro, punto 12 de `docs/10`)
   solo por este campo. Al crear un lote en `USD`, el backend lee la tasa vigente en ese momento y la
   congela en `license_batches.fxRatePen` — el valor histórico de cada lote no cambia después aunque la
   tasa universal se actualice (sigue cumpliendo la intención original de D62: "el lote guarda el costo
   como se pagó").
3. **Anular licencia (RF-ADM-24) vive en una vista expandida de la fila del plan**: click en la fila de un
   plan (no en "+ Agregar", que sigue llevando al formulario) expande esa fila mostrando la lista de
   licencias `AVAILABLE` de ese plan (fecha de carga, nunca la clave) con un botón "Anular" por licencia que
   pide un motivo antes de confirmar. Evita una pantalla/modal nueva; reusa la tabla que ya existe.
4. **Preview sin persistir, confirmar re-valida desde cero**: `POST .../batches/preview` calcula
   válidas/duplicadas/con error sin escribir nada; `POST .../batches` repite la misma validación contra el
   estado real de la base en ese momento (nunca confía en el resultado del preview del cliente — puede haber
   cambiado, ej. otro admin cargó una clave igual mientras este admin tenía el formulario abierto).
5. **Duplicados son globales, no por plan**: `secretHash` es `unique` en toda la tabla (ya así en el esquema
   desde Fundaciones) — una clave que ya existe para OTRO plan también cuenta como duplicada. Correcto: una
   clave de licencia real no debería repetirse entre herramientas.
6. **Sin paginación en `GET /admin/inventory`**: son pocos planes (uno por combinación producto+duración);
   la lista completa siempre cabe en una pantalla, a diferencia de la cola de pagos.

## Flujo completo

```
/admin/inventario  (Server Component)
  - GET /admin/inventory al entrar (sin `filter`, trae todos) → { items: [...], usdPenRate }
  - Pasa a <InventoryScreen> (client)

<InventoryScreen>
  - Totales arriba (suma de disponibles/reservadas/vendidas de todos los planes)
  - Filtros Todos/Stock bajo/Agotados (client-side sobre los items ya traídos, igual que el mockup)
  - Fila por plan: nombre, barra + "N disponibles", badge (En stock/Stock bajo/Agotado)
    - Click en la fila → expande: lista de licencias AVAILABLE (fecha de carga) + "Anular" por cada una
      - "Anular" → pide motivo (texto libre, no vacío) → POST .../licenses/:id/void
          éxito → refetch GET /admin/inventory (misma licencia ya no aparece)
          409 (ya no está AVAILABLE) → banner + refetch (otro admin la usó/anuló primero)
    - "+ Agregar" → pre-selecciona ese plan en el formulario de carga y hace scroll (ancla, igual que el mockup)
  - Panel "Cargar licencias" (siempre visible, no es modal):
    - Plan (select), Moneda del costo (PEN/USD), Costo por licencia, "Tasa USD→PEN actual: S/ X.XX · Editar"
      (solo visible/relevante si moneda=USD), Proveedor (opcional), textarea "pega una licencia por línea"
    - Al tipear en el textarea (debounced) → POST .../batches/preview → "N válidas / N duplicadas / N con error"
    - "Cargar al inventario" → POST .../batches { planId, costCurrency, unitCostCents, supplier?, secrets[] }
        éxito → refetch inventario, limpia el formulario, banner "N licencias cargadas a [plan]"
        error (0 válidas) → banner rojo, no limpia el formulario (para que el admin corrija)
```

## Componentes y archivos nuevos

| Archivo | Responsabilidad |
|---|---|
| `backend/src/settings/settings.service.ts` | Agrega `setNumber(key, value, actorId, manager?)` — escritura genérica, auditada, reusable para futuras settings |
| `backend/src/inventory/inventory.module.ts` | Módulo nuevo (mismo patrón que `catalog-admin/`) |
| `backend/src/inventory/dto/*.ts` | `InventoryItemDto` (fila por plan), `BatchPreviewDto`/`BatchPreviewResultDto`, `CreateBatchDto`, `VoidLicenseDto` |
| `backend/src/inventory/inventory.service.ts` | `list(filter?)`, `preview(dto)`, `createBatch(dto, admin)`, `voidLicense(id, dto, admin)`, `getUsdRate()`/`setUsdRate(rate, admin)` |
| `backend/src/inventory/inventory.controller.ts` | `GET /admin/inventory`, `POST /admin/inventory/batches/preview`, `POST /admin/inventory/batches`, `POST /admin/inventory/licenses/:id/void`, `GET /admin/inventory/usd-rate`, `PUT /admin/inventory/usd-rate` — guard ADMIN (mismo patrón que `admin-payments.controller.ts`) |
| `backend/test/inventory.e2e-spec.ts` | e2e contra Postgres real |
| `frontend/src/app/admin/inventario/page.tsx` | Reemplaza el placeholder: Server Component, fetch inicial, pasa a `<InventoryScreen>` |
| `frontend/src/components/inventory-screen.tsx` | Client: totales, filtros, filas expandibles, panel de carga, refetch tras cada acción |
| `frontend/src/lib/inventory-client.ts` | Server Actions: `fetchInventory(filter?)`, `previewBatch(...)`, `createBatch(...)`, `voidLicense(id, reason)`, `updateUsdRate(rate)` — mismo patrón que `admin-payments-client.ts` |
| `frontend/src/lib/inventory-client.test.ts` | Vitest, mismo patrón que `admin-payments-client.test.ts` |
| `frontend/e2e/inventory.spec.ts` | Playwright: cargar lote con un duplicado, ver el resumen, anular una licencia |

Tocado, no nuevo: `backend/src/settings/settings.service.ts` (agrega escritura); `docs/06-api.md`,
`docs/02-requerimientos-funcionales.md`, `docs/10-orden-de-ejecucion.md` al cerrar.

## Manejo de errores

| Origen | Código | UI |
|---|---|---|
| `GET /admin/inventory` | `planId` no existe en `preview`/`batches` | 404, banner rojo |
| `POST .../batches` | 0 líneas válidas tras validar | 400, banner rojo, formulario no se limpia |
| `POST .../batches` con `costCurrency=USD` y sin tasa configurada (`usdPenRate` nunca se fijó) | 400, mensaje "Configura la tasa USD→PEN antes de cargar un lote en dólares" |
| `POST .../licenses/:id/void` sobre una licencia que ya no está `AVAILABLE` | 409, banner + refetch |
| `PUT .../usd-rate` con número ≤ 0 | 400 |

## Testing

- **Backend e2e** (Postgres real, como exige CLAUDE.md para flujos de stock/dinero): `preview` no persiste
  nada; duplicado contra una licencia ya existente en la BD se detecta; duplicado **dentro del mismo payload**
  (la misma clave pegada dos veces) también se detecta; `createBatch` en USD usa la tasa vigente de
  `settings` y la congela en el lote; `createBatch` en USD sin tasa configurada → 400; anular solo permite
  `AVAILABLE → VOID` (confiando en que el trigger ya lo bloquea, pero el servicio debe devolver un 409 legible
  en vez de dejar burbujear el error crudo de Postgres); cada carga y cada anulación escriben `audit_logs`.
- **Frontend**: Vitest para `inventory-client.ts` (mismo patrón que `admin-payments-client.test.ts`); Playwright
  e2e: cargar un lote con una clave duplicada a propósito (verifica que el resumen la cuenta y que no se
  inserta dos veces), anular una licencia y verificar que desaparece de la lista expandida.

## Fuera de alcance (explícitamente diferido)

- RF-ADM-26 (alerta automática de stock bajo, job `low-stock-check`) — Sprint 4 en `docs/08`.
- Pantalla genérica `/admin/settings` — solo se agrega la clave `usdPenRate` y su edición puntual desde
  Inventario; el resto de settings (SLA, TTL, horario) sigue sin UI propia (punto 12 de `docs/10`).
- Carga por CSV — decidido fuera de alcance en esta sesión; si se pide después, es un cambio aislado al
  parsing de `secrets[]`.
- Reportes de valor de inventario (`GET /admin/reports/stock-value`, D55) — depende de este módulo pero es
  su propio paso (punto 10 de `docs/10`).

## Documentación a actualizar al cerrar

- `docs/02-requerimientos-funcionales.md`: RF-ADM-20 a RF-ADM-24 ⬜ → ✅ con fecha de cierre.
- `docs/06-api.md`: marcar `GET /admin/inventory`, `POST .../batches/preview`, `POST .../batches` ✅; agregar
  las filas de `POST .../licenses/:id/void` y `GET`/`PUT .../usd-rate` (no estaban en la tabla original).
- `docs/10-orden-de-ejecucion.md`: marcar paso 5 ✅ con fecha de cierre; siguiente paso pasa a ser el 6
  ("Mis pedidos" + reveal de clave, S4).
