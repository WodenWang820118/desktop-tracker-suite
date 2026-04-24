import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import PrimeVue from 'primevue/config';
import Lara from '@primevue/themes/lara';

import HeaderComponent from './HeaderComponent.vue';

const { mockThemeState, mockToggleTheme } = vi.hoisted(() => ({
  mockThemeState: { current: 'dark' as 'light' | 'dark' },
  mockToggleTheme: vi.fn(),
}));

vi.mock('../../composables/useTheme', async () => {
  const { ref } = await import('vue');

  return {
    useTheme: () => ({
      theme: ref<'light' | 'dark'>(mockThemeState.current),
      toggleTheme: mockToggleTheme,
    }),
  };
});

async function mountHeader() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div>Home</div>' } },
      { path: '/about', component: { template: '<div>About</div>' } },
    ],
  });

  await router.push('/');
  await router.isReady();

  return mount(HeaderComponent, {
    global: {
      plugins: [
        router,
        [
          PrimeVue,
          {
            theme: {
              preset: Lara,
              options: {
                darkModeSelector: '.dark',
              },
            },
          },
        ],
      ],
    },
  });
}

describe('HeaderComponent', () => {
  beforeEach(() => {
    mockThemeState.current = 'dark';
    mockToggleTheme.mockReset();
  });

  it('renders the current navigation and dark theme toggle label', async () => {
    const wrapper = await mountHeader();
    const links = wrapper.findAll('nav a');

    expect(wrapper.text()).toContain('Task Tracker');
    expect(wrapper.text()).toContain('Home');
    expect(wrapper.text()).toContain('About');
    expect(wrapper.text()).toContain('Light');
    expect(links.map((link) => link.attributes('href'))).toEqual(['/', '/about']);
  });

  it('renders the inverse theme label when the current theme is light', async () => {
    mockThemeState.current = 'light';

    const wrapper = await mountHeader();

    expect(wrapper.text()).toContain('Dark');
  });

  it('calls toggleTheme when the theme button is clicked', async () => {
    const wrapper = await mountHeader();
    const button = wrapper.get('button[class*="p-button"]');

    await button.trigger('click');

    expect(mockToggleTheme).toHaveBeenCalledTimes(1);
  });
});
