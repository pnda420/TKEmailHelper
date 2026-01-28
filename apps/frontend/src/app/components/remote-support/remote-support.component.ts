import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PageTitleComponent } from '../../shared/page-title/page-title.component';

@Component({
  selector: 'app-remote-support',
  standalone: true,
  imports: [CommonModule, PageTitleComponent],
  templateUrl: './remote-support.component.html',
  styleUrl: './remote-support.component.scss'
})
export class RemoteSupportComponent {
  downloading = false;
  downloadSuccess = false;

  readonly anydeskUrl = 'https://anydesk.com/de/downloads/thank-you?dv=win_exe';
  readonly anydeskDirectUrl = 'https://download.anydesk.com/AnyDesk.exe';

  downloadAnyDesk(): void {
    this.downloading = true;
    
    // Trigger download
    const link = document.createElement('a');
    link.href = this.anydeskDirectUrl;
    link.download = 'AnyDesk.exe';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Show success after a short delay
    setTimeout(() => {
      this.downloading = false;
      this.downloadSuccess = true;
    }, 1500);
  }

  resetDownload(): void {
    this.downloadSuccess = false;
    this.downloading = false;
  }
}
