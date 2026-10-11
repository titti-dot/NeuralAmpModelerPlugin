# NeuralAmpModelerPlugin — Technical Overview

## Project Summary

**Neural Amp Modeler (NAM)** is a real-time audio effects plugin that runs neural network models trained on guitar amplifiers. It lets musicians load `.nam` model files and process their guitar signal through an AI-modeled amp in a DAW.

- **Version:** 0.8.0
- **Author:** Steven Atkinson
- **Plugin ID:** `1YEo`
- **UI resolution:** 600×400 px (scalable up to 4×)

---

## Languages

| Language | Usage |
|---|---|
| **C++20** | All DSP, neural network inference, plugin logic, and UI |
| **Python** | Build utilities: version bumping, resource preparation |
| **Bash / Shell** | Distribution scripts (`makedist-mac.sh`, etc.) |
| **YAML** | GitHub Actions CI/CD configuration |
| **JSON** | Neural network model format (`.nam` files), plugin state |

---

## Build System

The project uses a two-tier build system depending on the target platform:

- **CMake** — used by the core DSP submodules (`NeuralAmpModelerCore`, `AudioDSPTools`). Requires C++20.
- **iPlug2 build system** — used for the plugin itself:
  - **macOS:** Xcode project (`.xcodeproj`) + shell scripts
  - **Windows:** MSBuild (`.vcxproj`) + batch scripts
  - **Web:** Emscripten (WebAssembly / WAM)

CI/CD is handled by GitHub Actions with matrix builds for macOS and Windows that produce distributable artifacts automatically.

---

## Frameworks and Libraries

### iPlug2
Cross-platform audio plugin SDK. It abstracts plugin formats and provides the UI toolkit.

- **Plugin formats compiled:** VST3, AudioUnit (AU), AAX, Standalone app, Web Audio Module (WAM), REAPER extension
- **Graphics:** `IGraphics` — GPU-accelerated retained-mode UI with custom control widgets
- **Audio I/O:** unified `ProcessBlock` abstraction across all formats
- **Source:** `iPlug2/` (git submodule, fork by sdatkinson)

### NeuralAmpModelerCore
Pure C++ inference engine. No runtime, no Python — compiled directly into the plugin.

- Loads `.nam` files (JSON header + binary weights)
- Supported architectures: **WaveNet**, **ConvNet**, **LSTM**, **GRU**
- Slimmable model support (channel-width compression)
- **Source:** `NeuralAmpModelerCore/` (git submodule)

### AudioDSPTools
Shared DSP utility library used by the plugin.

- **Noise gate** — trigger + gain modules
- **Impulse Response** — convolution engine for cabinet/mic simulation
- **Resampler** — sample-rate conversion with transparent wrapping
- **Recursive linear filters** — IIR shelf and peaking filters for the tone stack
- **WAV I/O** — file loading for IR files
- **Source:** `AudioDSPTools/` (git submodule)

### Eigen
Header-only linear algebra library. Used for matrix/vector operations inside the neural network inference kernels. Supports SIMD optimization (SSE, AVX, NEON).

- **Source:** `eigen/` (git submodule)

### nlohmann/json
Header-only JSON parser. Used to read `.nam` model files and serialize plugin state.

### WDL (Cockos)
Low-level audio utilities (resampler primitives, memory pools). Pulled in transitively via iPlug2.

---

## Dependency Tree

```
NeuralAmpModelerPlugin
├── iPlug2
│   ├── VST3 SDK
│   ├── AAX SDK
│   └── WDL
├── NeuralAmpModelerCore
│   ├── Eigen
│   └── nlohmann/json
└── AudioDSPTools
    └── Eigen
```

---

## Architecture

### DSP Signal Chain

```
Input (stereo → summed to mono)
        │
        ▼
  [Input Gain]
        │
        ▼
  [Noise Gate]  ← configurable threshold
        │
        ▼
  [Neural Network Model]  ← .nam file (WaveNet / ConvNet / LSTM / GRU)
        │
        ▼
  [Impulse Response Convolution]  ← optional cabinet/mic IR (.wav)
        │
        ▼
  [Tone Stack EQ]  ← Bass / Mid / Treble (recursive linear filters)
        │
        ▼
  [Output Gain]
        │
        ▼
  [Level Metering]
        │
        ▼
  Output (mono duplicated to stereo)
```

### Latency

Latency is computed dynamically from the resampler tail and any model-specific look-ahead, then reported to the DAW host for sample-accurate alignment.

### Sample Rate Handling

The plugin can accept any host sample rate. When the model was trained at a different rate, an automatic resampling wrapper (`ResamplingContainer`) converts the signal before and after inference, so NAM models are always processed at their native rate.

### Output Modes

Three output level modes are available: **Raw**, **Normalized**, and **Calibrated** (±dBu reference).

---

## Key Source Files

| File | Role |
|---|---|
| `NeuralAmpModeler/NeuralAmpModeler.h/.cpp` | Top-level plugin class — parameter definitions, `ProcessBlock`, state save/load |
| `NeuralAmpModeler/NeuralAmpModelerControls.h` | All custom iGraphics UI controls (knobs, file browsers, meters, settings panel) |
| `NeuralAmpModeler/ToneStack.h/.cpp` | 3-band tone stack EQ |
| `NeuralAmpModeler/Colors.h` | UI theme constants |
| `NeuralAmpModeler/config.h` | Plugin metadata (name, version, dimensions, unique ID) |
| `NeuralAmpModeler/Unserialization.cpp` | Plugin preset state deserialization |
| `NeuralAmpModelerCore/NAM/dsp.h/.cpp` | Base DSP class, model loading, processing interface |
| `NeuralAmpModelerCore/NAM/wavenet.h` | WaveNet dilated-convolution architecture |
| `NeuralAmpModelerCore/NAM/lstm.h/.cpp` | LSTM recurrent network |
| `NeuralAmpModelerCore/NAM/convnet.h/.cpp` | ConvNet with batch normalization |
| `NeuralAmpModelerCore/NAM/get_dsp.h/.cpp` | Factory: parses `.nam` JSON and instantiates the correct network |
| `AudioDSPTools/dsp/ImpulseResponse.h` | Convolution engine |
| `AudioDSPTools/dsp/NoiseGate.h` | Noise gate |
| `AudioDSPTools/dsp/ResamplingContainer/` | Transparent sample-rate conversion wrapper |

---

## Supported Platforms

| Platform | Formats |
|---|---|
| **macOS 10.15+** | VST3, AudioUnit v2/v3, Standalone |
| **Windows 10+ (64-bit)** | VST3, Standalone |
| **iOS 14+** | AudioUnit v3 (partial) |
| **Web** | Web Audio Module (WAM / WebAssembly via Emscripten) |
| **Linux** | Supported via external LV2 implementation (separate project) |

---

## Neural Network Model Format (`.nam`)

`.nam` files are JSON + binary weight blobs. The JSON header describes:

- Architecture type (`WaveNet`, `ConvNet`, `lstm`, `GRU`)
- Hyperparameters (channels, layers, dilation schedule, etc.)
- Training sample rate
- Metadata (name, author, training gear)

The factory in `NAM/get_dsp.cpp` reads the header, selects the correct C++ class, and deserializes the weights directly from the file into the model's parameter buffers.

---

## Code Conventions

- C++20 throughout (concepts, ranges, structured bindings where applicable)
- Code formatted with `clang-format` (LLVM style) — enforced by a pre-commit hook
- No unit test framework as of v0.8.0 (noted in `CONTRIBUTING.md` as a future improvement)
- Git submodules for all major dependencies; update with `git submodule update --init --recursive`
