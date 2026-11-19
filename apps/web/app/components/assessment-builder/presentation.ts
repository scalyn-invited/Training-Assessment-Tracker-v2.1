import controls from '../ui/controls.module.css';
import styles from '../ui/assessment-builder.module.css';

// The imperative editor keeps ownership of markup, events and state. Reuse the same
// native-control classes as the React primitives for both static and generated nodes.
export function styleBuilderElement(node: Element) {
  if (node.matches('button, a.button')) {
    node.classList.add(
      controls.button,
      node.classList.contains('primary') ? controls.primary : controls.secondary,
    );
  }
  if (node.matches('input, select, textarea')) node.classList.add(controls.input);
  if (node.classList.contains('panel')) node.classList.add(controls.panel, styles.panel);
  if (node.classList.contains('notice')) node.classList.add(styles.notice);
  if (node.matches('#builder-errors, .builder-field-errors')) node.classList.add(styles.error);
}

export function styleBuilderRoot(root: HTMLElement) {
  root.classList.add(styles.root);
  root.querySelectorAll('*').forEach(styleBuilderElement);
}
