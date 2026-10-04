#!/bin/sh
# Builds the custom OpenCV.js in Docker and writes the results to ./dist.
set -eu
cd "$(dirname "$0")/.."

IMAGE=doc-capture/opencv-build:local
docker build -t "$IMAGE" .
mkdir -p build dist
docker run --rm -v "$PWD/build:/out" "$IMAGE"
cp build/dist/* dist/
