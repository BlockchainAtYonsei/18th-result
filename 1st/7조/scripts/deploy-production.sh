#!/bin/sh

set -eu

usage() {
    echo "Usage: $0 --tag <sha-tag> [--env-file <path>] [--skip-pull]" >&2
    exit 1
}

image_tag=
env_file=/opt/creator-revenue-bridge/.env.production
skip_pull=false

while [ "$#" -gt 0 ]; do
    case "$1" in
        --tag)
            [ "$#" -ge 2 ] || usage
            image_tag=$2
            shift 2
            ;;
        --env-file)
            [ "$#" -ge 2 ] || usage
            env_file=$2
            shift 2
            ;;
        --skip-pull)
            skip_pull=true
            shift
            ;;
        *) usage ;;
    esac
done

case "$image_tag" in
    sha-*) commit_sha=${image_tag#sha-} ;;
    *) commit_sha= ;;
esac
if [ "${#commit_sha}" -ne 40 ]; then
    echo "Image tag must use the sha-<40 character commit> format." >&2
    exit 1
fi
case "$commit_sha" in
    *[!0-9a-f]*)
        echo "Image tag must contain a lowercase hexadecimal commit." >&2
        exit 1
        ;;
esac

if [ ! -s "$env_file" ]; then
    echo "Production environment file was not found: $env_file" >&2
    exit 1
fi

script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
repo_dir=$(CDPATH='' cd -- "$script_dir/.." && pwd)
compose_file="$repo_dir/compose.prod.yaml"

compose() {
    compose_tag=$1
    shift
    IMAGE_TAG="$compose_tag" docker compose --env-file "$env_file" -f "$compose_file" "$@"
}

current_container=$(compose "$image_tag" ps -q frontend 2>/dev/null || true)
previous_tag=
if [ -n "$current_container" ]; then
    previous_image=$(docker inspect --format '{{.Config.Image}}' "$current_container")
    case "$previous_image" in
        *@*) ;;
        *:*) previous_tag=${previous_image##*:} ;;
    esac
fi

compose "$image_tag" config --quiet

if [ "$skip_pull" = false ]; then
    compose "$image_tag" pull
fi

if compose "$image_tag" up -d --remove-orphans --wait --wait-timeout 120; then
    echo "Production deployment completed: $image_tag"
    exit 0
fi

echo "Deployment health check failed for $image_tag." >&2

if [ -n "$previous_tag" ] && [ "$previous_tag" != "$image_tag" ]; then
    echo "Rolling back to $previous_tag." >&2
    if [ "$skip_pull" = false ]; then
        compose "$previous_tag" pull
    fi
    compose "$previous_tag" up -d --remove-orphans --wait --wait-timeout 120
    echo "Rollback completed: $previous_tag" >&2
else
    echo "No previous immutable image tag is available for rollback." >&2
fi

exit 1
