# ChatOps Local (Windows AD/DNS/IIS)

Monorepo simple con backend Express y frontend React (Vite) para operar un Agente PowerShell HTTP local mediante una interfaz de chat.

## Instalación

```
cd chatops/server && cp .env.example .env && npm i
cd ../client && npm i
```

## Ejecución

Terminal 1 (backend):
```
cd chatops/server && npm run dev
```

Terminal 2 (frontend):
```
cd chatops/client && npm run dev
```

Frontend en `http://localhost:5173` con proxy a backend `http://localhost:3001`.

## Variables .env (server/.env)

- `PORT` puerto del backend (default 3001)
- `PS_BASE` URL del Agente PowerShell (default `http://localhost:8080`)
- `PS_API_KEY` API key a enviar en `x-api-key`
- `USE_OLLAMA` `true|false` para habilitar modo IA local
- `OLLAMA_URL` endpoint de Ollama generate (default `http://localhost:11434/api/generate`)
- `DEFAULT_OU` OU por defecto (default `OU=Usuarios,DC=empresa,DC=local`)
- `DEFAULT_SCOPE` alcance por defecto de grupos (default `Global`)
- `ADMINS` lista separada por coma de userIds admin (default `admin`)
- `HELPDESK` lista separada por coma de userIds helpdesk (default `helpdesk`)

## Modo IA (opcional)

- Instalar y correr Ollama local.
- Modelo sugerido: `llama3.1:8b-instruct`.
- Poner `USE_OLLAMA=true` en `.env`. Si la IA devuelve `confidence < 0.75` se responderá “No entendí, por favor reformulá”.

## Advertencia

Este proyecto asume un Agente PowerShell corriendo en `http://localhost:8080` con endpoints y permisos adecuados. Todas las llamadas incluyen cabecera `x-api-key` desde `PS_API_KEY`.

## Frases de prueba

- “crear usuario Ana Gomez (sam: ana.gomez) en Usuarios”
- “agregar a ana.gomez al grupo GG_Ventas”
- “crear grupo GG_Marketing”
- “desbloquear a juan.perez”
- “crear A intranet → 10.0.0.50”
- “borrar A intranet → 10.0.0.50”
- “estado del app pool IntranetPool en WEB01”
- “reciclá IntranetPool en WEB01” (debe pedir confirmación)

## Seguridad y logging

- Whitelists en `server/lib/policies.js` para servers, pools, OUs y grupos.
- Acciones sensibles (reciclado de app pool y borrado A) requieren confirmación.
- Logs en `server/logs/actions.jsonl` con líneas JSON `{ts, userId, intent, params, resultOk, message}` y rotación simple (>1MB).

