# Reproducible OpenCV.js build. Pinned Emscripten and OpenCV versions.
FROM emscripten/emsdk:3.1.64

ARG OPENCV_VERSION=4.10.0
RUN apt-get update && apt-get install -y --no-install-recommends python3 git && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch ${OPENCV_VERSION} https://github.com/opencv/opencv.git /opencv

WORKDIR /work
COPY opencv_js.config.py build-inside.sh ./
CMD ["sh", "/work/build-inside.sh"]
