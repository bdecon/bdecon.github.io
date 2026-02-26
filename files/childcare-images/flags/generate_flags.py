"""Generate 120x80 PNG flag images from SVG strings via rsvg-convert."""
import subprocess
import os

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
W, H = 120, 80

FLAGS = {
    "us": f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <rect width="{W}" height="{H}" fill="#fff"/>
  {"".join(f'<rect y="{i * H/13:.2f}" width="{W}" height="{H/13:.2f}" fill="#B22234"/>' for i in range(0, 13, 2))}
  <rect width="{W*0.4}" height="{H*7/13:.2f}" fill="#3C3B6E"/>
</svg>""",

    "ca": f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <rect width="{W}" height="{H}" fill="#fff"/>
  <rect width="{W*0.25}" height="{H}" fill="#FF0000"/>
  <rect x="{W*0.75}" width="{W*0.25}" height="{H}" fill="#FF0000"/>
  <path fill="#FF0000" d="M60,12 l4,14 l10,-4 l-6,10 l10,4 l-4,4 l2,10 l-12,-6 l0,10 l-4,0 l0,-10 l-12,6 l2,-10 l-4,-4 l10,-4 l-6,-10 l10,4 z"/>
</svg>""",

    "dk": f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <rect width="{W}" height="{H}" fill="#C8102E"/>
  <rect x="{W*0.324:.1f}" width="{W*0.108:.1f}" height="{H}" fill="#fff"/>
  <rect y="{H*0.429:.1f}" width="{W}" height="{H*0.143:.1f}" fill="#fff"/>
</svg>""",

    "fi": f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <rect width="{W}" height="{H}" fill="#fff"/>
  <rect x="{W*0.333:.1f}" width="{W*0.167:.1f}" height="{H}" fill="#003580"/>
  <rect y="{H*0.364:.1f}" width="{W}" height="{H*0.273:.1f}" fill="#003580"/>
</svg>""",

    "no": f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <rect width="{W}" height="{H}" fill="#BA0C2F"/>
  <rect x="{W*0.35 - W*0.06:.1f}" width="{W*0.12:.1f}" height="{H}" fill="#fff"/>
  <rect y="{H*0.5 - H*0.075:.1f}" width="{W}" height="{H*0.15:.1f}" fill="#fff"/>
  <rect x="{W*0.35 - W*0.03:.1f}" width="{W*0.06:.1f}" height="{H}" fill="#00205B"/>
  <rect y="{H*0.5 - H*0.0375:.1f}" width="{W}" height="{H*0.075:.1f}" fill="#00205B"/>
</svg>""",

    "se": f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <rect width="{W}" height="{H}" fill="#006AA7"/>
  <rect x="{W*0.3125:.1f}" width="{W*0.125:.1f}" height="{H}" fill="#FECC00"/>
  <rect y="{H*0.4:.1f}" width="{W}" height="{H*0.2:.1f}" fill="#FECC00"/>
</svg>""",

    "nyc": f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <rect width="{W/3:.1f}" height="{H}" fill="#003DA5"/>
  <rect x="{W/3:.1f}" width="{W/3:.1f}" height="{H}" fill="#fff"/>
  <rect x="{W*2/3:.1f}" width="{W/3:.1f}" height="{H}" fill="#F4651A"/>
  <circle cx="{W/2}" cy="{H/2}" r="{min(W,H)*0.14:.1f}" fill="#003DA5" opacity="0.25"/>
  <circle cx="{W/2}" cy="{H/2}" r="{min(W,H)*0.1:.1f}" fill="#fff" opacity="0.4"/>
</svg>""",

    "nm": f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <rect width="{W}" height="{H}" fill="#FFD700"/>
  <g transform="translate({W/2},{H/2})">
    <circle r="8" fill="#BF0A30"/>
    <rect x="-9" y="-31" width="4" height="62" fill="#BF0A30"/>
    <rect x="-2" y="-31" width="4" height="62" fill="#BF0A30"/>
    <rect x="5" y="-31" width="4" height="62" fill="#BF0A30"/>
    <rect x="-31" y="-9" width="62" height="4" fill="#BF0A30"/>
    <rect x="-31" y="-2" width="62" height="4" fill="#BF0A30"/>
    <rect x="-31" y="5" width="62" height="4" fill="#BF0A30"/>
    <circle r="4" fill="#FFD700"/>
  </g>
</svg>""",

    "vt": f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
  <rect width="{W}" height="{H}" rx="2" fill="#003478"/>
  <ellipse cx="{W/2}" cy="{H*0.53}" rx="{W*0.22}" ry="{H*0.36}" fill="none" stroke="#C5A84A" stroke-width="2"/>
  <rect x="{W*0.29}" y="{H*0.56}" width="{W*0.43}" height="{H*0.22}" fill="#5A8F3D"/>
  <polygon points="{W*0.39},{H*0.56} {W*0.5},{H*0.28} {W*0.61},{H*0.56}" fill="#2E7D32"/>
  <polygon points="{W*0.45},{H*0.56} {W*0.5},{H*0.39} {W*0.55},{H*0.56}" fill="#4CAF50"/>
  <rect x="{W*0.486}" y="{H*0.56}" width="{W*0.028}" height="{H*0.1}" fill="#5D4037"/>
  <circle cx="{W/2}" cy="{H*0.22}" r="3" fill="#C5A84A" opacity="0.6"/>
</svg>""",
}

for name, svg in FLAGS.items():
    out_path = os.path.join(OUT_DIR, f"{name}.png")
    proc = subprocess.run(
        ["rsvg-convert", "-w", str(W), "-h", str(H), "-f", "png"],
        input=svg.encode(),
        capture_output=True,
    )
    if proc.returncode != 0:
        print(f"FAILED {name}: {proc.stderr.decode()}")
        continue
    with open(out_path, "wb") as f:
        f.write(proc.stdout)
    print(f"Generated {out_path} ({len(proc.stdout)} bytes)")
