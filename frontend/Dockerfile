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
# master too, so nothing in the container runs as root.
#
# Everything nginx writes at runtime is moved into /tmp: the pid file here, the
# temp directories in conf.d/default.conf. Handing over the image's own
# locations with chown is not enough and looks like it should be — the compose
# file covers this container's filesystem with `read_only: true` and mounts a
# fresh tmpfs where writes are still needed, and a tmpfs arrives owned by root
# with mode 0755, hiding whatever the build chowned underneath it. nginx then
# fails at startup with "mkdir /var/cache/nginx/client_temp failed (13:
# Permission denied)" and the container restarts forever.
#
# /tmp is the exception Docker makes: a tmpfs there is created world-writable
# with the sticky bit (1777), so an unprivileged process can use it. One
# writable directory, and it is the one that already had to exist.
RUN sed -i -e '/^user /d' -e 's|^pid .*|pid /tmp/nginx.pid;|' /etc/nginx/nginx.conf \
    && chown -R nginx:nginx /usr/share/nginx/html
USER nginx

EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
