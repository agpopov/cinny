// Pointer-opened menus move focus for accessibility, but should not acquire
// keyboard focus rings. Record real input before the browser changes focus.
export const installInputModality = (): void => {
  document.addEventListener(
    'pointerdown',
    () => {
      document.documentElement.dataset.inputModality = 'pointer';
    },
    true
  );
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) return;
      document.documentElement.dataset.inputModality = 'keyboard';
    },
    true
  );
};
