# Horario Familiar

Horario semanal (lunes a domingo) con **24 franjas por día**, navegable durante todo el año.
Estructura: **Día → Hora → Actividad**. Cada actividad tiene *Actividad a realizar*, *¿Tiene plazo?* y *Notas generales*.
Sin login. Datos en Supabase. Notificaciones push reales (Web Push).

```
index.html                         ← la app (HTML + CSS + JS, sin build)
config.js                          ← AQUÍ van tus claves (Supabase + VAPID pública)
sw.js, manifest.json, familia.png  ← PWA / notificaciones (icono: pon aquí TU familia.png)
sql/01_actividades.sql             ← tabla de actividades + RLS
sql/02_notificaciones_push.sql     ← suscripciones, trigger y avisos programados
supabase/functions/send-push/      ← Edge Function que envía los push
supabase/config.toml
```

**Orden recomendado:** 1) crear proyecto → 2) SQL 01 → 3) `config.js` → 4) probar → 5) notificaciones (VAPID, función, SQL 02) → 6) desplegar.

---

## 1–2. Entrar a Supabase y crear el proyecto

1. Ve a <https://supabase.com> → **Sign in** (puedes entrar con GitHub).
2. **New project** → elige organización → pon un **nombre** (ej. `horario-familiar`), una **contraseña de base de datos** (guárdala) y la **región** más cercana → **Create new project**.
3. Espera ~2 minutos a que termine de crearse.

## 3–7. Tablas, columnas, tipos, claves y relaciones

Se crean ejecutando el SQL del paso 9. Esta es la estructura:

**Tabla `public.actividades`** (clave primaria: `id`; no necesita relaciones con otras tablas)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | `bigint` identity | **Clave primaria** |
| `fecha` | `date`, not null | Día de la actividad |
| `hora` | `smallint`, not null, 0–23 | Hora de inicio: `0` = 12 a. m.–1 a. m. … `23` = 11 p. m.–12 a. m. |
| `tiene_plazo` | `boolean`, not null, default `false` | ¿Tiene plazo? |
| `fecha_plazo` | `date`, null | Fecha límite; obligatoria si `tiene_plazo` es `true` y nula si es `false` |
| `que_hacer` | `text` | Actividad a realizar |
| `notas_generales` | `text` | Notas generales |
| `created_at` | `timestamptz`, default `now()` | |
| `updated_at` | `timestamptz`, default `now()` | Se actualiza sola en cada cambio (trigger) |

- **`UNIQUE (fecha, hora)`**: una sola actividad por franja; identifica cada celda sin ambigüedad (y permite guardar con *upsert*).
- **Tabla `public.push_subscriptions`** (solo notificaciones): `id` (PK), `endpoint` (único), `p256dh`, `auth`, `created_at`. Una fila por dispositivo que activó notificaciones.
- **`private.app_secrets`**: guarda la URL de la función y un secreto; no es accesible desde el navegador.

> **Tablas del proyecto anterior que ya NO se crean:** `schedules` (reemplazada por `actividades`), `audit_logs` (logs de administrador), y la tabla de usuarios con las funciones `login_user` / `register_user` (login). Los eventos se guardaban en el navegador (`localStorage`), no en Supabase. Al ser una base nueva, no hay nada que borrar.

## 8. Políticas RLS

La app **no tiene login**, así que usa la clave pública (*anon*) desde el navegador. Las políticas del SQL permiten con esa clave: leer, insertar, actualizar y borrar en `actividades`; y solo insertar y borrar (no leer ni actualizar) en `push_subscriptions`. Un endpoint repetido se trata como ya registrado, sin consultar la fila privada. Sin esas políticas todas las operaciones fallan.

> ⚠️ Consecuencia: **cualquiera que tenga el enlace de la app puede ver y editar el horario.** Es la misma situación que tenía el proyecto anterior y es inherente a quitar el login.

## 9. SQL que debes ejecutar

En Supabase: menú izquierdo **SQL Editor** → **New query** → pega el contenido → **Run**.

1. **`sql/01_actividades.sql`** — pégalo completo y ejecútalo. Debe terminar con *Success. No rows returned*.
2. **`sql/02_notificaciones_push.sql`** — **hazlo después del paso de notificaciones (abajo)**. Antes de ejecutarlo cambia estas dos líneas:

```sql
insert into private.app_secrets (key, value) values
  ('edge_function_url', 'https://TU_PROJECT_REF.supabase.co/functions/v1/send-push'),
  ('cron_secret', 'EL_MISMO_SECRETO_QUE_USARAS_EN_CRON_SECRET')
```

Si da error de permisos en `create extension`, actívalas en **Database → Extensions** (busca `pg_net` y `pg_cron`) y vuelve a ejecutar.

## 10–11. Variables y dónde colocarlas

En Supabase: **Project Settings** (engranaje) → **API** (o **API Keys**):
- **Project URL** → `SUPABASE_URL`
- **anon public** (o *Publishable key*) → `SUPABASE_ANON_KEY`

