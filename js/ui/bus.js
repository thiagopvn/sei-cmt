// Pede para a tela atual ser redesenhada (mudanças de estado só da interface).
export const rerender = () => window.dispatchEvent(new Event('pauta:render'));
