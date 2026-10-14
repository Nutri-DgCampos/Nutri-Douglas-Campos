# Imagem do app (Next.js) em tres etapas: dependencias, build e execucao.

FROM node:22-alpine AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS construcao
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
# Variaveis NEXT_PUBLIC_* entram no JavaScript do navegador durante o build,
# por isso chegam como argumento e nao em tempo de execucao.
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Pasta dos arquivos enviados (dietas e comprovantes); o compose monta um volume aqui.
# Criada com o dono certo para o volume nascer gravavel pelo usuario "node".
RUN mkdir -p /dados/arquivos && chown -R node:node /dados
COPY --from=construcao --chown=node:node /app/public ./public
COPY --from=construcao --chown=node:node /app/.next/standalone ./
COPY --from=construcao --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
