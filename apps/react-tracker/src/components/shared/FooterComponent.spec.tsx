import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FooterComponent } from './FooterComponent';

describe('FooterComponent', () => {
  it('renders the current year and product copy', () => {
    render(<FooterComponent />);

    const currentYear = new Date().getFullYear().toString();
    const footerText = screen.getByText((content) =>
      content.includes('Task Tracker. Built with React and PrimeReact.'),
    );

    expect(footerText.textContent).toContain(currentYear);
  });
});
