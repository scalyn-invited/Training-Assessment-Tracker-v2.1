export type OverviewIconName =
  | 'workspace'
  | 'switch'
  | 'overview'
  | 'clients'
  | 'people'
  | 'audit'
  | 'settings'
  | 'moon'
  | 'dot'
  | 'logout'
  | 'clients-stat'
  | 'admins-stat'
  | 'accounts-stat'
  | 'warning'
  | 'arrow'
  | 'mail'
  | 'ai';

// Original Figma exports, shared by the desktop and mobile Overview frames.
export function OverviewIcon({ name }: { name: OverviewIconName }) {
  return <img src={`/images/overview/${name}.svg`} alt="" aria-hidden="true" draggable={false} />;
}
