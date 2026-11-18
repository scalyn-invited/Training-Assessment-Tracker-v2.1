type ClientsIconName =
  | 'overview-inactive'
  | 'clients-active'
  | 'add'
  | 'search'
  | 'filter'
  | 'chevron'
  | 'sort'
  | 'active-dot'
  | 'workspace-arrow';

// Original Figma exports, shared by the desktop and mobile Clients frames.
export function ClientsIcon({ name }: { name: ClientsIconName }) {
  return <img src={`/images/clients/${name}.svg`} alt="" aria-hidden="true" draggable={false} />;
}
