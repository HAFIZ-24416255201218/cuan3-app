import { ChangeDetectorRef, Component, OnDestroy } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent implements OnDestroy {
  public isIntroVisible = true;
  private introTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly changeDetector: ChangeDetectorRef) {}

  ngOnDestroy(): void {
    if (this.introTimeout) {
      clearTimeout(this.introTimeout);
      this.introTimeout = null;
    }
  }

  public startIntroTimer(): void {
    if (this.introTimeout || !this.isIntroVisible) return;

    this.introTimeout = setTimeout(() => {
      this.dismissIntro();
      this.changeDetector.detectChanges();
    }, 2000);
  }

  public dismissIntro(): void {
    if (this.introTimeout) {
      clearTimeout(this.introTimeout);
      this.introTimeout = null;
    }
    this.isIntroVisible = false;
  }
}