Pégalas en **`config.js`** (en la raíz del proyecto). Este proyecto es HTML estático (sin Vite ni build), por eso no usa `.env`.

## 12. Comprobar que la conexión funciona

1. Abre la app. El **puntito junto a "Horario"** debe ponerse **verde** (rojo = sin conexión o `config.js` mal; si falta configurar, la app lo avisa).
2. Pulsa cualquier celda → escribe algo → **Guardar**.
3. En Supabase → **Table Editor → actividades** debe aparecer la fila con la fecha y hora correctas.
4. Recarga la página: la actividad sigue ahí. Cambia de semana con las flechas y vuelve.

Si ves un error como *Could not find the table 'public.actividades'*, no ejecutaste el SQL 01 en ese proyecto.

## 13. Ejecutarlo localmente

No lo abras con doble clic (`file://`): el service worker y las notificaciones no funcionan así. Desde la carpeta del proyecto:

```bash
python3 -m http.server 8000      # o:  npx serve .
```

y abre <http://localhost:8000>.

## Notificaciones push (misma arquitectura de siempre)

Web Push real: llegan aunque la pestaña esté cerrada. Se hace **una vez**.

```bash
npm install -g supabase
supabase login

# 1) Genera llaves VAPID NUEVAS para este proyecto
npx web-push generate-vapid-keys
```

- La **Public Key** va en `config.js` → `VAPID_PUBLIC_KEY`.
- La **Private Key** nunca va en el navegador ni en el repositorio: solo como secreto del servidor.

```bash
# 2) Secretos de la Edge Function (inventa CRON_SECRET: openssl rand -hex 32)
supabase secrets set VAPID_PUBLIC_KEY=TU_PUBLICA  --project-ref TU_PROJECT_REF
supabase secrets set VAPID_PRIVATE_KEY=TU_PRIVADA --project-ref TU_PROJECT_REF
supabase secrets set CRON_SECRET=EL_MISMO_SECRETO_DEL_SQL --project-ref TU_PROJECT_REF

# 3) Despliega la función (config.toml ya trae verify_jwt = false)
supabase link --project-ref TU_PROJECT_REF
supabase functions deploy send-push --project-ref TU_PROJECT_REF
```

Después ejecuta `sql/02_notificaciones_push.sql` (con tu URL `https://TU_PROJECT_REF.supabase.co/functions/v1/send-push` y el mismo `CRON_SECRET`). `TU_PROJECT_REF` es el identificador de tu proyecto Supabase.

Finalmente, en la app pulsa **"🔕 Activar notificaciones"** y acepta el permiso (una vez por cada dispositivo/navegador).
> Si ese navegador ya tenía las notificaciones activadas con el proyecto anterior, pulsa el botón para **desactivarlas y vuelve a activarlas**: así se registra en la base nueva.

**Qué se notifica** (a todos los dispositivos suscritos, con prioridad alta):

| Aviso | Cuándo | Texto |
|---|---|---|
| 📌 Nueva actividad / ✏️ Actividad modificada | Al crear o cambiar la actividad a realizar o el plazo (no por cambios solo de notas) | Actividad a realizar, hora, fecha, plazo y notas si hay |
| 📚 Actividad próxima | Al inicio de cada hora, si hay actividad en esa franja (los 7 días) | Igual que arriba |
| ☀️ Actividades de hoy (N) | Todos los días a las 5:30 a. m. (hora Bogotá) | Lista de las actividades del día |

## 14. Desplegar en GitHub Pages

El proyecto ya está preparado (`.nojekyll` incluido, rutas relativas, sin build).

1. Crea un repositorio en GitHub y sube **todos** los archivos (incluido `config.js` ya con tus claves: son públicas por diseño).
2. Repo → **Settings → Pages** → *Build and deployment*: **Deploy from a branch** → rama `main`, carpeta **/ (root)** → **Save**.
3. En 1–2 minutos queda en `https://TU_USUARIO.github.io/TU_REPO/`.

Cada `git push` a `main` actualiza la página.

---

## `.env que debo configurar`

Este proyecto no usa `.env`; las variables del navegador van en **`config.js`**:

```js
window.HORARIO_CONFIG = {
  SUPABASE_URL: 'https://TU_PROJECT_REF.supabase.co',
  SUPABASE_ANON_KEY: 'TU_ANON_O_PUBLISHABLE_KEY',
  VAPID_PUBLIC_KEY: 'TU_VAPID_PUBLIC_KEY'
};
```

Y las del **servidor** (solo si usas notificaciones), con `supabase secrets set`:

```env
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
CRON_SECRET=
```

(`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` ya existen automáticamente dentro de las Edge Functions.)

## Notas honestas

- Los avisos programados dependen de `pg_cron`: si tu proyecto gratuito de Supabase se **pausa por inactividad**, dejan de salir hasta que lo reactives.
- Las horas de los avisos usan la zona **America/Bogota** (UTC-5, sin horario de verano).
