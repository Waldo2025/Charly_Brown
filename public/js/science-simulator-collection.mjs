import {SCIENCE_TOPIC_CATALOG, createCurriculumRegistry, applyCurriculumProfile} from './science-curriculum-profiles.mjs';
import {createScienceIllustratedScene} from './science-scene-art-direction.mjs';
import {createScienceSimulator} from './science-simulator-runtime.mjs';

const registry = createCurriculumRegistry(SCIENCE_TOPIC_CATALOG);
const select = document.querySelector('#collectionTopic'), mount = document.querySelector('#collectionMount'), status = document.querySelector('#collectionStatus');
const subjects = {physics: 'Física', chemistry: 'Química', biology: 'Biología', math: 'Matemáticas'};
for (const [subject, label] of Object.entries(subjects)) {
  const group = document.createElement('optgroup'); group.label = label;
  for (const p of registry.values()) {
    if (p.subject !== subject) continue;
    const option = document.createElement('option'); option.value = p.id; option.textContent = p.topic; group.append(option);
  }
  select.append(group);
}
let controller, revision = 0;
async function show() {
  const current = ++revision, profile = registry.get(select.value);
  if (!profile) return;
  controller?.destroy(); controller = null;
  status.textContent = 'Preparando la escena…';
  const activity = applyCurriculumProfile({title: profile.topic, subject: profile.subject, topic: profile.topic, gameMode: 'simulator', visualStyle: 'rive-tokyo-tech'}, profile);
  activity.visualScene = createScienceIllustratedScene(activity);
  try {
    const instance = await createScienceSimulator(mount, activity);
    if (current !== revision) { instance.destroy(); return; }
    controller = instance;
    history.replaceState(null, '', `#${profile.id}`);
    status.textContent = `${subjects[profile.subject]} · ${activity.visualScene.artDirection.environment}`;
  } catch (error) { if (current === revision) status.textContent = `No se pudo abrir la escena: ${error.message}`; }
}
const requested = decodeURIComponent(location.hash.slice(1));
select.value = registry.has(requested) ? requested : 'physics:movimiento-rectilineo-uniformemente-acelerado-mrua';
select.addEventListener('change', show);
window.addEventListener('pagehide', () => controller?.destroy());
void show();
