import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(defineConfig({
  title: "Superman",
  description: "An epic, declarative backend framework forged for the age of autonomous AI agents.",
  ignoreDeadLinks: true,
  markdown: {
    theme: { light: 'github-dark', dark: 'github-dark' }
  },
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/favicon.png' }],
    ['link', { rel: 'apple-touch-icon', href: '/favicon.png' }]
  ],
  themeConfig: {
    logo: '/superman-logo.png',

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Docs', link: '/introduction' },
      { text: 'Agents', link: '/agents' }
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/introduction' },
          { text: 'Principles', link: '/principles' },
          { text: 'Quick Start', link: '/getting-started' },
          { text: 'Architecture', link: '/architecture' }
        ]
      },
      {
        text: 'AI Integration',
        items: [
          { text: 'MCP Server', link: '/mcp-server' },
          { text: 'Agents', link: '/agents' }
        ]
      },
      {
        text: 'Security',
        items: [
          { text: 'Overview', link: '/security/overview' },
          { text: 'Middlewares', link: '/security/middlewares' },
          { text: 'Logging & Events', link: '/security/events' }
        ]
      },
      {
        text: 'Core API',
        items: [
          { text: 'API Summary', link: '/api-summary' },
          { text: 'App', link: '/api-app' },
          { text: 'Config', link: '/api-config' },
          { text: 'Modules', link: '/api-modules' },
          { text: 'Controllers', link: '/api-controllers' },
          { text: 'OpenAPI & Docs', link: '/api-openapi' }
        ]
      },
      {
        text: 'Advanced',
        items: [
          { text: 'Middlewares', link: '/api-middlewares' },
          { text: 'Schemas & Validation', link: '/schemas' },
          { text: 'Logging', link: '/api-logging' },
          { text: 'Scripts & CLI', link: '/scripts' }
        ]
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/euFerro/superman' },
      {
        icon: {
          svg: '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><title>npm</title><path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z"/></svg>'
        },
        ariaLabel: 'npm',
        link: 'https://www.npmjs.com/package/@supersec-ai/superman'
      }
    ]
  }
}));
