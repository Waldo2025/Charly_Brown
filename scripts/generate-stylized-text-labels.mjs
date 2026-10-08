import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('public/podcaster/assets/text-labels');
await mkdir(output, { recursive: true });

const labels = [
  ['ribbon-png', '#172554', '#3b82f6', '#67e8f9', '<path d="M82 44h1036l-43 76 43 76H82l43-76z"/><path d="M82 44h18v152H82z" fill="#67e8f9"/><path d="M111 58h986" stroke="#bfdbfe" stroke-opacity=".65" stroke-width="2"/>'],
  ['paint-png', '#312e81', '#6366f1', '#f0abfc', '<path d="M72 80c96-33 173-9 268-21 164-22 256 12 410-4 128-13 249-4 382 15l-29 19 34 19c-141 18-247 4-375 20-154 19-264-7-411 7-107 10-191-2-298-18l25-20z"/><path d="M173 139c263 21 605-20 852-5" fill="none" stroke="#f0abfc" stroke-opacity=".55" stroke-width="3"/>'],
  ['orbit-png', '#111827', '#334155', '#67e8f9', '<rect x="130" y="45" width="940" height="150" rx="28"/><ellipse cx="600" cy="120" rx="548" ry="104" fill="none" stroke="#67e8f9" stroke-opacity=".8" stroke-width="3"/><circle cx="111" cy="90" r="8" fill="#a5f3fc"/><circle cx="1088" cy="151" r="6" fill="#a5f3fc"/>'],
  ['capsule-png', '#172554', '#3730a3', '#a5f3fc', '<rect x="100" y="43" width="1000" height="154" rx="77"/><rect x="110" y="53" width="980" height="134" rx="67" fill="none" stroke="#a5f3fc" stroke-opacity=".6" stroke-width="2"/><path d="M175 72h300" stroke="#c4b5fd" stroke-opacity=".45" stroke-width="3" stroke-linecap="round"/>'],
  ['burst-png', '#7c2d12', '#c2410c', '#fed7aa', '<path d="m105 53 88 15 64-30 57 35 103-19 54 35 111-14 69 21 104-23 54 32 115-13 49 41-47 22 42 38-103-4-78 30-80-24-90 22-94-20-88 21-90-30-97 17-64-39-95 7 19-44-57-26z"/><path d="M190 73h820" stroke="#fed7aa" stroke-opacity=".65" stroke-width="2"/>'],
  ['cloud-png', '#0f172a', '#1e3a5f', '#93c5fd', '<path d="M172 177c-53 0-83-28-83-64 0-35 29-62 67-64 16-30 47-47 84-42 25-42 91-45 127-8 32-29 83-31 118-5 40-42 111-33 133 15 48-22 105 1 111 48 43-1 79 27 79 61 0 37-32 59-79 59z"/><path d="M208 161h778" stroke="#bfdbfe" stroke-opacity=".55" stroke-width="2"/>'],
  ['ticket-png', '#431407', '#9a3412', '#fdba74', '<path d="M120 45h960v39c-27 0-42 17-42 36s15 36 42 36v39H120v-39c27 0 42-17 42-36s-15-36-42-36z"/><path d="M194 59v122" stroke="#fdba74" stroke-opacity=".75" stroke-width="2" stroke-dasharray="5 7"/><path d="M240 62h765" stroke="#ffedd5" stroke-opacity=".5" stroke-width="2"/>'],
  ['scallop-png', '#312e81', '#4c1d95', '#ddd6fe', '<path d="M153 58c26-26 68-26 94 0 26-26 68-26 94 0 26-26 68-26 94 0 26-26 68-26 94 0 26-26 68-26 94 0 26-26 68-26 94 0 26-26 68-26 94 0 26-26 68-26 94 0 26-26 68-26 94 0v124c-26 26-68 26-94 0-26 26-68 26-94 0-26 26-68 26-94 0-26 26-68 26-94 0-26 26-68 26-94 0-26 26-68 26-94 0-26 26-68 26-94 0-26 26-68 26-94 0-26 26-68 26-94 0z"/><path d="M187 81h826" stroke="#ddd6fe" stroke-opacity=".45" stroke-width="2"/>'],
  ['sunset-png', '#4c1d3d', '#9d174d', '#fdba74', '<rect x="104" y="46" width="992" height="148" rx="28"/><path d="M132 143c236-66 430-57 664-6 100 22 199 18 272-2v34H132z" fill="#f97316" fill-opacity=".42"/><path d="M132 160c292-48 531-20 936 4" fill="none" stroke="#fdba74" stroke-opacity=".72" stroke-width="3"/>'],
  ['tag-png', '#052e2b', '#115e59', '#5eead4', '<path d="M102 47h924l72 73-72 73H102l46-73z"/><circle cx="174" cy="120" r="13" fill="#ccfbf1" fill-opacity=".9"/><path d="M225 65h760" stroke="#99f6e4" stroke-opacity=".55" stroke-width="2"/>'],
  ['paper-png', '#cbd5e1', '#f8fafc', '#64748b', '<rect x="104" y="46" width="992" height="148" rx="24"/><rect x="116" y="58" width="968" height="124" rx="17" fill="none" stroke="#ffffff" stroke-opacity=".9" stroke-width="3"/><path d="M151 72h898" stroke="#64748b" stroke-opacity=".3" stroke-width="2"/>'],
  ['blush-png', '#fb7185', '#ffe4e6', '#be123c', '<path d="M104 50h992v140H104l28-70z"/><path d="M155 70h900" stroke="#ffffff" stroke-opacity=".8" stroke-width="3"/><path d="M154 170h560" stroke="#be123c" stroke-opacity=".35" stroke-width="2"/>'],
  ['mint-png', '#6ee7b7', '#d1fae5', '#047857', '<rect x="104" y="46" width="992" height="148" rx="24"/><path d="M130 69h940v102H130z" fill="none" stroke="#ffffff" stroke-opacity=".9" stroke-width="3"/><path d="M160 72v96" stroke="#047857" stroke-opacity=".45" stroke-width="5" stroke-linecap="round"/>'],
  ['sky-png', '#7dd3fc', '#e0f2fe', '#0369a1', '<path d="M104 46h992v148H104l34-74z"/><path d="M155 68h900" stroke="#ffffff" stroke-opacity=".9" stroke-width="3"/><circle cx="1060" cy="120" r="5" fill="#0369a1" fill-opacity=".7"/>']
];

for (const [name, base, accent, highlight, shape] of labels) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="240" viewBox="0 0 1200 240">
    <defs>
      <linearGradient id="surface" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${accent}"/><stop offset="1" stop-color="${base}"/></linearGradient>
      <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${highlight}" stop-opacity=".08"/><stop offset=".5" stop-color="${highlight}" stop-opacity=".22"/><stop offset="1" stop-color="${highlight}" stop-opacity=".05"/></linearGradient>
      <filter id="shadow" x="-10%" y="-30%" width="120%" height="180%"><feGaussianBlur stdDeviation="8"/></filter>
    </defs>
    <g opacity=".25" filter="url(#shadow)" transform="translate(0 8)">${shape}</g>
    <g fill="url(#surface)" stroke="${highlight}" stroke-opacity=".74" stroke-width="2" stroke-linejoin="round">${shape}</g>
    <g fill="url(#sheen)">${shape}</g>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(resolve(output, `${name}.png`));
}
console.log(`Generated ${labels.length} transparent label PNGs in ${output}`);
