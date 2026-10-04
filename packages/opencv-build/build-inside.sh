#!/bin/sh
# Runs inside the emsdk container. Builds a SIMD and a non-SIMD variant.
set -eu

COMMON="--build_wasm --disable_single_file \
  --config /work/opencv_js.config.py \
  --cmake_option=-DBUILD_LIST=core,imgproc,js \
  --cmake_option=-DCV_ENABLE_INTRINSICS=ON \
  --cmake_option=-DWITH_ITT=OFF \
  --cmake_option=-DBUILD_opencv_dnn=OFF \
  --cmake_option=-DBUILD_opencv_features2d=OFF \
  --cmake_option=-DBUILD_opencv_photo=OFF \
  --cmake_option=-DBUILD_opencv_video=OFF \
  --cmake_option=-DBUILD_opencv_calib3d=OFF \
  --cmake_option=-DBUILD_opencv_objdetect=OFF \
  --build_flags=-Os -s MODULARIZE=1 -s EXPORT_NAME=cv -s ALLOW_MEMORY_GROWTH=1 -s ENVIRONMENT=web,worker -s FILESYSTEM=0 -s DYNAMIC_EXECUTION=0"

python3 /opencv/platforms/js/build_js.py /out/build_simd $COMMON --simd
python3 /opencv/platforms/js/build_js.py /out/build_nosimd $COMMON

mkdir -p /out/dist
cp /out/build_simd/bin/opencv.js /out/dist/opencv-simd.js
cp /out/build_simd/bin/opencv.wasm /out/dist/opencv-simd.wasm
cp /out/build_nosimd/bin/opencv.js /out/dist/opencv.js
cp /out/build_nosimd/bin/opencv.wasm /out/dist/opencv.wasm
