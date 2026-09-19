# LOG_ON Control Plane

Next.js operator console for the LOG_ON durable execution kernel.

## Start

From the repository root:

~~~bash
npm install
npm run build
npm run start:control-plane-api
~~~

In a second terminal:

~~~bash
npm run dev:control-plane
~~~

The API defaults to http://127.0.0.1:4100. The Next.js app defaults to http://localhost:3000 and proxies /api/* to the API.

## Required environment

~~~bash
LOGON_DATABASE_URL=postgres://logon:logon@localhost:5432/logon
LOGON_CONTROL_PLANE_API_PORT=4100
LOGON_CONTROL_PLANE_API_HOST=127.0.0.1
~~~

For a fixed local tenant:

~~~bash
LOGON_CONTROL_PLANE_TENANT_ID=demo
NEXT_PUBLIC_LOGON_TENANT_ID=demo
~~~

For production, do not treat NEXT_PUBLIC_LOGON_TENANT_ID as an authentication mechanism. Tenant identity must come from an authenticated server-side principal.
