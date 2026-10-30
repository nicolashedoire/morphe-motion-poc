import { DEFAULT_SCENE, type ScenePlan } from './domain.ts';

export type PlannerResult =
  | { kind: 'scene'; plan: ScenePlan; summary: string; warnings: string[] }
  | { kind: 'correction'; targetAngle: number; summary: string; warnings: string[] }
  | { kind: 'unsupported'; message: string };

const KEYS = ['version', 'actor', 'color', 'prop', 'destination', 'distance', 'pace', 'wave', 'title'];
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const member = (value: unknown, choices: string[]) => typeof value === 'string' && choices.includes(value);

/** A small, executable vocabulary. A valid plan cannot ask the renderer to run code. */
export function validateScenePlan(value: unknown): ScenePlan {
  if (!isRecord(value) || Object.keys(value).length !== KEYS.length || KEYS.some(key => !Object.hasOwn(value, key)) ||
      value.version !== 1 || !member(value.actor, ['biped', 'quadruped']) ||
      !member(value.color, ['teal', 'blue', 'coral', 'violet']) || !member(value.prop, ['box', 'tray']) ||
      !member(value.destination, ['table', 'shelf']) || !member(value.distance, ['near', 'far']) ||
      !member(value.pace, ['slow', 'normal', 'fast']) || typeof value.wave !== 'boolean' ||
      typeof value.title !== 'string' || !value.title.trim() || value.title.length > 100 || /[\u0000-\u001f]/.test(value.title)) {
    throw new Error('Invalid scene plan. Only the supported scene vocabulary is accepted.');
  }
  return { ...value, title: value.title.trim() } as unknown as ScenePlan;
}

function validText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

/** Shared output boundary for the browser and the optional language-model server. */
export function validatePlannerResult(value: unknown): PlannerResult {
  if (!isRecord(value)) throw new Error('Invalid planner response.');
  if (value.kind === 'unsupported' && validText(value.message, 500) && Object.keys(value).every(k => ['kind', 'message'].includes(k))) {
    return { kind: 'unsupported', message: value.message };
  }
  if (!validText(value.summary, 500) || !Array.isArray(value.warnings) || value.warnings.length > 5 ||
      !value.warnings.every(item => validText(item, 300))) throw new Error('Invalid planner response.');
  if (value.kind === 'scene' && Object.keys(value).every(k => ['kind', 'plan', 'summary', 'warnings'].includes(k))) {
    return { kind: 'scene', plan: validateScenePlan(value.plan), summary: value.summary, warnings: [...value.warnings] };
  }
  if (value.kind === 'correction' && Object.keys(value).every(k => ['kind', 'targetAngle', 'summary', 'warnings'].includes(k)) &&
      typeof value.targetAngle === 'number' && Number.isFinite(value.targetAngle) && Math.abs(value.targetAngle) <= Math.PI / 6) {
    return { kind: 'correction', targetAngle: value.targetAngle, summary: value.summary, warnings: [...value.warnings] };
  }
  throw new Error('Invalid planner response.');
}

const normalize = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘]/g, "'");
const vocabularyNotice = 'Local grammar reads actor, color, box/tray, table/shelf, distance, pace and waving. Other details are not executed.';
const noWavePattern = /\b(?:(?:do not|don't|does not|doesn't|no|not|never|without)\s+(?:a\s+|any\s+|a final\s+)?wav\w*|sans\s+(?:me\s+)?salu\w*|ne\s+(?:me\s+)?salu\w*\s+pas|(?:ne\s+fai[st]\s+pas\s+(?:de\s+)?|sans\s+faire\s+(?:de\s+)?)(?:un\s+)?signe)\b/g;
const noTiltPattern = /\bne\s+(?:la\s+|le\s+)?penche\s+pas\b/g;

