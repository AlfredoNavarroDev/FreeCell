# 09 · Decisiones tomadas y preguntas abiertas

## A. Decisiones ya tomadas (no reabrir sin motivo)
| # | Decisión | Razón |
|---|---|---|
| D1 | Se venden **solo claves/licencias** (sin créditos ni saldo). | Alcance del negocio acordado con el socio. |
| D2 | Gestión de licencias **manual** (sin API de proveedor). | El socio compra lotes y los carga. |
| D3 | **BullMQ + Redis** desde el MVP. | Casos reales (reservas con expiración, notificaciones con reintentos) y valor de portafolio. |
| D4 | Reserva de **30 min** con liberación diferida + barrido de respaldo. | Evita vender dos veces y no deja stock bloqueado. |
| D5 | Pago **manual con comprobante** (Yape/Plin/transferencia) aprobado por el operador. | Sin pasarela al inicio; menor fricción de arranque. |
| D6 | Reserva con `SELECT … FOR UPDATE SKIP LOCKED`. | Correctitud bajo concurrencia, probada. |
| D7 | Claves cifradas con AES-256-GCM; llave en variable de entorno. | Un volcado de la base no expone las licencias. |
| D8 | **TypeORM** como ORM. | Nativo en Nest, soporta `SKIP LOCKED`; Prisma no pudo verificarse en el entorno del Sprint 1. *Reabrible si se prefiere Prisma.* |
| D9 | Paquetes `@nestjs/*` en ramas CommonJS (4/11). | Las v12 son solo ESM. |
| D10 | Dinero en céntimos enteros; moneda PEN. | Evita errores de redondeo. |
| D11 | Diseño **claro y limpio, denso en contenido**. | Preferencia del usuario. |
| D12 | Panel admin con cola + detalle y aprobación en un clic. | "Eficiente e intuitivo" para la operación diaria. |
| D13 | Servicio directo de desbloqueo/reparación fuera del MVP. | El foco pasó a licencias. |

## B. Preguntas abiertas para el brainstorming
Ordenadas por impacto. Cada una incluye una **propuesta por defecto** para no bloquear el avance.

### B1. Modelo de producto (alto impacto)
1. **¿Algunos productos son "activación por cuenta" en vez de clave?** Es decir: el cliente da su usuario en la herramienta y el operador aplica la licencia.
   - *Propuesta:* bandera `requiresToolUsername` por producto; esos pedidos añaden un estado intermedio `PENDING_ACTIVATION` tras aprobar el pago, y el admin marca "activado".
2. **¿Existen renovaciones?** ¿Se compran sobre una cuenta existente (requieren usuario) o son claves distintas?
3. **¿Una licencia puede servir para varios dispositivos o tiene vigencia que empieza al entregar o al activar?** Afecta garantía y reclamos.
4. **¿Qué se vende exactamente?** Lista inicial de productos, categorías y planes con precios; qué proveedores y qué costos.

### B2. Pagos y fraude
5. **Tras rechazar un pago, ¿el cliente puede reintentar?** *Propuesta:* sí, el pedido vuelve a `PENDING_PAYMENT` con un plazo extra [N] min; máximo [2] reintentos; luego se cancela.
6. **¿Cuánto puede esperar una licencia en `IN_REVIEW`?** Hoy no expira. *Propuesta:* SLA de [N] horas con alerta al operador y cancelación manual.
7. **¿Cómo se concilia el pago?** Revisión visual del comprobante vs. consulta de la app/banco. ¿Se guarda el N.º de operación?
8. **Detección de comprobantes reutilizados** (hash de imagen, N.º de operación único). ¿Se bloquea o solo se alerta?
9. **Límites para clientes nuevos** (primera compra, monto máximo, verificación de correo/teléfono).
10. **¿Cuándo se pasa a pasarela automática** (Culqi/Niubiz/Mercado Pago) y a partir de qué volumen?

