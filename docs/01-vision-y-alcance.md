# 01 · Visión y alcance

## Resumen
**Marca comercial: Free Cell** (dominio y correo corporativo aún placeholder, ver `docs/09` D44).
Tienda web para vender **licencias (claves) de herramientas de servicio técnico de celulares** a técnicos y talleres.
La operación es **manual**: el socio de negocio compra lotes de licencias a proveedores y los carga en el sistema.
El cliente elige un plan, **paga por Yape/Plin o transferencia y sube su comprobante**; el operador lo revisa y,
al aprobarlo, el sistema entrega la licencia que se había **reservado** para ese pedido.

Referencia de rubro: GsmServer (gsmserver.es) y tiendas de licencias de herramientas GSM (ver `docs/design/`).

## Actores
| Actor | Descripción |
|---|---|
| **Cliente** | Técnico o taller que compra licencias. Usa celular y PC. Necesita rapidez, claridad de plazos y respaldo si la clave falla. |
| **Operador / Admin** | Socio de negocio. Carga stock, aprueba pagos, atiende reclamos, define precios. Debe resolver su día en pocos clics. |
| **Desarrollador** | Alfredo. Construye y mantiene el sistema (NestJS + Next.js). |
| *Revendedor (futuro)* | Cliente con precios distintos y volumen. Fuera del MVP. |

## Reparto de responsabilidades
- **Alfredo:** desarrollo web (API, tienda, panel admin) e infraestructura.
- **Socio:** negocio, proveedores, precios, soporte y operación diaria (carga de stock, aprobación de pagos).

## Alcance del MVP
**Dentro:**
1. Catálogo público con productos, planes (30/90/365 días; activación nueva o renovación), precios y estado de stock (solo estado, no cantidad exacta).
2. Cuentas de cliente (registro, login, perfil), con verificación de correo obligatoria antes de la primera compra.
3. **Carrito** con varias licencias por pedido, reserva de 30 min sobre todas sus líneas, pago manual con comprobante y entrega de la(s) clave(s) en "Mis pedidos" + correo/WhatsApp.
4. Reclamos de claves inválidas con reposición (máx. 1 por pedido, ventana de 7 días) y reembolso manual como alternativa.
5. Soporte por tickets y reseñas de compradores verificados, moderadas por admin.
6. Panel admin: inicio ("Hoy"), pagos por revisar, inventario (carga de stock por texto/CSV), reclamos, CRUD de catálogo, soporte/reseñas.
7. Colas con BullMQ: liberación de reservas vencidas y notificaciones con reintentos.

**Fuera del MVP (decisiones tomadas):**
- Créditos, saldo o billetera: **se venden solo claves/licencias**.
- Integración con APIs de proveedores o entrega 100 % automática desde un proveedor: la gestión es manual.
- Pasarela de pago con confirmación automática (Culqi, Niubiz, Mercado Pago): fase posterior.
- Servicio directo de desbloqueo/reparación de equipos: el foco pasó a la venta de licencias (revisar más adelante).
- Programa de fidelidad, comparador, listas de deseos, app móvil nativa.
- Boleta/factura electrónica (SUNAT), 2FA para admin, rotación de llave de cifrado (`keyVersion`), separación de roles ADMIN/OWNER: quedan diferidos (ver `docs/09`, D40, D36, D50, D35).

## Objetivos
- **Negocio:** vender licencias con operación diaria de bajo esfuerzo y baja tasa de fraude.
- **Técnico:** cero licencias duplicadas, cero ventas sin stock, trazabilidad completa.
- **Portafolio (Alfredo):** proyecto real con problemas de ingeniería demostrables (concurrencia, colas, idempotencia, cifrado).

## Métricas de éxito (propuestas, por validar)
- Tiempo entre "pago aprobado" y "cliente ve su clave": < 1 min.
- Tiempo medio entre "comprobante subido" y "pago revisado": < [X] min en horario de atención.
- Reclamos por clave inválida: < [X] % de las ventas.
- Cero casos de una misma licencia vendida dos veces.

## Glosario
| Término | Significado |
|---|---|
| **Licencia / clave** | Código o credencial que activa una herramienta. Se vende una sola vez. |
| **Plan** | Variante comprable de un producto: tipo (nueva/renovación) + duración + precio. |
| **Lote** | Compra de licencias a un proveedor; guarda costo unitario y proveedor. |
| **Reserva** | Licencia apartada para un pedido durante 30 min mientras se paga. |
| **Comprobante** | Captura/foto/PDF del pago (Yape, Plin, transferencia). |
| **Reposición** | Entrega de una licencia nueva cuando la original resultó inválida. |
| **Activación por cuenta** | Licencia que se aplica sobre el usuario del cliente en la herramienta, en lugar de entregar una clave. |
| **Carrito** | Varias licencias (de uno o más planes) agrupadas en un mismo pedido; se reservan y pagan juntas. |
| **Ticket de soporte** | Conversación entre cliente y admin sobre un tema general, distinta de un reclamo de clave inválida. |

## Supuestos
- Moneda única: soles (PEN), precios en céntimos enteros.
- Zona horaria de negocio: America/Lima. Idioma: español (es-PE).
- Volumen inicial bajo (decenas de pedidos al día); el diseño debe escalar sin reescribirse.
- El operador atiende pagos en un horario definido (`[HORARIO]`).
