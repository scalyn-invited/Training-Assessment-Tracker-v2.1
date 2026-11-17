// Original Figma exports; the matching search glyph already exists in People & access.
export function AuditIcon({
  name,
}: {
  name: 'audit-active' | 'expand' | 'calendar' | 'filter' | 'more' | 'details' | 'search';
}) {
  const src = name === 'search' ? '/images/people/search.svg' : `/images/audit/${name}.svg`;
  return <img src={src} alt="" aria-hidden="true" draggable={false} />;
}