### B3. Entrega y reclamos
11. **¿La clave se envía por correo o solo se muestra en la cuenta?** *Propuesta:* mostrar en la cuenta y enviar un correo con enlace (menor exposición).
12. **Política de reposición:** ventana (¿7 días?), causas válidas, límite de reposiciones por pedido, qué pasa si no hay stock para reponer (¿reembolso? ¿espera?).
13. **Reembolsos:** ¿existen? ¿por Yape/transferencia? ¿Cómo se registran?
14. **Modelo de datos del reemplazo:** `replacesId` vs reasignar `orderItemId` (ver `05-modelo-de-datos.md`).

### B4. Catálogo y comunicación
15. **¿Mostrar cantidad exacta de stock o solo estado?** *Propuesta:* solo estado (evita revelar inventario).
16. **Carrito y varias licencias por pedido.** *Propuesta:* no en el MVP.
17. **Compra sin cuenta (invitado)** vs registro obligatorio. *Propuesta:* registro obligatorio para poder ver "Mis pedidos" y reclamar.
18. **Canales de aviso:** correo (¿proveedor? Resend/Brevo/SMTP) y WhatsApp (¿API oficial, enlace `wa.me`, o manual?).
19. **Reseñas:** ¿cómo se verifican y moderan? Solo reales.
20. **Soporte:** ¿WhatsApp como canal principal? ¿horario? ¿se necesita un sistema de tickets?

### B5. Admin y operación
21. **¿Cuántos operadores?** ¿Roles distintos (operador de pagos vs dueño con costos y márgenes)? *Propuesta:* un rol ADMIN al inicio.
22. **¿2FA obligatorio para ADMIN?**
23. **Notificación al operador** de nuevos comprobantes: correo, WhatsApp o push.
24. **Edición de catálogo:** ¿desde el panel o por seed/SQL en el MVP? *Propuesta:* seed + panel básico en Sprint 3.
25. **Reportes mínimos** que el socio necesita (ventas por día, margen por producto, stock valorizado).

### B6. Legal y negocio
26. **Comprobantes de venta (boleta/factura SUNAT):** ¿se emiten? ¿quién? ¿integración?
27. **Términos de uso, política de privacidad y reposición:** redacción y revisión legal.
28. **Uso de nombres/logos de herramientas:** permisos y cómo mostrarlos.
29. **Licitud del servicio:** declaración del cliente sobre titularidad del equipo.
30. **Marca y dominio:** nombre comercial, dominio, correo corporativo.

### B7. Técnicas
31. **Estilos del frontend:** Tailwind (propuesto) vs CSS Modules.
32. **Sesión:** cookie `httpOnly` propia vs NextAuth.
33. **Admin en la misma app Next.js o en un despliegue aparte.**
34. **Proveedor de Redis y plan** (Upstash tiene límite de comandos; BullMQ consume por sondeo).
35. **Cold starts de Render** y alternativas (Railway, Fly.io, VPS).
36. **Rotación de la llave de cifrado:** ¿se implementa `keyVersion` ya o más adelante?
37. **Moneda y localización futuras** (USD, otros países).
38. **Estrategia de ramas, CI/CD y entornos** (staging).

## C. Riesgos principales
| Riesgo | Impacto | Mitigación |
|---|---|---|
| Pérdida de `LICENSE_ENC_KEY` | Claves irrecuperables | Respaldo seguro de la llave; procedimiento documentado |
| Fraude con comprobantes falsos | Pérdida directa | Verificación contra app/banco, hash de comprobantes, límites a clientes nuevos |
| Revisión lenta de pagos | Mala experiencia y stock retenido | SLA, alertas, horario visible, notificación al operador |
| Claves inválidas del proveedor | Reclamos y reputación | Flujo de reposición ágil, lotes con proveedor trazable, métricas por lote |
| Riesgo legal por el tipo de herramientas | Cierre o sanción | Términos claros, declaración de uso lícito, asesoría |
| Dependencia de un solo operador | Retrasos | Documentar el proceso; segundo operador cuando crezca |
| Redis caído | Reservas no se liberan a tiempo | Barrido al recuperarse; PostgreSQL como fuente de verdad |
