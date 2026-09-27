FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY app ./app
COPY src ./src
COPY next.config.mjs postcss.config.cjs tailwind.config.cjs ./
ARG DOGFOOD_API_ORIGIN=http://api:8000
ENV DOGFOOD_API_ORIGIN=${DOGFOOD_API_ORIGIN}
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 DOGFOOD_API_ORIGIN=http://api:8000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
