import { CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';

import { AppComponent } from './app.component';

describe('AppComponent', () => {

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AppComponent],
      imports: [CommonModule],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('shows the intro for two seconds after the image loads', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.intro-screen')).toBeTruthy();

    vi.useFakeTimers();
    try {
      const image = fixture.nativeElement.querySelector('.intro-screen img');
      expect(image.getAttribute('src')).toBe('assets/icon/AKU.png');
      expect(fixture.nativeElement.querySelectorAll('.intro-loading-dots span')).toHaveLength(3);
      image.dispatchEvent(new Event('load'));

      vi.advanceTimersByTime(1999);
      expect(fixture.nativeElement.querySelector('.intro-screen')).toBeTruthy();

      vi.advanceTimersByTime(1);
      expect(fixture.nativeElement.querySelector('.intro-screen')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

});
