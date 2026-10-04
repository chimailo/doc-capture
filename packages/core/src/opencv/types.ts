// OpenCV.js typings come from @techstark/opencv-js (dev dependency). They are
// only used inside the worker and never appear in the public API.
import type * as OpenCv from '@techstark/opencv-js';

export type CV = typeof OpenCv;
export type Mat = OpenCv.Mat;
