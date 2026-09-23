import numpy as np
import matplotlib.pyplot as plt

COURT_LENGTH = 28
COURT_WIDTH = 15


A = (0.0, 8.5)
B = (0.0, 6.5)

fovA = 80
fovB = 80

START = (1.0, 7.5)

waypoints = np.array([
    [1.0,  7.5],     # Start — 1 m from cameras

    # Outbound
    [7.0,  7.5],     # Straight forward
    [10.0, 9.5],     # Diagonal up
    [14.0, 7.5],     # Diagonal toward center
    [18.0, 5.5],     # Diagonal down
    [21.0, 7.5],     # Diagonal toward center
    [24.0, 7.5],     # Far point

    # Return — robot drives backward without turning around
    [21.0, 8.5],     # Reverse straight
    [18.0, 6.5],     # Reverse diagonal
    [14.0, 8.5],     # Reverse diagonal
    [10.0, 10.5],     # Reverse diagonal
    [7.0,  8.5],     # Reverse diagonal
    [5.0,  8.5],     # Finish — reverse straight
])

def interpolate_route(points, spacing=0.05):
    route = []

    for i in range(len(points) - 1):
        start = points[i]
        end = points[i + 1]

        distance = np.linalg.norm(end - start)
        samples = max(2, int(distance / spacing))

        x = np.linspace(start[0], end[0], samples)
        y = np.linspace(start[1], end[1], samples)

        route.extend(zip(x, y))

    return np.array(route)


route = interpolate_route(waypoints)

x = np.linspace(0, COURT_LENGTH, 500)

tanA = np.tan(np.deg2rad(fovA / 2))
tanB = np.tan(np.deg2rad(fovB / 2))

A_lower = A[1] - x * tanA
A_upper = A[1] + x * tanA

B_lower = B[1] - x * tanB
B_upper = B[1] + x * tanB

y_low = np.maximum(A_lower, B_lower)
y_high = np.minimum(A_upper, B_upper)

mask = y_low <= y_high

fig, ax = plt.subplots(figsize=(14, 8))

court_x = [0, COURT_LENGTH, COURT_LENGTH, 0, 0]
court_y = [0, 0, COURT_WIDTH, COURT_WIDTH, 0]

ax.plot(
    court_x,
    court_y,
    linewidth=2,
    label="Court Boundary"
)

ax.scatter(
    [A[0], B[0]],
    [A[1], B[1]],
    s=100,
    marker=">",
    zorder=7,
    label="Cameras"
)

ax.text(
    A[0] - 0.4,
    A[1],
    "Camera A\n75°",
    ha="right",
    va="center",
    fontsize=8
)

ax.text(
    B[0] - 0.4,
    B[1],
    "Camera B\n55°",
    ha="right",
    va="center",
    fontsize=8
)

ax.plot(
    [A[0], B[0]],
    [A[1], B[1]],
    linewidth=3
)

ax.text(
    0.3,
    7.5,
    "2 m\nbaseline",
    ha="left",
    va="center",
    fontsize=8
)

ax.plot(x, A_lower, linestyle="--", linewidth=1)
ax.plot(x, A_upper, linestyle="--", linewidth=1)

ax.plot(x, B_lower, linestyle="--", linewidth=1)
ax.plot(x, B_upper, linestyle="--", linewidth=1)

ax.fill_between(
    x[mask],
    y_low[mask],
    y_high[mask],
    alpha=0.12,
    label="Shared Camera FOV"
)

ax.plot(
    route[:, 0],
    route[:, 1],
    linewidth=2,
    label="SPIKE Prime Route"
)

ax.scatter(
    waypoints[:, 0],
    waypoints[:, 1],
    s=35,
    zorder=5
)

for i, (px, py) in enumerate(waypoints[:-1], start=1):
    ax.text(
        px + 0.15,
        py + 0.2,
        f"P{i}",
        fontsize=8
    )

ax.scatter(
    [START[0]],
    [START[1]],
    s=110,
    marker="s",
    zorder=8,
    label="Starting Point"
)

ax.text(
    START[0],
    START[1] - 0.5,
    "START — 1 m",
    fontsize=9,
    ha="center",
    va="top"
)

ax.plot(
    [0, START[0]],
    [7.5, 7.5],
    linestyle=":",
    linewidth=1.5
)

arrow_every = 150

for i in range(0, len(route) - 5, arrow_every):
    px = route[i, 0]
    py = route[i, 1]

    dx = route[i + 5, 0] - px
    dy = route[i + 5, 1] - py

    ax.arrow(
        px,
        py,
        dx,
        dy,
        head_width=0.25,
        head_length=0.35,
        length_includes_head=True
    )

ax.set_xlabel("Distance from Camera Baseline (m)")
ax.set_ylabel("Court Width (m)")

ax.set_title(
    "AERESCUE Moving-Object Tracking Test Route\n"
    "SPIKE Prime Carrying Designated Orange Object"
)

ax.set_xlim(-2, COURT_LENGTH + 1)
ax.set_ylim(-1, COURT_WIDTH + 1)

ax.set_xticks(np.arange(0, COURT_LENGTH + 1, 2))
ax.set_yticks(np.arange(0, COURT_WIDTH + 1, 2.5))

ax.set_aspect("equal", adjustable="box")

ax.grid(True, alpha=0.3)

ax.legend(
    loc="upper right",
    fontsize=8
)

plt.tight_layout()

out = "graph/aerescue_tracking_test_route_horizontal.png"

plt.savefig(
    out,
    dpi=200,
    bbox_inches="tight"
)

plt.show()

print(f"Saved to: {out}")