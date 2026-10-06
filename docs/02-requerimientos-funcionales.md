# 02 · Requerimientos funcionales

**Leyenda de prioridad (MoSCoW):** **M** = debe (MVP) · **S** = debería · **C** = podría · **W** = fuera por ahora.
**Estado:** ✅ implementado y probado · 🟡 parcial · ⬜ pendiente.
**Pantallas:** ver `07-diseno-ui.md` (S1–S8). **Endpoints:** ver `06-api.md`.
Los criterios marcados con **[?]** dependen de una pregunta abierta en `09-decisiones-y-preguntas-abiertas.md`.

---

## RF-AUT · Cuentas y acceso

| ID | Requerimiento | Prio | Estado |
|---|---|---|---|
| RF-AUT-01 | El visitante puede registrarse con correo y contraseña. | M | ✅ |
| RF-AUT-02 | El usuario inicia sesión y recibe un token con expiración. | M | ✅ |
| RF-AUT-03 | El usuario autenticado puede consultar su perfil. | M | ✅ |
| RF-AUT-04 | El rol ADMIN solo se asigna por seed/admin; nunca desde el registro público. | M | ✅ |
| RF-AUT-05 | Rutas de admin protegidas por rol; rutas de cliente protegidas por propiedad (un cliente solo ve sus pedidos). | M | 🟡 guards listos, falta aplicarlos en los módulos nuevos |
| RF-AUT-06 | Recuperar contraseña por correo. | S | ⬜ |
| RF-AUT-07 | Verificación de correo **obligatoria** antes de la primera compra para cuentas correo+contraseña; **automática** si el usuario entró con Google (D22, D54). | M | ⬜ |
| RF-AUT-08 | Registrar teléfono/WhatsApp opcional en el perfil (para soporte y notificaciones). | S | ⬜ (campo `users.phone`) |
| RF-AUT-09 | Sesión del frontend gestionada por NextAuth (credentials provider contra la API) (D46). | M | ⬜ |
| RF-AUT-10 | Login con **Google** vía NextAuth; primer ingreso crea el `user` (find-or-create por correo) con `role=CUSTOMER` (D53). | M | ⬜ |

**Criterios de aceptación clave**
- Registro: correo único (insensible a mayúsculas), contraseña 8–72 caracteres, respuesta con token. ✅
- Login: mismo mensaje de error para correo inexistente y contraseña incorrecta. ✅
- Cualquier ruta protegida sin token responde 401; con rol insuficiente, 403.

---

## RF-CAT · Catálogo

| ID | Requerimiento | Prio | Estado |
|---|---|---|---|
| RF-CAT-01 | Listar productos activos con categoría, estado de stock y precio "desde". | M | ⬜ |
| RF-CAT-02 | Buscar por nombre y filtrar por categoría. | M | ⬜ |
| RF-CAT-03 | Ficha de producto: descripción, qué incluye, compatibilidad, cómo activar, preguntas frecuentes. | M | ⬜ |
| RF-CAT-04 | La ficha lista los planes (nueva/renovación × duración) con precio y disponibilidad. | M | ⬜ |
| RF-CAT-05 | El estado de stock por plan se calcula en vivo: **En stock** (> umbral), **Pocas unidades** (1..umbral), **Agotado** (0). | M | ⬜ |
| RF-CAT-06 | Mostrar **solo el estado** de stock (En stock / Pocas unidades / Agotado), nunca la cantidad exacta (D29). | M | ⬜ |
| RF-CAT-07 | Un plan agotado no permite comprar. | M | ✅ (la reserva responde 409) |
| RF-CAT-08 | "Más vendidos" y "Recién llegados" en la portada. | S | ⬜ |
| RF-CAT-09 | Productos relacionados en la ficha. | C | ⬜ |
| RF-CAT-10 | Reseñas de compradores con pedido `DELIVERED` de ese producto, moderadas por admin antes de publicarse (D33). | S | ⬜ |
| RF-CAT-11 | Catálogo muestra el nombre de la herramienta solo en texto, sin logo oficial de terceros (D42). | M | ⬜ |

