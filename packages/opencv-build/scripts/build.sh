#!/bin/sh
# Builds the custom OpenCV.js in Docker and writes the results to ./dist.
# The image only holds the toolchain and OpenCV sources; the build scripts are
# mounted at run time, so editing them does not need an image rebuild.
# Set REBUILD_IMAGE=1 to force `docker build`.
set -eu
cd "$(dirname "$0")/.."

IMAGE=doc-capture/opencv-build:local
PLATFORM=linux/amd64 # emsdk images are amd64-only; runs emulated on Apple Silicon.

if [ "${REBUILD_IMAGE:-0}" = "1" ] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  docker build --platform "$PLATFORM" -t "$IMAGE" .
fi
mkdir -p build dist
docker run --rm --platform "$PLATFORM" \
  -v "$PWD/build:/out" \
  -v "$PWD/build-inside.sh:/work/build-inside.sh:ro" \
  -v "$PWD/opencv_js.config.py:/work/opencv_js.config.py:ro" \
  "$IMAGE"
cp build/dist/* dist/