/** Deterministic bilingual fallback. This function is deliberately not called an AI model. */
export function parsePrompt(text: string, currentScene: ScenePlan = DEFAULT_SCENE): PlannerResult {
  if (typeof text !== 'string' || !text.trim()) return { kind: 'unsupported', message: 'Describe a scene, or ask to keep the carried object level.' };
  if (text.length > 1200) return { kind: 'unsupported', message: 'Keep the prompt under 1,200 characters.' };
  const t = normalize(text.trim());
  if (/\b(fly|flies|flying|jump\w*|danc\w*|swim\w*|run|runs|running|fight\w*|teleport\w*|voler|vole|volant|saut\w*|danse|danser|dansant|nager|nage|courir|court|combat\w*)\b/.test(t))
    return { kind: 'unsupported', message: 'This prototype supports walking, grasping, carrying, placing and waving. Flying, jumping, dancing, swimming and fighting are not implemented.' };
  const withoutSupportedNegations = t.replace(noWavePattern, '').replace(noTiltPattern, '');
  if (/\b(?:not|no|never|without|don't|doesn't|ne|sans|pas)\b/.test(withoutSupportedNegations))
    return { kind: 'unsupported', message: 'The local grammar cannot apply this negation. Try a positive scene description, “no wave”, or “keep the object level”.' };
  if (/\b(two|three|multiple|deux|trois|plusieurs)\s+(robots?|characters?|creatures?|personnages?)\b/.test(t) || /\b(four|4|quatre)[ -]+(arms?|bras)\b/.test(t)) {
    return { kind: 'unsupported', message: 'Choose one biped robot or one four-legged creature. Extra actors or arbitrary limbs are outside this prototype.' };
  }
  if ((/\b(horizontal\w*|level|upright|stable)\b/.test(t) && /\b(keep\w*|hold\w*|maintain\w*|stay\w*|garde\w*|maintien\w*|reste\w*|stabili\w*)\b/.test(t)) || /\bne\s+(?:la\s+|le\s+)?penche\s+pas\b/.test(t)) {
    if (/\bupright\b/.test(t)) return { kind: 'unsupported', message: 'This POC teaches a level carrying surface. Ask to keep the box or tray horizontal.' };
    return { kind: 'correction', targetAngle: 0, summary: 'Remember: keep the carried object level.', warnings: ['This stores an explicit orientation rule; it does not train a neural model.'] };
  }
  const plan = validateScenePlan(currentScene);
  let recognized = /\b(carr\w*|transport\w*|port\w*|walk\w*|march\w*|grasp\w*|pick\w*|prend\w*|prenn\w*|sais\w*|place\w*|pose\w*|depos\w*|sets?\s+it\s+down)\b/.test(t);
  const set = <K extends keyof ScenePlan>(key: K, value: ScenePlan[K]) => { plan[key] = value; recognized = true; };
  if (/\b(quadruped\w*|four[ -]legged|4[ -]legged|quatre[ -]pattes|creature\w*)\b/.test(t)) set('actor', 'quadruped');
  else if (/\b(robot\w*|biped\w*|humanoid\w*)\b/.test(t)) set('actor', 'biped');
  if (/\b(violet\w*|purple)\b/.test(t)) set('color', 'violet');
  else if (/\b(coral\w*|red|rouge\w*)\b/.test(t)) set('color', 'coral');
  else if (/\b(blue|bleu\w*)\b/.test(t)) set('color', 'blue');
  else if (/\b(teal|turquoise\w*|vert\w*|green)\b/.test(t)) set('color', 'teal');
  if (/\b(tray|plateau\w*)\b/.test(t)) set('prop', 'tray');
  else if (/\b(box\w*|boite\w*|caisse\w*|colis)\b/.test(t)) set('prop', 'box');
  if (/\b(shelf|etagere\w*)\b/.test(t)) set('destination', 'shelf');
  else if (/\b(table\w*)\b/.test(t)) set('destination', 'table');
  if (/\b(closer|near\w*|rapproch\w*|proche\w*)\b/.test(t)) set('distance', 'near');
  else if (/\b(far\w*|further|loin|eloign\w*)\b/.test(t)) set('distance', 'far');
  if (/\b(slow\w*|lent\w*|ralenti\w*)\b/.test(t)) set('pace', 'slow');
  else if (/\b(fast\w*|quicker|vite|rapide\w*|acceler\w*)\b/.test(t)) set('pace', 'fast');
  else if (/\b(normal\w*)\b/.test(t)) set('pace', 'normal');
  const noWave = t.replace(noWavePattern, '') !== t;
  if (noWave) set('wave', false);
  else if (/\b(wav\w*|salu\w*|signe)\b/.test(t)) set('wave', true);
  if (!recognized) return { kind: 'unsupported', message: 'Try “A blue robot carries a box to the table and waves”, or “Keep the object level”. The local planner uses a limited vocabulary.' };
  plan.title = `${plan.actor === 'biped' ? 'A small robot' : 'A new body'}, ${plan.prop === 'box' ? 'one box' : 'one tray'}, one journey.`;
  return { kind: 'scene', plan, summary: `${plan.actor === 'biped' ? 'Robot' : 'Four-legged creature'} · ${plan.prop} → ${plan.destination} · ${plan.pace} pace${plan.wave ? ' · wave' : ''}`, warnings: [vocabularyNotice] };
}