---

## RF-COM · Compra y pago

| ID | Requerimiento | Prio | Estado |
|---|---|---|---|
| RF-COM-01 | El cliente agrega uno o más planes a un carrito y crea un pedido; el sistema **reserva todas las licencias del pedido por 30 min** en una sola transacción, sin asignar nunca la misma a dos pedidos (D30). | M | 🟡 (reserva de 1 ítem probada; falta extender a N ítems) |
| RF-COM-02 | Si algún ítem del carrito no tiene stock, la compra completa se rechaza con un mensaje claro (409), sin reservar el resto. | M | ✅ para 1 ítem, ⬜ extender a carrito |
| RF-COM-03 | El checkout muestra resumen (con todos los ítems del carrito), cuenta regresiva de la reserva e instrucciones de pago (Yape/Plin o transferencia). | M | ⬜ |
| RF-COM-04 | El cliente sube el comprobante (JPG/PNG/PDF, máx. [N] MB); el pedido pasa a `IN_REVIEW`. | M | ⬜ |
| RF-COM-05 | La reserva vencida sin comprobante cancela el pedido y devuelve todas sus licencias al stock. | M | ✅ para 1 ítem, ⬜ extender a carrito |
| RF-COM-06 | Una reserva con comprobante en revisión **no** se libera por expiración. | M | ✅ |
| RF-COM-07 | Campo "usuario de la herramienta" obligatorio solo en productos con `requiresToolUsername = true` (D14); bloquea el paso a `IN_REVIEW` si falta. | M | 🟡 (campo existe en el pedido; falta bandera por producto y validación) |
| RF-COM-08 | El cliente puede cancelar un pedido sin pago y liberar la reserva. | S | ⬜ |
| RF-COM-09 | Se envía confirmación por correo al crear el pedido con las instrucciones de pago. | S | ⬜ |
| RF-COM-10 | Carrito: varias licencias (de uno o más planes) en un mismo pedido, **dentro del MVP** (D30). | M | ⬜ |
| RF-COM-11 | Pago con pasarela y confirmación automática. | W | — |
| RF-COM-12 | Tras rechazar un pago, el pedido vuelve a `PENDING_PAYMENT` con plazo extra; máximo 2 reintentos, luego se cancela (D18). | M | ⬜ |
| RF-COM-13 | Checkbox obligatorio al pagar: declaración de titularidad/autorización sobre el equipo (D43). | M | ⬜ |
| RF-COM-14 | Pedido `IN_REVIEW` por más de 24 h genera alerta al operador (D19); no se cancela automáticamente. | M | ⬜ |

**Criterios de aceptación clave**
- 10 compras simultáneas con 3 licencias → exactamente 3 pedidos creados, 7 con 409, ninguna licencia repetida. ✅ (test e2e)
- El job de liberación es idempotente: ejecutarlo dos veces o sobre un pedido `IN_REVIEW` no cambia nada. ✅

---

## RF-PED · Mis pedidos y entrega

| ID | Requerimiento | Prio | Estado |
|---|---|---|---|
| RF-PED-01 | Listar mis pedidos con estado (Esperando pago, Pago en revisión, Entregado, Cancelado) y filtros. | M | ⬜ |
| RF-PED-02 | Ver el detalle de un pedido con línea de seguimiento (creado → pago aprobado → entregado). | M | ⬜ |
| RF-PED-03 | Ver la clave de un pedido entregado: oculta por defecto, con **Mostrar** y **Copiar**. | M | ⬜ |
| RF-PED-04 | **Cada vez que se revela la clave se registra en auditoría** (quién, cuándo). | M | ⬜ |
| RF-PED-05 | Recibir aviso por correo al aprobarse el pago, **solo con enlace** a "Mis pedidos" (la clave nunca viaja completa por correo) (D24). | M | ⬜ |
| RF-PED-06 | Mostrar la guía "cómo activar" del producto junto a la clave. | S | ⬜ |
| RF-PED-07 | Descargar comprobante de compra / boleta. | W | — (sin boleta/factura SUNAT en el MVP, D40) |

