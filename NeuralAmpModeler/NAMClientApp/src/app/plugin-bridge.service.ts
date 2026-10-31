import { Injectable, signal } from '@angular/core';

// Matches C++ EMsgTags enum (NeuralAmpModeler.h)
export const MSG = {
  CLEAR_MODEL: 0,
  CLEAR_IR: 1,
  HIGHLIGHT_COLOR: 2,
  REQUEST_LOAD_MODEL: 3,
  REQUEST_LOAD_IR: 4,
  LOAD_FAILED: 5,
  LOADED_MODEL: 6,
  LOADED_IR: 7,
} as const;

interface ParamDef {
  idx: number;
  min: number;
  max: number;
}

// All params with their real-value ranges (matching NeuralAmpModeler.cpp InitParam calls)
const PARAMS = {
  inputLevel:            { idx: 0,  min: -20,  max: 20  },
  noiseGateThreshold:    { idx: 1,  min: -100, max: 0   },
  toneBass:              { idx: 2,  min: 0,    max: 10  },
  toneMid:               { idx: 3,  min: 0,    max: 10  },
  toneTreble:            { idx: 4,  min: 0,    max: 10  },
  outputLevel:           { idx: 5,  min: -40,  max: 40  },
  noiseGateActive:       { idx: 6,  min: 0,    max: 1   },
  eqActive:              { idx: 7,  min: 0,    max: 1   },
  irToggle:              { idx: 8,  min: 0,    max: 1   },
  calibrateInput:        { idx: 9,  min: 0,    max: 1   },
  inputCalibrationLevel: { idx: 10, min: -60,  max: 60  },
  outputMode:            { idx: 11, min: 0,    max: 2   },
  slim:                  { idx: 12, min: 0,    max: 1   },
} as const satisfies Record<string, ParamDef>;

export type ParamName = keyof typeof PARAMS;

@Injectable({ providedIn: 'root' })
export class PluginBridgeService {
  // Real-value signals (not normalized) — components bind to these directly
  readonly inputLevel            = signal(0);
  readonly noiseGateThreshold    = signal(-80);
  readonly toneBass               = signal(5);
  readonly toneMid                = signal(5);
  readonly toneTreble             = signal(5);
  readonly outputLevel            = signal(0);
  readonly noiseGateActive        = signal(true);
  readonly eqActive               = signal(true);
  readonly irToggle               = signal(true);
  readonly calibrateInput         = signal(false);
  readonly inputCalibrationLevel  = signal(12);
  readonly outputMode             = signal(1);

  readonly modelPath = signal('');
  readonly irPath    = signal('');
  readonly loadError = signal('');

  // idx → setter for O(1) dispatch from SPVFD
  private readonly setters = new Map<number, (normVal: number) => void>([
    [0,  n => this.inputLevel.set(this.toReal(n, PARAMS.inputLevel))],
    [1,  n => this.noiseGateThreshold.set(this.toReal(n, PARAMS.noiseGateThreshold))],
    [2,  n => this.toneBass.set(this.toReal(n, PARAMS.toneBass))],
    [3,  n => this.toneMid.set(this.toReal(n, PARAMS.toneMid))],
    [4,  n => this.toneTreble.set(this.toReal(n, PARAMS.toneTreble))],
    [5,  n => this.outputLevel.set(this.toReal(n, PARAMS.outputLevel))],
    [6,  n => this.noiseGateActive.set(n > 0.5)],
    [7,  n => this.eqActive.set(n > 0.5)],
    [8,  n => this.irToggle.set(n > 0.5)],
    [9,  n => this.calibrateInput.set(n > 0.5)],
    [10, n => this.inputCalibrationLevel.set(this.toReal(n, PARAMS.inputCalibrationLevel))],
    [11, n => this.outputMode.set(Math.round(n * 2))],
    // idx 12 (slim) intentionally ignored in WebView build
  ]);

  constructor() {
    this.registerGlobals();
  }

