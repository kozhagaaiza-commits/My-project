// Демо-фото для фикстур каталога: SVG data-URI, без внешних файлов.
// Диски — 1:1 (800×800), карбон — 4:3 (800×600).

export type DiscFinish = "graphite" | "silver" | "black" | "bronze" | "gunmetal" | "polished";
export type CarbonKind = "diffuser" | "splitter" | "spoiler" | "mirror";

const FINISH_COLORS: Record<DiscFinish, { face: string; edge: string }> = {
  graphite: { face: "#3A3A40", edge: "#6A6A72" },
  silver: { face: "#B4B8C0", edge: "#E4E7EC" },
  black: { face: "#1E1E22", edge: "#55555C" },
  bronze: { face: "#7A6140", edge: "#B09468" },
  gunmetal: { face: "#4A4F58", edge: "#7C828C" },
  polished: { face: "#D6D9E0", edge: "#F4F5F8" },
};

const toDataUri = (svg: string): string => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

export function discImage(finish: DiscFinish, spokes: number): string {
  const { face, edge } = FINISH_COLORS[finish];
  const spokeShapes = Array.from({ length: spokes }, (_, i) => {
    const angle = (360 / spokes) * i;
    const half = spokes > 6 ? 14 : 24;
    return `<polygon transform="rotate(${angle} 400 400)" points="${400 - 34},${400 - 60} ${400 + 34},${400 - 60} ${400 + half},${400 - 262} ${400 - half},${400 - 262}" fill="${face}" stroke="${edge}" stroke-width="3"/>`;
  }).join("");
  const lugs = Array.from({ length: 5 }, (_, i) => {
    const a = ((72 * i - 90) * Math.PI) / 180;
    return `<circle cx="${(400 + 44 * Math.cos(a)).toFixed(1)}" cy="${(400 + 44 * Math.sin(a)).toFixed(1)}" r="7" fill="#0A0A0B"/>`;
  }).join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">` +
    `<rect width="800" height="800" fill="#141416"/>` +
    `<circle cx="400" cy="400" r="350" fill="#0A0A0B" stroke="#2A2A2E" stroke-width="4"/>` +
    `<circle cx="400" cy="400" r="292" fill="#0E0E10"/>` +
    spokeShapes +
    `<circle cx="400" cy="400" r="292" fill="none" stroke="${face}" stroke-width="26"/>` +
    `<circle cx="400" cy="400" r="305" fill="none" stroke="${edge}" stroke-width="3"/>` +
    `<circle cx="400" cy="400" r="70" fill="${face}" stroke="${edge}" stroke-width="3"/>` +
    lugs +
    `<circle cx="400" cy="400" r="14" fill="#0A0A0B"/>` +
    `</svg>`;
  return toDataUri(svg);
}

const CARBON_SHAPES: Record<CarbonKind, string> = {
  diffuser: "M120 380 L680 380 L620 250 L180 250 Z M250 250 L250 380 M340 250 L340 380 M430 250 L430 380 M520 250 L520 380",
  splitter: "M80 360 Q400 250 720 360 L690 400 Q400 310 110 400 Z",
  spoiler: "M130 330 Q400 210 670 330 L650 370 Q400 270 150 370 Z M210 370 L190 430 M590 370 L610 430",
  mirror: "M250 300 Q300 200 470 230 Q580 250 560 340 Q520 400 360 390 Q250 380 250 300 Z",
};

export function carbonImage(kind: CarbonKind): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">` +
    `<defs><pattern id="w" width="20" height="20" patternUnits="userSpaceOnUse">` +
    `<rect width="20" height="20" fill="#121214"/>` +
    `<rect width="10" height="10" fill="#1E1E22"/><rect x="10" y="10" width="10" height="10" fill="#1E1E22"/>` +
    `</pattern></defs>` +
    `<rect width="800" height="600" fill="#141416"/>` +
    `<path d="${CARBON_SHAPES[kind]}" fill="url(#w)" stroke="#C0C4CC" stroke-width="4" stroke-linejoin="round"/>` +
    `</svg>`;
  return toDataUri(svg);
}