---

## RF-REC · Reclamos (lado cliente)

| ID | Requerimiento | Prio | Estado |
|---|---|---|---|
| RF-REC-01 | El cliente reporta una clave inválida de un pedido entregado, con un motivo. | M | ⬜ |
| RF-REC-02 | Solo se puede reclamar dentro de una ventana de **7 días** tras la entrega (D25). | M | ⬜ |
| RF-REC-03 | Un pedido no puede tener más de un reclamo abierto a la vez. | M | ⬜ |
| RF-REC-04 | El cliente ve el estado del reclamo (Abierto / Resuelto / Rechazado) y recibe la clave de reemplazo en Mis pedidos. | M | ⬜ |
| RF-REC-05 | Máximo **1 reposición** por pedido; si no hay stock, el pedido queda en espera del próximo lote (sin reembolso automático) (D26). | M | ⬜ |
| RF-REC-06 | El cliente puede pedir reembolso manual (Yape/Plin/transferencia) como alternativa a esperar stock (D27). | S | ⬜ |

---

## RF-ADM · Panel de administración

### Inicio ("Hoy")
| ID | Requerimiento | Prio | Estado |
|---|---|---|---|
| RF-ADM-01 | Mostrar lo que requiere atención: pagos por revisar (con la espera más antigua), reclamos abiertos, planes con stock bajo/agotado. | M | ⬜ |
| RF-ADM-02 | Resumen del día: ventas, licencias entregadas, margen estimado (precio − costo del lote). | S | ⬜ |
| RF-ADM-03 | Actividad reciente. | C | ⬜ |

### Pagos
| ID | Requerimiento | Prio | Estado |
|---|---|---|---|
| RF-ADM-10 | Cola de pagos pendientes ordenada por antigüedad, con cliente, producto, monto, método y tiempo de espera. | M | ⬜ |
| RF-ADM-11 | Ver el comprobante junto al monto esperado, el método, la reserva restante y el stock disponible, sin cambiar de pantalla. | M | ⬜ |
| RF-ADM-12 | **Aprobar y entregar:** en una transacción, la licencia reservada pasa a `SOLD`, el pedido a `DELIVERED`, el pago a `APPROVED`; se encola el correo con clave y se registra auditoría. Tras aprobar, la UI pasa al siguiente pago. | M | ⬜ |
| RF-ADM-13 | **Rechazar** con motivo predefinido (monto incorrecto, comprobante ilegible, operación no encontrada); el motivo se muestra al cliente. | M | ⬜ |
| RF-ADM-14 | Tras rechazar, el pedido vuelve a `PENDING_PAYMENT` (máx. 2 reintentos) y luego se cancela automáticamente (D18, ver RF-COM-12). | M | ⬜ |
| RF-ADM-15 | Detectar comprobantes repetidos (mismo N.º de operación o hash de imagen) y **bloquear automáticamente** (D21). | M | ⬜ |

### Inventario
| ID | Requerimiento | Prio | Estado |
|---|---|---|---|
| RF-ADM-20 | Ver stock por plan: disponibles, reservadas, vendidas, estado y barra. Filtrar por Todos / Stock bajo / Agotados. | M | ⬜ |
| RF-ADM-21 | Cargar licencias a un plan pegando una por línea o importando CSV, con costo por unidad y proveedor. | M | ⬜ |
| RF-ADM-22 | Antes de confirmar, mostrar resumen **válidas / duplicadas (se omiten) / con error**. Los duplicados se detectan por hash. | M | ⬜ |
| RF-ADM-23 | Cada carga crea un **lote** y deja auditoría. | M | ⬜ |
| RF-ADM-24 | Anular (`VOID`) una licencia disponible con motivo. | S | ⬜ |
| RF-ADM-25 | Umbral de stock bajo configurable por plan. | S | ✅ (campo `lowStockThreshold`) |
| RF-ADM-26 | Alerta cuando un plan cae bajo el umbral (trabajo `low-stock-check`). | S | ⬜ |

