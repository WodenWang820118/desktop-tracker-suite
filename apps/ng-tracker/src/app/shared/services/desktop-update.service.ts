import { Injectable, inject } from '@angular/core';
import { check } from '@tauri-apps/plugin-updater';
import { MessageService } from 'primeng/api';
import { ConfirmService } from './confirm.service';

const UPDATE_SUMMARY_MAX_LENGTH = 180;

@Injectable({ providedIn: 'root' })
export class DesktopUpdateService {
  private readonly confirm = inject(ConfirmService);
  private readonly messageService = inject(MessageService);
  private hasChecked = false;

  async checkForUpdatesOnStartup(): Promise<void> {
    if (this.hasChecked || !isPackagedTauriRuntime()) {
      return;
    }

    this.hasChecked = true;

    try {
      const update = await check();
      if (!update) {
        return;
      }

      const accepted = await this.confirm.confirm({
        title: 'Update Available',
        message: buildUpdatePrompt(update.version, update.body),
        acceptLabel: 'Install Update',
        rejectLabel: 'Later',
        severity: 'info',
      });

      if (!accepted) {
        this.messageService.add({
          severity: 'info',
          summary: 'Update Available',
          detail: `Tracker Suite ${update.version} is ready to install when you are.`,
          life: 5000,
        });
        return;
      }

      await update.downloadAndInstall();

      this.messageService.add({
        severity: 'success',
        summary: 'Update Installed',
        detail: 'The update has been installed. Restart Tracker Suite to finish applying it.',
        life: 7000,
      });
    } catch (error) {
      console.warn('Tracker Suite could not complete the update check.', error);
    }
  }
}

function isPackagedTauriRuntime() {
  return typeof window !== 'undefined' && window.location.protocol === 'tauri:';
}

function buildUpdatePrompt(version: string, releaseNotes: string | null | undefined) {
  const trimmedNotes = releaseNotes?.trim();
  if (!trimmedNotes) {
    return `Tracker Suite ${version} is available. Download and install it now?`;
  }

  const summary =
    trimmedNotes.length > UPDATE_SUMMARY_MAX_LENGTH
      ? `${trimmedNotes.slice(0, UPDATE_SUMMARY_MAX_LENGTH).trimEnd()}...`
      : trimmedNotes;

  return `Tracker Suite ${version} is available.\n\nRelease notes: ${summary}\n\nDownload and install it now?`;
}
