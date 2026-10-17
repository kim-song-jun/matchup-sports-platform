import type { V1TeamDetail } from '@/types/api';
import { teamDescriptionFallback } from '@/lib/seo';

const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 155;

/** Build search snippets only from the public team detail fields already shown in the product. */
export function buildTeamDiscoveryMetadata(team: V1TeamDetail): { title: string; description: string } {
  const name = normalize(team.name);
  const sport = normalize(team.sport?.name ?? team.sportName);
  const region = normalize(team.regionName ?? (team.region ? [team.region.parentName, team.region.name].filter(Boolean).join(' ') : null));
  const normalizedIntroduction = normalize(team.profile?.introduction);
  const introduction = normalizedIntroduction.length >= 15 ? normalizedIntroduction : '';
  const activity = normalize(team.profile?.activitySummary);
  const level = normalize(team.profile?.levelLabel ?? team.profile?.skillLevelText);

  const titleParts = [name];
  if (sport && !name.includes(sport)) titleParts.push(sport);
  if (region && !name.includes(region)) titleParts.push(region);
  const title = limit(`${titleParts.join(' · ')} 팀`, TITLE_LIMIT);

  const context = [sport, region].filter(Boolean).join(' · ');
  const descriptionLead = introduction
    ? `${name} 팀${context ? ` · ${context}` : ''}: ${introduction}`
    : teamDescriptionFallback(name, sport, region);
  const clauses = [descriptionLead];
  if (team.profile?.joinPolicy === 'approval_required') clauses.push('가입은 운영진 승인 방식이에요.');
  if (team.profile?.joinPolicy === 'closed') clauses.push('현재 가입 신청을 받지 않아요.');
  if (level) clauses.push(`수준: ${level}.`);
  if (activity) clauses.push(`활동: ${activity}.`);

  const [lead, ...optionalClauses] = dedupe(clauses);
  let description = limit(lead ?? descriptionLead, DESCRIPTION_LIMIT);
  for (const clause of optionalClauses) {
    const candidate = `${description} ${clause}`;
    if (candidate.length > DESCRIPTION_LIMIT) continue;
    description = candidate;
  }
  return { title, description };
}

function normalize(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function dedupe(clauses: string[]): string[] {
  const seen = new Set<string>();
  return clauses.filter((clause) => {
    const key = normalize(clause).toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function limit(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1).trimEnd()}…`;
}
