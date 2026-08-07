# --- Build stage ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# `npm ci` installs exactly the lockfile, so a build cannot silently pick up a
# version nobody reviewed — which is how a dependency compromise arrives.
RUN npm ci
COPY . .
# VITE_API_URL is baked at build time; empty means same-origin /api (the nginx
# proxy here, the rewrite in vercel.json on Vercel). Setting it to the backend's
# own URL makes the browser call cross-site, and the session cookie stops
# travelling — see frontend/DEPLOY.md.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- Serve stage ---
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# nginx's own workers already drop to an unprivileged user; this drops the
# master too, so nothing in the container runs as root. The directories nginx
# writes to at runtime have to be handed over with it.
RUN touch /var/run/nginx.pid \
    && chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx /usr/share/nginx/html \
    && sed -i '/^user /d' /etc/nginx/nginx.conf
USER nginx

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