### Reclamos
| ID | Requerimiento | Prio | Estado |
|---|---|---|---|
| RF-ADM-30 | Cola de reclamos con lo que dijo el cliente, la clave entregada (oculta) y el stock disponible para reponer. | M | ⬜ |
| RF-ADM-31 | **Entregar reemplazo:** marca la clave original `VOID`, asigna una nueva `SOLD` al cliente, resuelve el reclamo y notifica. | M | ⬜ |
| RF-ADM-32 | Rechazar un reclamo con motivo. | M | ⬜ |
| RF-ADM-33 | Si no hay stock para reponer, avisar y permitir resolver más tarde. | S | ⬜ |

### Catálogo (gestión)
| ID | Requerimiento | Prio | Estado |
|---|---|---|---|
| RF-ADM-40 | CRUD completo de categorías, productos (incl. `requiresToolUsername`) y planes (nombre, duración, tipo, precio, moneda, umbral), **desde Sprint 2** (D38, adelantado de Sprint 3). | M | ⬜ |
| RF-ADM-41 | Gestión de usuarios (ver, bloquear). | C | ⬜ |
| RF-ADM-42 | Configuración (`settings`): TTL de reserva, horario de atención, datos de pago, SLA de revisión (24 h), monto máximo de primer pedido para clientes nuevos. | M | ⬜ |
| RF-ADM-43 | Reportes por rango de fechas: **ventas por día/semana**, **margen por producto**, **stock valorizado**, **top productos/planes vendidos** (D55). | M | ⬜ |
| RF-ADM-44 | Resolver tickets de soporte: ver cola, responder, cerrar (D34). | M | ⬜ |
| RF-ADM-45 | Moderar reseñas: aprobar u ocultar (D33). | S | ⬜ |

---

## RF-NOT · Notificaciones

| ID | Requerimiento | Prio | Estado |
|---|---|---|---|
| RF-NOT-01 | Cola de notificaciones con reintentos exponenciales (5 intentos). | M | ✅ |
| RF-NOT-02 | Un mismo mensaje nunca se envía dos veces aunque BullMQ reintente. | M | ✅ |
| RF-NOT-03 | Correo al entregar la licencia. | M | ⬜ (cola lista, falta proveedor) |
| RF-NOT-04 | Correo al rechazar un pago, con motivo. | M | ⬜ |
| RF-NOT-05 | Correo al resolver un reclamo. | S | ⬜ |
| RF-NOT-06 | Aviso al admin de nuevo comprobante / stock bajo por **correo + WhatsApp** (`wa.me`) (D37). | M | ⬜ |
| RF-NOT-07 | Aviso al cliente por correo + WhatsApp (`wa.me`) en los eventos clave del pedido (D32). | M | ⬜ |

---

## RF-SUP · Soporte (tickets, D34)

| ID | Requerimiento | Prio | Estado |
|---|---|---|---|
| RF-SUP-01 | El cliente crea un ticket de soporte con asunto y mensaje inicial. | M | ⬜ |
| RF-SUP-02 | El cliente ve sus tickets y su historial de mensajes; puede responder mientras esté `OPEN`. | M | ⬜ |
| RF-SUP-03 | El admin ve la cola de tickets abiertos, responde y cierra (`CLOSED`). | M | ⬜ |
| RF-SUP-04 | Un ticket cerrado no acepta nuevos mensajes del cliente (debe abrir uno nuevo). | S | ⬜ |

---

## RF-AUD · Auditoría y trazabilidad

| ID | Requerimiento | Prio | Estado |
|---|---|---|---|
| RF-AUD-01 | Registrar en `audit_logs`: carga de lotes, anulación, aprobación/rechazo de pagos, revelado de claves, resolución de reclamos, cambios de precio. | M | 🟡 (tabla lista, falta escribir los eventos) |
| RF-AUD-02 | Cada licencia es trazable: lote → pedido → cliente → reclamos. | M | ✅ (modelo) |
