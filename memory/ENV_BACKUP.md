# Copia de seguridad de /app/.env (NO gitignored — este archivo SÍ persiste)

CAUSA RAÍZ (confirmada por troubleshoot_agent): el archivo /app/.env está en
.gitignore por seguridad, y la base de datos MongoDB vive en almacenamiento
EFÍMERO (/var/lib/mongodb, fuera del volumen persistente de /app). Cuando el
pod/contenedor se recrea, `/app` se repuebla desde git (que NO incluye
.env por ser gitignored) y MongoDB queda completamente vacío. Por eso
".env se pierde" y la base de datos aparece vacía repetidamente.

FIX permanente: cada vez que .env falte, restaurar exactamente este contenido
en /app/.env y volver a sembrar los usuarios de prueba (ver
scripts/seed-core-users.mjs y memory/test_credentials.md).

## Contenido de referencia de /app/.env

```
MONGO_URL=mongodb://localhost:27017/twyk
ADMIN_EMAILS=twyk.apk@gmail.com
NEXT_PUBLIC_BASE_URL=https://profile-layer-match.preview.emergentagent.com
CORS_ORIGINS=https://profile-layer-match.preview.emergentagent.com
```

NOTA: si la URL de preview cambia (nuevo dominio *.preview.emergentagent.com),
actualizar NEXT_PUBLIC_BASE_URL y CORS_ORIGINS con el valor de la variable de
entorno APP_URL definida en /etc/supervisor/conf.d/*.conf (bloque [program:nextjs]).

## Última URL usada (actualizada automáticamente al restaurar)
NEXT_PUBLIC_BASE_URL=https://05519917-ad10-452b-9897-168f7b7785cd.preview.emergentagent.com

## NOTA sobre ffmpeg (persistencia)
ffmpeg también se pierde tras cada reinicio de pod (paquete apt en filesystem
raíz efímero). Ya existe un script 'predev' en package.json que lo reinstala
automáticamente en cada 'yarn dev', pero si el arranque falla o tarda, puede
reinstalarse manualmente con: apt-get update -qq && apt-get install -y -qq ffmpeg

## Re-sembrar datos tras restaurar .env

```bash
sudo supervisorctl restart nextjs
node /app/scripts/seed-core-users.mjs
```

Esto crea (si no existen ya) twykadmin (admin), lucia, marcos y laura con las
credenciales documentadas en memory/test_credentials.md, y las relaciones de
"follow" básicas entre ellos.
