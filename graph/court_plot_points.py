import numpy as np
import matplotlib.pyplot as plt

COURT_LENGTH = 28
COURT_WIDTH = 15

# Cameras on left edge of court
A = (0.0, 8.5)
B = (0.0, 6.5)

fovA = 80
fovB = 80

# ============================================================
# ACTUAL RELATIVE-DISTANCE TEST POINTS
#
# Format:
# (distance from camera baseline, court-width position)
#
# Example:
# (20, 7.5) = 20 m forward, center of court
# (15, 10.5) = 15 m forward, upper side of court
# ============================================================

points = [
    (3, 7.5),         # T1  = 25.00 m
    (7, 3.5),         # T2  = 21.37 m

    (7.5, 5.5),       # T3  = 20.59 m
    (7.5, 9.5),       # T4  = 20.59 m

    (9, 11.5),        # T5  = 19.41 m

    (14, 0.5),        # T6  = 15.65 m
    (14, 13.5),       # T7  = 15.23 m
    (14, 7.5),        # T8  = 14.00 m

    (20, 2.5),        # T9  = 9.43 m
    (20.5, 10.75)     # T10 = 8.17 m
]

# ============================================================
# CAMERA FOV
# ============================================================

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

# ============================================================
# PLOT
# ============================================================

fig, ax = plt.subplots(figsize=(14, 8))

# Court boundary
court_x = [0, COURT_LENGTH, COURT_LENGTH, 0, 0]
court_y = [0, 0, COURT_WIDTH, COURT_WIDTH, 0]

ax.plot(
    court_x,
    court_y,
    linewidth=2
)

# Cameras
ax.scatter(
    [A[0], B[0]],
    [A[1], B[1]],
    s=100,
    marker=">",
    zorder=7
)

ax.plot(
    [A[0], B[0]],
    [A[1], B[1]],
    linewidth=3
)

ax.text(
    A[0] - 0.4,
    A[1],
    "Camera A",
    ha="right",
    va="center",
    fontsize=8
)

ax.text(
    B[0] - 0.4,
    B[1],
    "Camera B",
    ha="right",
    va="center",
    fontsize=8
)

ax.text(
    0.3,
    7.5,
    "2 m baseline",
    ha="left",
    va="center",
    fontsize=8
)

# FOV rays
ax.plot(x, A_lower, linestyle="--", linewidth=1)
ax.plot(x, A_upper, linestyle="--", linewidth=1)

ax.plot(x, B_lower, linestyle="--", linewidth=1)
ax.plot(x, B_upper, linestyle="--", linewidth=1)

# Shared FOV
ax.fill_between(
    x[mask],
    y_low[mask],
    y_high[mask],
    alpha=0.12
)

# ============================================================
# TEST POINTS
# ============================================================

for i, (px, py) in enumerate(points, start=1):

    ax.scatter(
        [px],
        [py],
        s=45,
        zorder=5
    )

    ax.text(
        px + 0.15,
        py + 0.2,
        f"T{i}",
        fontsize=9
    )

# ============================================================
# LABELS
# ============================================================

ax.set_xlabel("Distance from Camera Baseline (m)")
ax.set_ylabel("Court Width Position (m)")

ax.set_title(
    "AERESCUE Relative-Distance Test-Point Layout"
)

ax.set_xlim(-2, COURT_LENGTH + 1)
ax.set_ylim(-1, COURT_WIDTH + 1)

ax.set_xticks(
    np.arange(0, COURT_LENGTH + 1, 2)
)

ax.set_yticks(
    np.arange(0, COURT_WIDTH + 1, 2.5)
)

ax.set_aspect(
    "equal",
    adjustable="box"
)

ax.grid(True, alpha=0.3)

plt.tight_layout()

out = "graph/aerescue_relative_distance_test_points_horizontal.png"

plt.savefig(
    out,
    dpi=200,
    bbox_inches="tight"
)

plt.show()

print(f"Saved to: {out}")