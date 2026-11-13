FROM node:24-alpine AS development
RUN npm install --global pnpm@10.11.0
WORKDIR /workspace/apps/frontend
COPY apps/frontend/package.json apps/frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY contracts /workspace/contracts
COPY services/collector/fixtures /workspace/services/collector/fixtures
COPY apps/frontend ./
EXPOSE 5173
CMD ["pnpm", "dev:backend", "--host", "0.0.0.0"]

FROM development AS build
ENV VITE_API_MODE=backend VITE_API_BASE_URL="" VITE_DEMO_FIXTURES=off VITE_BASE_PATH=/
ARG VITE_CONSTELLATION_MODELS=0.1.0-draft,0.1.0-single-leader
ENV VITE_CONSTELLATION_MODELS=${VITE_CONSTELLATION_MODELS}
RUN pnpm build

FROM nginx:1.28-alpine AS runtime
COPY docker/frontend.nginx.conf /etc/nginx/nginx.conf
COPY --from=build /workspace/apps/frontend/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
ENTRYPOINT ["nginx", "-g", "daemon off;"]
