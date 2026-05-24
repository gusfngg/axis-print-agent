/**
 * Ambient declaration para `systray2`.
 *
 * O pacote PUBLICA `index.d.ts` (`export default class SysTray`), mas é um
 * módulo CJS com `exports.default = SysTray` (+ `__esModule`). Sob
 * `moduleResolution: "nodenext"`, o `(await import("systray2")).default` da
 * função `startTray` (src/tray.ts) tem o `.default` mal-formado pelo interop
 * CJS→ESM e o compilador acusa TS2351 ("not constructable"). Esta declaração
 * fixa APENAS a forma do tipo que `startTray` consome — não muda nada em
 * runtime (o `index.js` continua sendo o módulo carregado; `.default` já é o
 * construtor `SysTray` em runtime, conforme verificado).
 */
declare module "systray2" {
  interface SysTrayMenuItem {
    title: string;
    tooltip: string;
    checked?: boolean;
    enabled?: boolean;
  }

  interface SysTrayConf {
    menu: {
      icon: string;
      title: string;
      tooltip: string;
      items: SysTrayMenuItem[];
    };
    debug?: boolean;
    copyDir?: boolean | string;
  }

  export default class SysTray {
    constructor(conf: SysTrayConf);
    ready(): Promise<void>;
    onClick(listener: (action: { seq_id: number }) => void): Promise<this>;
    kill(exitNode?: boolean): Promise<void>;
  }
}
