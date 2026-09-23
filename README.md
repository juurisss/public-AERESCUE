# AERESCUE

## Introduction

**AERESCUE (Assistive Emergency Rescue and Support System)** is a shore-based dual-camera computer-vision system developed to support simulated water-rescue scenarios through target localization, moving-object tracking, relative-distance estimation, and computational directional guidance.

The system uses two fixed cameras with known positions and separation. A rescue target is manually selected by the operator, while a designated moving object is detected and continuously tracked across both camera feeds. Using geometric triangulation, AERESCUE estimates the horizontal positions of both the target and the moving object, calculates their relative position and distance, and generates guidance outputs such as **LEFT**, **RIGHT**, **FORWARD**, and **STOP/HOLD**.

AERESCUE was developed as a research prototype for the Science and Technology Fair **Robotics and Intelligent Machines** category. The current system focuses on computer vision, spatial estimation, tracking, and guidance under controlled simulated rescue conditions rather than autonomous physical rescue operations.

## More Information

For a more detailed explanation of the codebase and system architecture, see:

[Codebase Explanation](./docs/codebase_explaination.md)
[End Goal](./docs/end_goal.md)

> This repository contains the software, experimental tools, and supporting code used in the development and evaluation of AERESCUE.
