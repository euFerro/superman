import type { OpenApiDocument } from './build-openapi';
import type { DocsTemplateFn } from '../config/superman-config';

export interface RenderDocsHtmlOptions {
  spec: OpenApiDocument;
  specUrl: string;
  title: string;
  theme?: string;
  template?: DocsTemplateFn;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderDefault = ({ specUrl, title, theme }: RenderDocsHtmlOptions): string => {
  const safeTitle = escapeHtml(title);
  const safeSpecUrl = escapeHtml(specUrl);
  const configuration = escapeHtml(JSON.stringify({
    theme: theme ?? 'default',
    hideDownloadButton: false,
    layout: 'modern',
  }));

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>body{margin:0}</style>
</head>
<body>
  <script id="api-reference" data-url="${safeSpecUrl}" data-configuration="${configuration}"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;
};

export const renderDocsHtml = async (options: RenderDocsHtmlOptions): Promise<string> => {
  if (options.template) {
    const ctx = {
      spec: options.spec,
      specUrl: options.specUrl,
      title: options.title,
      theme: options.theme,
    };
    return await Promise.resolve(options.template(ctx));
  }
  return renderDefault(options);
};
