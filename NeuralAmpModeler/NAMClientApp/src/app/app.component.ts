import { Component, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PluginBridgeService } from './plugin-bridge.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly bridge = inject(PluginBridgeService);

  readonly outputModeLabels = ['Raw', 'Normalized', 'Calibrated'];

  modelBaseName(): string {
    const p = this.bridge.modelPath();
    if (!p) return '';
    return p.split('/').pop()?.replace(/\.nam$/i, '') ?? p;
  }

  irBaseName(): string {
    const p = this.bridge.irPath();
    if (!p) return '';
    return p.split('/').pop() ?? p;
  }

  onSliderStart(name: Parameters<PluginBridgeService['beginChange']>[0]): void {
    this.bridge.beginChange(name);
  }

  onSliderChange(name: Parameters<PluginBridgeService['setParam']>[0], value: number): void {
    this.bridge.setParam(name, value);
  }

  onSliderEnd(name: Parameters<PluginBridgeService['endChange']>[0]): void {
    this.bridge.endChange(name);
  }
}
