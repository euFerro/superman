import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(defineConfig({
  base: '/superman/',
  title: "Superman Framework",
  description: "An epic, declarative backend framework forged for the age of autonomous AI agents.",
  ignoreDeadLinks: true,
  head: [
    ['link', { rel: 'icon', href: '/superman/superman-logo.png' }]
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
          { text: 'Installation', link: '/install' },
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
          { text: 'Controllers', link: '/api-controllers' }
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
      { icon: 'github', link: 'https://github.com/euFerro/superman' }
    ]
  }
}));
