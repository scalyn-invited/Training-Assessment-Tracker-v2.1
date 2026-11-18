// Original, unmodified Figma exports. Their intrinsic SVG dimensions are retained.
export function PeopleIcon({
  name,
}: {
  name: 'people-active' | 'add-account' | 'search' | 'arrow' | 'lock';
}) {
  return <img src={`/images/people/${name}.svg`} alt="" aria-hidden="true" draggable={false} />;
}
