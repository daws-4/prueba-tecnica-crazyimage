# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/panel/package.json apps/panel/
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/panel apps/panel

# El contrato primero: el panel lo importa para validar en ejecucion lo que le
# devuelve el API.
RUN npm run build -w @andina/contracts && npm run build -w @andina/panel

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# `output: standalone` deja en .next/standalone solo lo que hace falta para
# ejecutar, con su propio node_modules recortado. La imagen final no lleva ni
# Next completo ni las dependencias de desarrollo.
COPY --from=build /app/apps/panel/.next/standalone ./
COPY --from=build /app/apps/panel/.next/static ./apps/panel/.next/static

USER node

EXPOSE 3000
CMD ["node", "apps/panel/server.js"]
