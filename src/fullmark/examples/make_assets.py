"""Regenerate the example images (committed as PNGs).

Run: uv run python make_assets.py
All data is invented. Colors are muted pastels so the figures sit well in both themes.
"""

from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

OUT = Path(__file__).parent / "assets"
OUT.mkdir(exist_ok=True)

BASE, TEXT, GRID = "#f7f7f5", "#2f3036", "#d4d4cd"
MAUVE, BLUE, GREEN, PEACH, RED = "#4f6a94", "#44709f", "#5b8a63", "#b8793f", "#a8504f"


def style(ax):
    ax.set_facecolor(BASE)
    ax.grid(color=GRID, linewidth=0.8)
    ax.tick_params(colors=TEXT)
    for spine in ax.spines.values():
        spine.set_color(TEXT)
    ax.xaxis.label.set_color(TEXT)
    ax.yaxis.label.set_color(TEXT)
    ax.title.set_color(TEXT)


def cubic():
    x = np.linspace(-2.4, 2.4, 400)
    y = x**3 - 3 * x
    fig, ax = plt.subplots(figsize=(6, 3.6), dpi=130, facecolor=BASE)
    style(ax)
    ax.axhline(0, color=TEXT, linewidth=1)
    ax.axvline(0, color=TEXT, linewidth=1)
    ax.plot(x, y, color=MAUVE, linewidth=2.6)
    ax.set_xlabel("x")
    ax.set_ylabel("f(x)")
    ax.set_title(r"$f(x) = x^3 - 3x$")
    ax.set_ylim(-4.5, 4.5)
    fig.tight_layout()
    fig.savefig(OUT / "cubic.png", facecolor=BASE)
    plt.close(fig)


def ielts_chart():
    years = [2000, 2005, 2010, 2015, 2020]
    data = {
        "Car": ([55, 52, 48, 44, 40], RED),
        "Bus": ([25, 25, 26, 27, 27], BLUE),
        "Train": ([15, 16, 16, 15, 15], GREEN),
        "Bicycle": ([5, 7, 10, 14, 18], PEACH),
    }
    assert all(sum(v[0][i] for v in data.values()) == 100 for i in range(len(years)))
    fig, ax = plt.subplots(figsize=(7, 4), dpi=130, facecolor=BASE)
    style(ax)
    for label, (vals, color) in data.items():
        ax.plot(years, vals, marker="o", linewidth=2.4, color=color, label=label)
    ax.set_xticks(years)
    ax.set_ylim(0, 60)
    ax.set_xlabel("Year")
    ax.set_ylabel("Share of commuters (%)")
    ax.set_title(
        "Main transport mode of commuters, Northvale (fictional data)", fontsize=10
    )
    leg = ax.legend(
        facecolor=BASE,
        edgecolor=GRID,
        ncol=4,
        loc="upper center",
        bbox_to_anchor=(0.5, -0.17),
    )
    for t in leg.get_texts():
        t.set_color(TEXT)
    fig.tight_layout()
    fig.savefig(OUT / "ielts-chart.png", facecolor=BASE)
    plt.close(fig)


if __name__ == "__main__":
    cubic()
    ielts_chart()
    print("wrote", ", ".join(sorted(p.name for p in OUT.glob("*.png"))))
