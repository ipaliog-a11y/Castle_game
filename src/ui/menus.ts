import type Phaser from 'phaser';
import { audio } from '../core/audio';
import { AIM_MODES, settings, type AimMode } from '../core/settings';
import { Overlay, type OverlayRow } from './Overlay';

/**
 * The pause menu and the options panel, which are the same overlay showing
 * different rows.
 *
 * They live together because they are reached through each other: options is a
 * row of the pause menu, and Back is a row of options. Splitting them into two
 * components would mean each holding a reference to the other to hand control
 * over, for no gain.
 */
export class GameMenus {
  private overlay: Overlay;
  private page: 'none' | 'pause' | 'options' = 'none';

  /**
   * @param onResume  closing the pause menu. Omitted on screens with no battle
   *                  to resume, which is what makes options reusable from the
   *                  main menu.
   * @param onQuit    the destructive exits, shown only when supplied.
   */
  constructor(
    scene: Phaser.Scene,
    private opts: {
      onResume?: () => void;
      onGiveUp?: () => void;
      giveUpLabel?: string;
      onMenu?: () => void;
    } = {},
  ) {
    this.overlay = new Overlay(scene, 5);
  }

  get isOpen(): boolean {
    return this.page !== 'none';
  }

  openPause(): void {
    this.page = 'pause';
    this.overlay.show('PAUSED', this.pauseRows());
  }

  openOptions(): void {
    this.page = 'options';
    this.overlay.show('OPTIONS', this.optionRows());
  }

  close(): void {
    this.page = 'none';
    this.overlay.hide();
    this.opts.onResume?.();
  }

  /** Pause if running, resume if paused. What the pause button does. */
  toggle(): void {
    if (this.isOpen) this.close();
    else this.openPause();
  }

  private pauseRows(): OverlayRow[] {
    const rows: OverlayRow[] = [
      { label: 'Resume', onPress: () => this.close() },
      { label: 'Options', onPress: () => this.openOptions() },
    ];
    if (this.opts.onGiveUp) {
      rows.push({
        label: this.opts.giveUpLabel ?? 'Give up',
        danger: true,
        onPress: () => {
          this.page = 'none';
          this.overlay.hide();
          this.opts.onGiveUp?.();
        },
      });
    }
    if (this.opts.onMenu) {
      rows.push({
        label: 'Quit to menu',
        danger: true,
        onPress: () => {
          this.page = 'none';
          this.overlay.hide();
          this.opts.onMenu?.();
        },
      });
    }
    return rows;
  }

  private optionRows(): OverlayRow[] {
    return [
      {
        label: 'Sound',
        value: () => (audio.muted ? 'Off' : 'On'),
        onPress: () => {
          const muted = audio.toggleMuted();
          // Unmuting should be audible, or you have to tap twice to find out
          // which way round it is.
          if (!muted) audio.play('place');
          this.overlay.refresh('OPTIONS');
        },
      },
      {
        label: 'Aiming',
        value: () => AIM_MODES.find((m) => m.id === settings.aimMode)?.name ?? '',
        blurb: () => AIM_MODES.find((m) => m.id === settings.aimMode)?.blurb ?? '',
        onPress: () => {
          // A cycling row rather than three rows or a sub-page. There are three
          // options, the current one is on screen, and one tap moves you along
          // — a submenu for that would be more taps and more to learn.
          const order = AIM_MODES.map((m) => m.id);
          const next = order[(order.indexOf(settings.aimMode) + 1) % order.length] as AimMode;
          settings.aimMode = next;
          audio.play('place');
          this.overlay.refresh('OPTIONS');
        },
      },
      {
        label: 'Back',
        onPress: () => {
          // Back means the pause menu during a battle, and closed everywhere
          // else — the main menu has no pause page behind it.
          if (this.opts.onResume || this.opts.onGiveUp || this.opts.onMenu) this.openPause();
          else this.close();
        },
      },
    ];
  }

  destroy(): void {
    this.overlay.destroy();
  }
}
