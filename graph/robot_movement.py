# This utilizes a private drivebase used for RoboMission by the UNSHS Robotics Team

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
    juris.f.straightDistance(6000, 100, targetAngle=0)
    juris.f.turnToAngle(33.69, 90)
    juris.f.straightDistance(3606, 100, targetAngle=33.69)
    juris.f.turnToAngle(-26.57, 90)
    juris.f.straightDistance(4472, 100, targetAngle=-26.57)
    juris.f.straightDistance(4472, 100, targetAngle=-26.57)
    juris.f.turnToAngle(33.69, 90)
    juris.f.straightDistance(3606, 100, targetAngle=33.69)
    juris.f.turnToAngle(0, 90)
    juris.f.straightDistance(3000, 100, targetAngle=0)
    juris.f.straightDistance(-3000, 100, targetAngle=0)
    juris.f.turnToAngle(33.69, 90)
    juris.f.straightDistance(-3606, 100, targetAngle=33.69)
    juris.f.turnToAngle(-26.57, 90)
    juris.f.straightDistance(-4472, 100, targetAngle=-26.57)
    juris.f.straightDistance(-4472, 100, targetAngle=-26.57)
    juris.f.turnToAngle(33.69, 90)
    juris.f.straightDistance(-3606, 100, targetAngle=33.69)
    juris.f.turnToAngle(0, 90)
    juris.f.straightDistance(-6000, 100, targetAngle=0)