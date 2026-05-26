---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Superman"
  text: "The Agentic Backend"
  tagline: "An epic, high-performance declarative framework forged specifically for the age of autonomous AI agents."
  image:
    src: /superman-logo.png
    alt: Superman Logo
  actions:
    - theme: brand
      text: What is Superman?
      link: /introduction
    - theme: alt
      text: Quickstart
      link: /getting-started
    - theme: alt
      text: GitHub
      link: https://github.com/supersec-ai/superman

features:
  - title: 🦸‍♂️ Native MCP Server
    details: Built from the ground up to integrate with the Model Context Protocol. Effortlessly expose your application capabilities directly to AI agents.
  - title: 🧩 Native Observability
    details: Identical patterns for configuration, routing, and logging. Build codebases that AI agents can predict and master instantly.
  - title: 🤖 Zero-Drifting Documentation
    details: Instantly serves a beautiful Scalar API reference generated directly from your OpenAPI 3.1 spec, ensuring zero manual drift.
  - title: 📝 Agent-Ready Logging
    details: Six categories of strongly-typed JSON logs out-of-the-box. Perfect for machine-parsing, observability, and anomaly detection.
  - title: ⚡ High Performance Engine
    details: Powered by the Fastify HTTP engine under the hood, delivering top-tier speed, zero native dependencies, and minimal overhead.
  - title: 🏗️ Declarative Architecture
    details: Define your entire application structure in a few explicit function calls, allowing AI to parse the architecture in a single pass.
---

<div class="features-comparison">

## Feature-by-Feature Comparison

Compare how **Superman** stacks up against traditional Node.js backend frameworks:

<div class="table-container">

| Feature / Capability | 🦸‍♂️ Superman | 🦁 NestJS | 🔥 Hono | 🔮 Encore | 🚀 Fastify | 🟢 Express |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Native MCP Server** | ✅ | ❌ | 🔌 | ❌ | 🔌 | 🔌 |
| **Native Observability** | ✅ | ⚠️ | ❌ | ✅ | ❌ | ❌ |
| **Zero-Drifting Docs** | ✅ | ⚠️ | 🔌 | ✅ | 🔌 | ❌ |
| **Agent-Ready JSON Logs** | ✅ | ⚠️ | ❌ | ✅ | 🔌 | ❌ |
| **High Performance** | ✅ | ⚠️ | ✅ | ✅ | ✅ | ⚠️ |
| **Declarative Architecture**| ✅ | ⚠️ | ❌ | ✅ | ❌ | ❌ |

</div>

<div class="legend-list">

- ✅ **Native / Out-of-the-box support**
- 🔌 **Supported via plugin / extension**
- ⚠️ **Partial / Complex configuration**
- ❌ **No support**

</div>

</div>
