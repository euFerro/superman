import { renderDocsHtml } from './render-docs';
import type { OpenApiDocument } from './build-openapi';

const makeSpec = (overrides: Partial<OpenApiDocument> = {}): OpenApiDocument => ({
  openapi: '3.1.0',
  info: { title: 'TestApi', version: '0.0.1' },
  tags: [],
  paths: {},
  components: { schemas: {} },
  ...overrides,
});

describe('renderDocsHtml', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('default template', () => {
    it('should embed the Scalar script with data-url pointing at specUrl', async () => {
      // Arrange
      const spec = makeSpec();

      // Act
      const html = await renderDocsHtml({
        spec,
        specUrl: '/api/spec',
        title: 'My API',
      });

      // Assert
      expect(html).toContain('data-url="/api/spec"');
      expect(html).toContain('cdn.jsdelivr.net/npm/@scalar/api-reference');
    }, 1000);

    it('should escape the title to prevent script injection', async () => {
      // Arrange
      const spec = makeSpec();

      // Act
      const html = await renderDocsHtml({
        spec,
        specUrl: '/spec',
        title: '<script>alert(1)</script>',
      });

      // Assert
      expect(html).not.toContain('<script>alert(1)</script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    }, 1000);

    it('should forward the theme to the Scalar configuration', async () => {
      // Arrange
      const spec = makeSpec();

      // Act
      const html = await renderDocsHtml({
        spec,
        specUrl: '/spec',
        title: 'API',
        theme: 'purple',
      });

      // Assert
      expect(html).toContain('purple');
    }, 1000);
  });

  describe('custom template', () => {
    it('should invoke the template with the full context and return its output verbatim', async () => {
      // Arrange
      const spec = makeSpec();
      const template = jest.fn().mockReturnValue('<h1>custom</h1>');

      // Act
      const html = await renderDocsHtml({
        spec,
        specUrl: '/api/spec',
        title: 'CustomTitle',
        theme: 'dark',
        template,
      });

      // Assert
      expect(template).toHaveBeenCalledWith({
        spec,
        specUrl: '/api/spec',
        title: 'CustomTitle',
        theme: 'dark',
      });
      expect(html).toBe('<h1>custom</h1>');
    }, 1000);

    it('should await async templates', async () => {
      // Arrange
      const spec = makeSpec();
      const template = jest.fn().mockResolvedValue('<h2>async</h2>');

      // Act
      const html = await renderDocsHtml({
        spec,
        specUrl: '/spec',
        title: 'X',
        template,
      });

      // Assert
      expect(html).toBe('<h2>async</h2>');
    }, 1000);
  });
});