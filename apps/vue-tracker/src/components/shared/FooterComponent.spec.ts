import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';

import FooterComponent from './FooterComponent.vue';

describe('FooterComponent', () => {
  it('renders the current year and product copy', () => {
    const wrapper = mount(FooterComponent);
    const currentYear = new Date().getFullYear().toString();

    expect(wrapper.text()).toContain(currentYear);
    expect(wrapper.text()).toContain('Task Tracker. Built with Vue 3 and PrimeVue.');
  });
});
