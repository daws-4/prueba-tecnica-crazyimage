# syntax=docker/dockerfile:1

# Construccion e imagen final separadas: la imagen que se ejecuta no lleva ni
# TypeScript ni las dependencias de desarrollo.
FROM node:22-alpine AS build
WORKDIR /app

# Primero los manifiestos: si no cambian, Docker reutiliza la capa de
# dependencias y la reconstruccion baja de minutos a segundos.
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api

# El contrato se compila primero: el API depende de su salida.
RUN npm run build -w @andina/contracts && npm run build -w @andina/api

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
RUN npm ci --omit=dev

COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/apps/api/dist apps/api/dist

# Sin usuario root: si algun dia esto sale de la red interna de Andina, no
# quiero que el primer fallo tenga permisos de administrador.
USER node

EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
