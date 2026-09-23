import numpy as np
import matplotlib.pyplot as plt

A = (-1, 0)
B = (1, 0)
fovA = 75
fovB = 55

points = [
    (1, 5),
    (5, 10), (-2, 10),
    (5, 15), (0, 15), (-3, 15),
    (6, 20), (1, 20), (-3, 20), (-8, 20)
]

z = np.linspace(0, 26, 400)
tanA = np.tan(np.deg2rad(fovA / 2))
tanB = np.tan(np.deg2rad(fovB / 2))

A_left = A[0] - z * tanA
A_right = A[0] + z * tanA
B_left = B[0] - z * tanB
B_right = B[0] + z * tanB

x_low = np.maximum(A_left, B_left)
x_high = np.minimum(A_right, B_right)
mask = x_low <= x_high

fig, ax = plt.subplots(figsize=(8, 10))

ax.scatter([A[0], B[0]], [A[1], B[1]], s=80)
ax.plot([A[0], B[0]], [A[1], B[1]], linewidth=2)
ax.text(A[0], A[1] - 0.8, "A", ha="center")
ax.text(B[0], B[1] - 0.8, "B", ha="center")
ax.text(0, -1.6, "2 m", ha="center")

ax.plot(A_left, z, linestyle="--", linewidth=1.5)
ax.plot(A_right, z, linestyle="--", linewidth=1.5)
ax.plot(B_left, z, linestyle="--", linewidth=1.5)
ax.plot(B_right, z, linestyle="--", linewidth=1.5)

ax.fill_betweenx(z[mask], x_low[mask], x_high[mask], alpha=0.18)
ax.text(0.2, 27.5, "Shared FOV", fontsize=10)

for i, (x, y) in enumerate(points, start=1):
    ax.scatter([x], [y], s=45)
    ax.text(x + 0.22, y + 0.2, f"T{i}", fontsize=9)

ax.set_xlabel("x / lateral position (m)")
ax.set_ylabel("z / depth (m)")
ax.set_title("AERESCUE Test-Point Layout with Camera FOV Rays")
ax.set_aspect("equal", adjustable="box")
ax.set_xlim(-21, 21)
ax.set_ylim(-3, 26)
ax.grid(True)

out = "graph/aerescue_test_points_layout_with_fov.png"
ax.set_xticks(np.arange(-25, 26, 5))
plt.tight_layout()
plt.savefig(out, dpi=200)
plt.show()

print(f"Saved to: {out}")