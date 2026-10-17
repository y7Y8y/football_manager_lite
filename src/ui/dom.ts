/** Petites aides de création DOM, sans framework. */

type TagName = keyof HTMLElementTagNameMap;

export interface ElOptions {
  class?: string;
  id?: string;
  text?: string;
  html?: string;
}

export function el<K extends TagName>(tag: K, options: ElOptions = {}): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.id) node.id = options.id;
  if (options.class) node.className = options.class;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.html !== undefined) node.innerHTML = options.html;
  return node;
}

export function button(label: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
  const node = el('button', { class: `btn ${extraClass}`.trim(), text: label });
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}
