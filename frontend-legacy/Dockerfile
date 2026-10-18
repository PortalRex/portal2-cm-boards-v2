# syntax=docker/dockerfile:1
# Builds the site and serves it with nginx, which also passes /api to the web server.
FROM node:20-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV REACT_APP_API_URL=/api/v1
# Keep webpack's runtime out of index.html: the CSP in nginx.conf allows no inline scripts.
ENV INLINE_RUNTIME_CHUNK=false
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/build /usr/share/nginx/html
