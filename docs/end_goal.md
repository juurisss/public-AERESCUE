# Study End Goal

Develop the final version of **AERESCUE (Aerial Rescue and Support System)** as a rescue-support system consisting of two fixed shore-based cameras, a processing unit, and a drone.

The cameras will monitor a manually selected rescue target while continuously tracking the drone's position. AERESCUE will estimate the drone's position relative to the selected target and generate PD-based guidance commands to direct the drone toward it.

The long-term goal is for the drone to deliver a flotation device and maintain its position above or near the target, helping rescuers quickly identify and locate the person in distress.

## District Level

Develop and validate the core AERESCUE prototype, presented at this stage as the **Assistive Emergency Rescue and Support System**, focusing on:

- Dual-camera target localization (**success**)
- Moving-object detection and tracking (**success**)
- Relative-distance estimation (**success**)
- Basic directional guidance (**success**)

## Congressional Level

Expand AERESCUE beyond computational guidance by developing and testing a physical control layer capable of receiving generated guidance commands and translating them into movement.

Planned developments include:

- Improve dual-camera calibration and localization accuracy (**success**)
- Improve moving-object tracking and reacquisition reliability (**success**)
- Use a LEGO SPIKE Prime drive base as a controlled moving-platform surrogate
- Transmit AERESCUE guidance commands to the SPIKE Prime drive base
- Guide the platform toward the designated target using the generated commands
- Evaluate whether AERESCUE's guidance can be translated into reliable physical movement

## Division Level

Develop AERESCUE into a more complete closed-loop guidance and control system by improving physical movement control, system reliability, and the interface required for future drone integration.

Planned developments include:

- Implement continuous PD-based guidance instead of only discrete directional commands
- Measure and minimize path error, overshoot, settling time, and response latency
- Improve the accuracy and stability of dual-camera localization during continuous movement
- Develop a microcontroller-based interface capable of translating AERESCUE control outputs into physical controller inputs
- Add safety behaviors such as automatic STOP/HOLD during tracking loss, invalid triangulation, or communication failure
- Add manual override and emergency-stop functionality
- Implement position-holding behavior near the selected rescue target
- Record movement, localization, tracking, and control data for closed-loop performance evaluation
- Evaluate whether AERESCUE can reliably guide and maintain a moving platform within a defined tolerance around the selected target