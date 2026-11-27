const EVIDENCE_VERSION = 3;
const requiredInteractions = {
  'admin-create': ['create-staged-format-selected'],
  'admin-bracket': ['admin-stage-panel', 'admin-period-scope', 'admin-draft-preserved', 'drafts-survive-pool-switch', 'owned-fixture-labels-restored'],
  bracket: ['filtered-final-team-matches', 'match-detail-back-restores-filters'],
  results: ['final-league-results'],
};
function hasRequiredInteractions(check, interactions, { phase, captureScope = 'full' }) {
  if (phase !== 'after' || captureScope === 'admin-bottom') return true;
  return (requiredInteractions[check.name] ?? []).every(name => interactions.some(item => item.name === name && item.width === check.width && item.passed === true && (name !== 'drafts-survive-pool-switch' || check.width !== 390 || item.displaySaveExercised === true)));
}
function resumeEvidence(previous, { phase, origin, tournamentId, expectedCommit, routes, captureScope = 'full' }) {
  if (previous.evidenceVersion !== EVIDENCE_VERSION) throw Error('Resume evidence uses an older capture format; run without --resume');
  if (previous.phase !== phase || previous.captureScope !== captureScope || previous.origin !== origin || previous.tournamentId !== tournamentId || !Array.isArray(previous.checks)) throw Error('Resume evidence belongs to a different QA scope');
  if (phase === 'after' && (previous.expectedCommit !== expectedCommit || previous.checks.some(check => check.release !== expectedCommit))) throw Error('Resume evidence belongs to a different deployment; run without --resume');
  const checks = previous.checks.filter(check => check.passed === true && hasRequiredInteractions(check, previous.interactions ?? [], { phase, captureScope }) && Array.isArray(check.scroll) && check.scroll.length > 0 && check.scroll.every(position => Number.isFinite(position.max) && Number.isFinite(position.after) && position.after >= position.max - 2) && routes.some(([name, route]) => check.name === name && check.route === route && check.url === route) && [390, 768, 1440].includes(check.width));
  const interactionRoutes = { 'create-staged-format-selected': 'admin-create', 'admin-stage-panel': 'admin-bracket', 'admin-period-scope': 'admin-bracket', 'admin-draft-preserved': 'admin-bracket', 'drafts-survive-pool-switch': 'admin-bracket', 'owned-fixture-labels-restored': 'admin-bracket', 'filtered-final-team-matches': 'bracket', 'match-detail-back-restores-filters': 'bracket', 'final-league-results': 'results' };
  const interactions = (previous.interactions ?? []).filter(item => item.passed === true && (item.name === 'owned-fixture-name-saved' || checks.some(check => check.width === item.width && check.name === interactionRoutes[item.name])));
  return { checks, interactions };
}

async function scrollContentToBottom(page) {
  return page.evaluate(async () => {
    const main = document.querySelector('main') ?? document.body;
    const candidates = [...document.querySelectorAll('*')].filter(element => {
      const rect = element.getBoundingClientRect(), style = getComputedStyle(element);
      return (element === main || main.contains(element) || element.contains(main)) && !element.closest('nav,aside,[inert],[aria-hidden="true"]') && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth && style.visibility !== 'hidden' && element.scrollHeight > element.clientHeight + 1 && /auto|scroll/.test(style.overflowY);
    });
    const surfaces = [...new Set([document.scrollingElement, ...candidates].filter(Boolean))];
    const before = surfaces.map(element => element.scrollTop);
    for (let attempt = 0; attempt < 4; attempt++) {
      surfaces.forEach(element => element.scrollTo({ top: element.scrollHeight, behavior: 'instant' }));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      if (surfaces.every(element => element.scrollTop >= element.scrollHeight - element.clientHeight - 2)) break;
    }
    const positions = surfaces.map((element, index) => ({ tag: element.tagName, id: element.id || null, before: before[index], after: element.scrollTop, max: element.scrollHeight - element.clientHeight }));
    if (positions.some(position => position.max > 1 && position.after < position.max - 2)) throw Error('The visible content did not reach its bottom');
    return positions;
  });
}
module.exports = { EVIDENCE_VERSION, hasRequiredInteractions, resumeEvidence, scrollContentToBottom };
