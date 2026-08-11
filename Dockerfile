FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

RUN apt-get update && apt-get upgrade -y && apt-get install -y --no-install-recommends \
        nginx supervisor gettext-base curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

# Python dependencies
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev

COPY src/ ./src/
COPY css/        ./css/
COPY js/         ./js/
COPY icons/      ./icons/
COPY index.html  settings.html  dashboard.html  manifest.json  sw.js  ./

COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY supervisord.conf /etc/supervisor/conf.d/stormwatch.conf

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app/src" \
    PORT=5000 \
    NGINX_PORT=8080

# Non-root: nginx.conf.template's ${NGINX_PORT} is >1024 so no bind capability is needed.
RUN mkdir -p /app/frames \
    && useradd -u 1000 -d /app -s /usr/sbin/nologin stormwatch \
    && ln -sf /dev/stdout /var/log/nginx/access.log \
    && ln -sf /dev/stderr /var/log/nginx/error.log \
    && chown -R stormwatch:stormwatch /app /var/lib/nginx /run /etc/nginx/sites-enabled \
    && sed -i '/^user www-data;/d' /etc/nginx/nginx.conf \
    && rm -f /etc/nginx/sites-enabled/default

USER stormwatch
EXPOSE 8080

CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]
