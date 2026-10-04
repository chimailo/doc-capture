#!/bin/sh
# Runs inside the emsdk container. Builds a SIMD and a non-SIMD variant.
set -eu

# Emscripten link flags. DYNAMIC_EXECUTION=0 removes eval/new Function so the
# output runs under a strict CSP with only 'wasm-unsafe-eval'.
# The trailing space matters: build_js.py appends its own flags directly after
# these with no separator.
FLAGS="-Os -s ALLOW_MEMORY_GROWTH=1 -s FILESYSTEM=0 -s DYNAMIC_EXECUTION=0 -s ENVIRONMENT=web,worker "

build() {
  dir=$1
  shift
  python3 /opencv/platforms/js/build_js.py "$dir" \
    --build_wasm --disable_single_file \
    --config /work/opencv_js.config.py \
    --cmake_option=-DBUILD_LIST=core,imgproc,js \
    --cmake_option=-DWITH_ITT=OFF \
    --build_flags="$FLAGS" \
    "$@"
}

build /out/build_simd --simd
build /out/build_nosimd

mkdir -p /out/dist
cp /out/build_simd/bin/opencv.js /out/dist/opencv-simd.js
cp /out/build_simd/bin/opencv.wasm /out/dist/opencv-simd.wasm
cp /out/build_nosimd/bin/opencv.js /out/dist/opencv.js
cp /out/build_nosimd/bin/opencv.wasm /out/dist/opencv.wasm
