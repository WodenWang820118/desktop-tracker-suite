import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';

import { AboutViewComponent } from './about-view.component';

describe('AboutViewComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AboutViewComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the about content', () => {
    const fixture = TestBed.createComponent(AboutViewComponent);

    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const homeLink = element.querySelector(
      '[data-test-id="home-page-link"]'
    ) as HTMLAnchorElement | null;

    expect(element.textContent).toContain('Version 1.0.0');
    expect(element.textContent).toContain(
      'A powerful and intuitive task management application'
    );
    expect(homeLink).not.toBeNull();
    expect(homeLink?.textContent).toContain('Back to Home');
  });
});
