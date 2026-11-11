/**
 * A small flat card with a few lines of text, drawn to a canvas texture.
 * Redraws only when the text changes. Used for the "touch the desk" prompt and
 * the tester panel (spatial UI is off in this app to keep it light).
 */
import { CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

export interface CardStyle {
  widthM: number;
  heightM: number;
  px: number; // canvas width in pixels
  font: number; // font size in px
  background: string;
  color: string;
  accent: string;
}

export class TextCard {
  readonly mesh: Mesh;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private texture: CanvasTexture;
  private last = '';

  private style: CardStyle;

  constructor(name: string, style: CardStyle) {
    this.style = style;
    this.canvas = document.createElement('canvas');
    this.canvas.width = style.px;
    this.canvas.height = Math.round((style.px * style.heightM) / style.widthM);
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const mat = new MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false });
    this.mesh = new Mesh(new PlaneGeometry(style.widthM, style.heightM), mat);
    this.mesh.name = name;
    this.mesh.renderOrder = 5;
  }

  /** Lines starting with "!" are drawn in the accent colour. */
  set(lines: readonly string[]): void {
    const key = lines.join('\n');
    if (key === this.last) return;
    this.last = key;
    const { ctx, canvas, style } = this;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const r = Math.min(28, h / 4);
    ctx.fillStyle = style.background;
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.arcTo(w, 0, w, h, r);
    ctx.arcTo(w, h, 0, h, r);
    ctx.arcTo(0, h, 0, 0, r);
    ctx.arcTo(0, 0, w, 0, r);
    ctx.fill();
    ctx.font = `600 ${style.font}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const lineH = style.font * 1.3;
    const top = (h - lineH * lines.length) / 2 + lineH / 2;
    lines.forEach((line, i) => {
      const accent = line.startsWith('!');
      ctx.fillStyle = accent ? style.accent : style.color;
      ctx.fillText(accent ? line.slice(1) : line, style.font * 0.8, top + i * lineH, w - style.font * 1.6);
    });
    this.texture.needsUpdate = true;
  }
}
