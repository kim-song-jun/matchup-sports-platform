export const SKILL_GRADES = [
  { grade: 'S', label: 'S', desc: 'all 선출 팀 또는 현역모임', color: 'bg-red-50 text-red-600' },
  { grade: 'A+', label: 'A+', desc: '아마추어 + 선출팀, 기본기 상, 팀플 완벽, 선출 3~4명', color: 'bg-blue-50 text-blue-600' },
  { grade: 'A', label: 'A', desc: '아마추어 + 선출팀, 기본기 상, 선출 1~2명', color: 'bg-blue-50 text-blue-600' },
  { grade: 'B+', label: 'B+', desc: '아마추어 팀, 전원 기본기 중, 팀플 상', color: 'bg-green-50 text-green-600' },
  { grade: 'B', label: 'B', desc: '아마추어 팀, 전원 기본기 중, 팀플 중', color: 'bg-green-50 text-green-600' },
  { grade: 'B-', label: 'B-', desc: '아마추어 팀, 전원 기본기 중, 팀플 하', color: 'bg-green-50 text-green-600' },
  { grade: 'C+', label: 'C+', desc: '아마추어 팀, 팀원 50% 기본기 하, 팀플 상', color: 'bg-gray-100 text-gray-600' },
  { grade: 'C', label: 'C', desc: '아마추어 팀, 팀원 50% 기본기 하, 팀플 중', color: 'bg-gray-100 text-gray-600' },
  { grade: 'C-', label: 'C-', desc: '아마추어 팀, 팀원 50% 기본기 하, 팀플 하', color: 'bg-gray-100 text-gray-600' },
  { grade: 'D', label: 'D', desc: '아마추어 팀, 팀원 기본기 하', color: 'bg-gray-100 text-gray-600' },
] as const;

export type SkillGrade = typeof SKILL_GRADES[number]['grade'];

export function getGradeInfo(grade: string) {
  return SKILL_GRADES.find(g => g.grade === grade) || SKILL_GRADES[4]; // default B
}

// Match type
export const MATCH_TYPES = [
  { value: 'invitation', label: '초청', desc: '우리 구장으로 상대를 초대' },
  { value: 'exchange', label: '교환', desc: '서로 번갈아가며 경기' },
  { value: 'away', label: '원정', desc: '상대 구장에서 경기' },
] as const;

export type MatchType = typeof MATCH_TYPES[number]['value'];
