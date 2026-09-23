from robot import Robot
from systems.constants import *
from pybricks.tools import wait

from usys import stdin, stdout
from uselect import poll

keyboard = poll()
keyboard.register(stdin)

juris = Robot()

currentLoc = 0

def initialize():

    while not juris.hub.imu.ready():
        wait(50)

    juris.hub.imu.reset_heading(0)
    juris.f.resetAngles()

def main():

    # Start: (1.0, 7.5)

    # (1.0, 7.5) -> (7.0, 7.5)
    juris.f.straightDistance(6000, 100, targetAngle=0)

    # (7.0, 7.5) -> (10.0, 9.5)
    # heading = +33.69°
    juris.f.turnToAngle(33.69, 90)
    juris.f.straightDistance(3606, 100, targetAngle=33.69)

    # (10.0, 9.5) -> (14.0, 7.5)
    # heading = -26.57°
    juris.f.turnToAngle(-26.57, 90)
    juris.f.straightDistance(4472, 100, targetAngle=-26.57)

    # (14.0, 7.5) -> (18.0, 5.5)
    # heading = -26.57°
    juris.f.straightDistance(4472, 100, targetAngle=-26.57)

    # (18.0, 5.5) -> (21.0, 7.5)
    # heading = +33.69°
    juris.f.turnToAngle(33.69, 90)
    juris.f.straightDistance(3606, 100, targetAngle=33.69)

    # (21.0, 7.5) -> (24.0, 7.5)
    juris.f.turnToAngle(0, 90)
    juris.f.straightDistance(3000, 100, targetAngle=0)


    # ========================================================
    # RETURN
    #
    # Reverse through the route instead of turning around.
    # This keeps the folder facing approximately toward
    # the same direction relative to the cameras.
    # ========================================================

    # (24.0, 7.5) -> (21.0, 7.5)
    juris.f.straightDistance(-3000, 100, targetAngle=0)

    # To reverse from (21, 7.5) -> (18, 5.5),
    # keep the robot facing +33.69° and drive backward.
    juris.f.turnToAngle(33.69, 90)
    juris.f.straightDistance(-3606, 100, targetAngle=33.69)

    # (18.0, 5.5) -> (14.0, 7.5)
    # Reverse while facing -26.57°
    juris.f.turnToAngle(-26.57, 90)
    juris.f.straightDistance(-4472, 100, targetAngle=-26.57)

    # (14.0, 7.5) -> (10.0, 9.5)
    # Same physical heading
    juris.f.straightDistance(-4472, 100, targetAngle=-26.57)

    # (10.0, 9.5) -> (7.0, 7.5)
    # Reverse while facing +33.69°
    juris.f.turnToAngle(33.69, 90)
    juris.f.straightDistance(-3606, 100, targetAngle=33.69)

    # (7.0, 7.5) -> (1.0, 7.5)
    juris.f.turnToAngle(0, 90)
    juris.f.straightDistance(-6000, 100, targetAngle=0)