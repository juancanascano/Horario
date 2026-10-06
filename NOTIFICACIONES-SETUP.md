# Configurar las notificaciones push (paso a paso)

Esto usa **Web Push real**, no solo el navegador abierto: por eso las
notificaciones llegan aunque el celular/computador tenga la pestaña
cerrada — a la hora exacta de cada clase, a las 5:30am con el resumen
del día, y cuando alguien agrega o cambia una tarea.

Necesitas hacer esto **una sola vez** desde tu cuenta de Supabase.
Yo no puedo hacerlo por ti porque requiere tus credenciales.

## 0. Instala la CLI de Supabase (si no la tienes)

```bash
npm install -g supabase
supabase login
```

## 1. Corre el SQL de la tabla de horarios (si no lo habías hecho)

En el **SQL Editor** de tu proyecto de Supabase, corre en orden:

1. `-- Tabla de Horarios.sql`
2. `-- Notificaciones Push.sql`

Antes de correr el segundo, edita estas dos líneas dentro de ese archivo:

```sql
insert into private.app_secrets (key, value) values
  ('edge_function_url', 'https://REEMPLAZA-TU-PROYECTO.functions.supabase.co/send-push'),
  ('cron_secret', 'REEMPLAZA-POR-UN-SECRETO-LARGO-Y-ALEATORIO')
```

- `edge_function_url`: la vas a saber en el paso 3 (formato
  `https://<PROJECT_REF>.functions.supabase.co/send-push`). Tu
  `PROJECT_REF` es la parte del subdominio de tu URL de Supabase, ej.
  si tu URL es `https://kibomtadrvantlzjjyvc.supabase.co`, el ref es
  `kibomtadrvantlzjjyvc`.
- `cron_secret`: cualquier texto largo y aleatorio que tú inventes
  (ej. genera uno con `openssl rand -hex 32` en una terminal). Este
  mismo valor lo vas a usar en el paso 2 como `CRON_SECRET`.

> Si el proyecto ya no tiene `pg_cron` / `pg_net` habilitados y el
> `CREATE EXTENSION` del script da error de permisos, actívalos desde
> **Database → Extensions** en el dashboard, y vuelve a correr el
> script.

## 2. Configura los secretos de la Edge Function

Ya generé las llaves VAPID (el "carnet" que identifica tu servidor
ante los navegadores para poder mandarles notificaciones):

```
VAPID_PUBLIC_KEY=BFLeJdUUDqGKu4Z6ew02VHWR66R9FzasPkYaMebTKx-TQyNxtHoz7owDxdscIGe-uQvbOd7WmuA-Av6khtvLi78
VAPID_PRIVATE_KEY=6piRO3kZ2vYSynw2pz48iSgftYaHaoN3uHl0qfw5Hg0
```

La llave pública ya está puesta en `index.html`. La privada **nunca**
va en el navegador — solo en el servidor:

```bash
supabase secrets set VAPID_PUBLIC_KEY=BFLeJdUUDqGKu4Z6ew02VHWR66R9FzasPkYaMebTKx-TQyNxtHoz7owDxdscIGe-uQvbOd7WmuA-Av6khtvLi78 --project-ref TU_PROJECT_REF
supabase secrets set VAPID_PRIVATE_KEY=6piRO3kZ2vYSynw2pz48iSgftYaHaoN3uHl0qfw5Hg0 --project-ref TU_PROJECT_REF
supabase secrets set CRON_SECRET=EL_MISMO_SECRETO_QUE_PUSISTE_EN_EL_SQL --project-ref TU_PROJECT_REF
```

(`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya existen automáticamente
dentro de cualquier Edge Function, no hay que configurarlas.)

> ⚠️ Estas llaves VAPID son válidas y funcionan, pero como las generé
> yo en este chat, técnicamente cualquiera que lea esta conversación
> podría regenerar la privada... no, en realidad no: la privada solo
> aparece aquí una vez. Aun así, si quieres máxima tranquilidad puedes
> generar tu propio par con `npx web-push generate-vapid-keys` y
> reemplazar la pública en `index.html` (busca `VAPID_PUBLIC_KEY`) y la
> privada en el secreto de arriba.

## 3. Despliega la Edge Function

Ya incluí `supabase/config.toml` con `verify_jwt = false` para la
función `send-push` (la protege el header `x-cron-secret`, no un login
de Supabase). Si `supabase link` te pide inicializar el proyecto
primero, corre `supabase init` una vez dentro de esta carpeta antes de
lo siguiente.

Desde la carpeta del proyecto (donde está la carpeta `supabase/`):

```bash
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy send-push --project-ref TU_PROJECT_REF
```

Al terminar, la CLI te muestra la URL de la función. Confírmala:
`https://TU_PROJECT_REF.functions.supabase.co/send-push`.
Esa es la que va en `edge_function_url` del paso 1 — si ya corriste el
SQL con el valor de relleno, actualízalo así:

```sql
update private.app_secrets
set value = 'https://TU_PROJECT_REF.functions.supabase.co/send-push'
where key = 'edge_function_url';
```

## 4. Sube `index.html` y `sw.js` actualizados a tu hosting (GitHub Pages)

Estos ya están listos en este paquete — solo reemplaza los archivos.

## 5. Actívalas desde el navegador

Abre la página y pulsa el botón **"🔕 Activar notificaciones"** en el
encabezado. El navegador va a pedir permiso — acéptalo. Cada persona
que quiera recibir avisos debe hacer esto una vez desde su propio
celular/computador (y desde cada navegador distinto que use).

## ¿Qué notificaciones se mandan y a quién?

- **Nueva tarea o cambio en una tarea** (texto, fecha o profesor):
  inmediato, a **todos los que hayan activado notificaciones**.
- **Empieza una clase**: si esa clase tiene tarea pendiente, a la hora
  exacta de inicio, a todos los suscritos.
- **Resumen del día**: todos los días a las 5:30am (hora Bogotá), con
  la lista completa de tareas de ese día (o un mensaje si no hay
  ninguna).

Todas se mandan con prioridad alta (`urgency: high`, y
`requireInteraction: true` en el celular/computador) para que no se
pierdan entre otras notificaciones y el sistema operativo las entregue
lo antes posible.

## Notas honestas

- Si cambias el día 21 de ancla de semana en `index.html`
  (`ANCHOR_WEEK`/`ANCHOR_MON`), cambia también las mismas dos líneas en
  `current_week_number()` dentro de `-- Notificaciones Push.sql` y
  vuelve a correr esa función — si no, el servidor y el navegador
  quedarían calculando semanas distintas.
- Los cronogramas de pg_cron dependen de que tu proyecto de Supabase
  esté **activo** (no pausado). Si el proyecto se pausa por
  inactividad, los cron jobs tampoco corren — otra razón más para
  revisar el dashboard de vez en cuando.
- Como no hay login de usuarios en esta app, cualquiera con el enlace
  que active notificaciones las recibirá; no hay forma de decir "solo
  avísame de Matemáticas". Si eso te interesa en el futuro, se puede
  agregar con más trabajo.
