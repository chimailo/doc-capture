import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Document Capture SDK',
  description: 'On-device document and ID capture for the web.',
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/quick-start' },
      { text: 'API', link: '/api/' },
    ],
    sidebar: [
      {
        text: 'Getting started',
        items: [
          { text: 'Quick start', link: '/guide/quick-start' },
          { text: 'React', link: '/guide/react' },
          { text: 'Without React', link: '/guide/vanilla' },
        ],
      },
      {
        text: 'Deploying',
        items: [
          { text: 'CSP and self-hosting', link: '/guide/csp' },
          { text: 'Privacy', link: '/guide/privacy' },
          { text: 'Browser support', link: '/guide/browser-support' },
        ],
      },
      {
        text: 'Customising',
        items: [
          { text: 'Theming and i18n', link: '/guide/theming-i18n' },
          { text: 'Quality thresholds', link: '/guide/thresholds' },
          { text: 'Writing an OCR plugin', link: '/guide/ocr-plugins' },
        ],
      },
      {
        text: 'Help',
        items: [
          { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          { text: 'Real-device testing', link: '/guide/device-testing' },
          { text: 'Release checklist', link: '/guide/release-checklist' },
          { text: 'Phase 0 spike notes', link: '/guide/spike-notes' },
        ],
      },
      { text: 'API reference', link: '/api/' },
    ],
    search: { provider: 'local' },
  },
});
