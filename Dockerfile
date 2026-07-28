FROM node:22-alpine AS build
WORKDIR /app

COPY package.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm install --omit=dev --workspace server --no-audit --no-fund

COPY --from=build /app/server/dist server/dist
COPY --from=build /app/client/dist client/dist

EXPOSE 3001
CMD ["node", "server/dist/index.js"]