  // Linear normalization matching iPlug2 ShapeLinear
  private toReal(norm: number, def: ParamDef): number {
    return def.min + norm * (def.max - def.min);
  }

  private toNorm(real: number, def: ParamDef): number {
    return Math.max(0, Math.min(1, (real - def.min) / (def.max - def.min)));
  }

  private registerGlobals(): void {
    // iPlug2 C++ calls SPVFD(paramIdx, normVal) via EvaluateJavaScript
    (window as any)['SPVFD'] = (paramIdx: number, normVal: number) => {
      this.setters.get(paramIdx)?.(normVal);
    };

    // iPlug2 C++ calls SAMFD(msgTag, dataSize, b64data) via EvaluateJavaScript
    (window as any)['SAMFD'] = (msgTag: number, _size: number, b64: string) => {
      const str = b64 ? atob(b64).replace(/\0+$/, '') : '';
      switch (msgTag) {
        case MSG.LOADED_MODEL: this.modelPath.set(str); this.loadError.set(''); break;
        case MSG.LOADED_IR:    this.irPath.set(str);    break;
        case MSG.CLEAR_MODEL:  this.modelPath.set('');  break;
        case MSG.CLEAR_IR:     this.irPath.set('');     break;
        case MSG.LOAD_FAILED:  this.loadError.set(str); break;
      }
    };

    // Define stubs so iPlug2 won't throw on unexpected calls
    (window as any)['SCMFD'] = () => {};
    (window as any)['SMMFD'] = () => {};
    (window as any)['SSMFD'] = () => {};
    (window as any)['SCVFD'] = () => {};
  }

  private send(msg: object): void {
    if (typeof (window as any)['IPlugSendMsg'] === 'function') {
      (window as any)['IPlugSendMsg'](msg);
    } else {
      console.log('[NAM-Bridge]', JSON.stringify(msg));
    }
  }

  // --- Parameter control (automation-safe: begin/set/end) ---

  beginChange(name: ParamName): void {
    this.send({ msg: 'BPCFUI', paramIdx: PARAMS[name].idx });
  }

  endChange(name: ParamName): void {
    this.send({ msg: 'EPCFUI', paramIdx: PARAMS[name].idx });
  }

  /** Send a real value; converts to normalized internally. */
  setParam(name: ParamName, real: number): void {
    const def = PARAMS[name];
    this.send({ msg: 'SPVFUI', paramIdx: def.idx, value: this.toNorm(real, def) });
  }

  setBool(name: ParamName, val: boolean): void {
    const def = PARAMS[name];
    this.send({ msg: 'BPCFUI', paramIdx: def.idx });
    this.send({ msg: 'SPVFUI', paramIdx: def.idx, value: val ? 1 : 0 });
    this.send({ msg: 'EPCFUI', paramIdx: def.idx });
  }

  setEnum(name: ParamName, idx: number): void {
    const def = PARAMS[name];
    const norm = idx / (def.max - def.min); // e.g. 0/2, 1/2, 2/2
    this.send({ msg: 'BPCFUI', paramIdx: def.idx });
    this.send({ msg: 'SPVFUI', paramIdx: def.idx, value: norm });
    this.send({ msg: 'EPCFUI', paramIdx: def.idx });
  }

  // --- File / model actions ---

  requestLoadModel(): void {
    this.send({ msg: 'SAMFUI', msgTag: MSG.REQUEST_LOAD_MODEL, ctrlTag: -1, data: 0 });
  }

  requestLoadIR(): void {
    this.send({ msg: 'SAMFUI', msgTag: MSG.REQUEST_LOAD_IR, ctrlTag: -1, data: 0 });
  }

  clearModel(): void {
    this.send({ msg: 'SAMFUI', msgTag: MSG.CLEAR_MODEL, ctrlTag: -1, data: 0 });
  }

  clearIR(): void {
    this.send({ msg: 'SAMFUI', msgTag: MSG.CLEAR_IR, ctrlTag: -1, data: 0 });
  }
}
