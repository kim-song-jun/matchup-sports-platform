import styles from './tournament-title.module.css';

/** Keep parenthetical qualifiers together when they fit, without changing the title text. */
export function TournamentTitle({ title }: { title: string }) {
  return title.split(/(\([^()]*\)|（[^（）]*）|(?:경기|모집)\s+중)/g).map((part, index) => {
    if (part.startsWith('(') && part.endsWith(')') || part.startsWith('（') && part.endsWith('）')) {
      return <span key={index} className={styles.qualifier}>{part}</span>;
    }
    if (/^(?:경기|모집)\s+중$/.test(part)) {
      return <span key={index} style={{ whiteSpace: 'nowrap' }}>{part}</span>;
    }
    return part;
  });
}
