import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../api/api.service';
import { ConfigService } from '../../../services/config.service';
import { AdminLayoutComponent } from '../admin-layout/admin-layout.component';

interface LogEntry {
  timestamp: string;
  level: string;
  context: string;
  message: string;
}

@Component({
  selector: 'app-admin-console',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminLayoutComponent],
  templateUrl: './admin-console.component.html',
  styleUrl: './admin-console.component.scss',
})
export class AdminConsoleComponent implements OnInit, OnDestroy, AfterViewChecked {
  logs: LogEntry[] = [];
  filteredLogs: LogEntry[] = [];
  connected = false;
  autoScroll = true;
  searchText = '';
  filterLevel = 'all';
  paused = false;
  private eventSource: EventSource | null = null;
  private shouldScroll = false;
  pauseBuffer: LogEntry[] = [];

  @ViewChild('logContainer') logContainer!: ElementRef<HTMLDivElement>;

  constructor(
    private configService: ConfigService,
    private zone: NgZone,
  ) {}

  ngOnInit(): void {
    this.connect();
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScroll && this.autoScroll) {
      this.scrollToBottom();
      this.shouldScroll = false;
    }
  }

  connect(): void {
    this.disconnect();

    const token = localStorage.getItem('access_token');
    const apiUrl = this.configService.apiUrl;
    const url = `${apiUrl}/api/logs/live?token=${token}`;

    this.eventSource = new EventSource(url);

    this.eventSource.onopen = () => {
      this.zone.run(() => {
        this.connected = true;
      });
    };

    this.eventSource.onmessage = (event) => {
      this.zone.run(() => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'init' && data.logs) {
            this.logs = data.logs;
            this.applyFilter();
            this.shouldScroll = true;
          } else if (data.type === 'log') {
            const entry: LogEntry = {
              timestamp: data.timestamp,
              level: data.level,
              context: data.context,
              message: data.message,
            };

            if (this.paused) {
              this.pauseBuffer.push(entry);
            } else {
              this.logs.push(entry);
              if (this.logs.length > 2000) {
                this.logs = this.logs.slice(-1500);
              }
              this.applyFilter();
              this.shouldScroll = true;
            }
          }
        } catch (e) {
          // Parse error, ignore
        }
      });
    };

    this.eventSource.onerror = () => {
      this.zone.run(() => {
        this.connected = false;
      });
      setTimeout(() => {
        if (!this.connected) {
          this.connect();
        }
      }, 3000);
    };
  }

  trackLog(index: number, log: LogEntry): string {
    return log.timestamp + log.message;
  }

  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.connected = false;
  }

  togglePause(): void {
    this.paused = !this.paused;
    if (!this.paused && this.pauseBuffer.length > 0) {
      this.logs.push(...this.pauseBuffer);
      this.pauseBuffer = [];
      if (this.logs.length > 2000) {
        this.logs = this.logs.slice(-1500);
      }
      this.applyFilter();
      this.shouldScroll = true;
    }
  }

  clearLogs(): void {
    this.logs = [];
    this.filteredLogs = [];
    this.pauseBuffer = [];
  }

  toggleAutoScroll(): void {
    this.autoScroll = !this.autoScroll;
    if (this.autoScroll) {
      this.scrollToBottom();
    }
  }

  applyFilter(): void {
    let result = this.logs;

    if (this.filterLevel === 'sql') {
      result = result.filter(l => l.context === 'SQL');
    } else if (this.filterLevel !== 'all') {
      result = result.filter(l => l.level === this.filterLevel);
    }

    if (this.searchText.trim()) {
      const term = this.searchText.toLowerCase();
      result = result.filter(l =>
        l.message.toLowerCase().includes(term) ||
        l.context.toLowerCase().includes(term)
      );
    }

    this.filteredLogs = result;
  }

  onFilterChange(): void {
    this.applyFilter();
    this.shouldScroll = true;
  }

  formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
      });
    } catch {
      return '';
    }
  }

  getLevelClass(level: string): string {
    switch (level) {
      case 'error': return 'level-error';
      case 'warn': return 'level-warn';
      case 'log': return 'level-log';
      case 'debug': return 'level-debug';
      case 'verbose': return 'level-verbose';
      default: return 'level-log';
    }
  }

  getLevelLabel(level: string): string {
    switch (level) {
      case 'error': return 'ERR';
      case 'warn': return 'WRN';
      case 'log': return 'LOG';
      case 'debug': return 'DBG';
      case 'verbose': return 'VRB';
      default: return level.toUpperCase().substring(0, 3);
    }
  }

  get errorCount(): number {
    return this.logs.filter(l => l.level === 'error').length;
  }

  get warnCount(): number {
    return this.logs.filter(l => l.level === 'warn').length;
  }

  private scrollToBottom(): void {
    const el = this.logContainer?.nativeElement;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }
}
