# Whitelist of OpenCV functions exported to JavaScript.
# Only `core` and `imgproc` are compiled; everything else is left out to keep
# the WASM small. Keep this list in sync with packages/core/src/opencv/types.ts.

core = {
    '': [
        'absdiff',
        'countNonZero',
        'mean',
        'meanStdDev',
        'minMaxLoc',
        'split',
        'merge',
        'convertScaleAbs',
        'addWeighted',
        'rotate',
        'normalize',
    ],
}

imgproc = {
    '': [
        'cvtColor',
        'GaussianBlur',
        'bilateralFilter',
        'medianBlur',
        'Canny',
        'morphologyEx',
        'dilate',
        'getStructuringElement',
        'findContours',
        'approxPolyDP',
        'arcLength',
        'contourArea',
        'isContourConvex',
        'convexHull',
        'HoughLinesP',
        'Laplacian',
        'threshold',
        'connectedComponentsWithStats',
        'resize',
        'getPerspectiveTransform',
        'warpPerspective',
        'calcHist',
        'equalizeHist',
    ],
}

white_list = makeWhiteList([core, imgproc])  # noqa: F821  (provided by build_js.py)
