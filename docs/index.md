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

| Feature / Capability | 🦸‍♂️ Superman | 🦁 NestJS | 🔥 Hono | 🦊 Elysia | 🔮 Encore | 🚀 Fastify | 🟢 Express |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Native MCP Server** | ✅ | ❌ | 🔌 | 🔌 | ❌ | 🔌 | 🔌 |
| **Native Observability** | ✅ | ⚠️ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Zero-Drifting Docs** | ✅ | ⚠️ | 🔌 | 🔌 | ✅ | 🔌 | ❌ |
| **Agent-Ready JSON Logs** | ✅ | ⚠️ | ❌ | 🔌 | ✅ | 🔌 | ❌ |
| **High Performance** | ✅ | ⚠️ | ✅ | ✅ | ✅ | ✅ | ⚠️ |
| **Declarative Architecture**| ✅ | ⚠️ | ❌ | ⚠️ | ✅ | ❌ | ❌ |

</div>

<div class="legend-list">

- ✅ **Native / Out-of-the-box support**
- 🔌 **Supported via plugin / extension**
- ⚠️ **Partial / Complex configuration**
- ❌ **No support**

</div>

## Performance Benchmarks

Superman is built on top of the Fastify HTTP engine, inheriting its top-tier throughput and low latency. Here is how it compares in raw JSON requests per second (`req/s`):

<div class="perf-chart">
  <div class="perf-bars">
    <div class="perf-bar">
      <span class="perf-value">105,000</span>
      <div class="perf-fill" style="height: 100%"></div>
      <span class="perf-label">🦊 Elysia <small>(Bun)</small></span>
      <span class="perf-latency">0.9 ms</span>
    </div>
    <div class="perf-bar">
      <span class="perf-value">82,300</span>
      <div class="perf-fill" style="height: 71.6%"></div>
      <span class="perf-label">🔮 Encore</span>
      <span class="perf-latency">1.1 ms</span>
    </div>
    <div class="perf-bar">
      <span class="perf-value">78,450</span>
      <div class="perf-fill" style="height: 68.2%"></div>
      <span class="perf-label">🚀 Fastify</span>
      <span class="perf-latency">1.2 ms</span>
    </div>
    <div class="perf-bar">
      <span class="perf-value">76,800</span>
      <div class="perf-fill" style="height: 66.8%"></div>
      <span class="perf-label">🔥 Hono</span>
      <span class="perf-latency">1.25 ms</span>
    </div>
    <div class="perf-bar is-superman">
      <span class="perf-value">75,120</span>
      <div class="perf-fill" style="height: 65.3%"></div>
      <span class="perf-label">🦸‍♂️ Superman</span>
      <span class="perf-latency">1.3 ms</span>
    </div>
    <div class="perf-bar">
      <span class="perf-value">68,900</span>
      <div class="perf-fill" style="height: 59.9%"></div>
      <span class="perf-label">🦁 NestJS (Fastify)</span>
      <span class="perf-latency">1.45 ms</span>
    </div>
    <div class="perf-bar">
      <span class="perf-value">34,500</span>
      <div class="perf-fill" style="height: 30%"></div>
      <span class="perf-label">🦁 NestJS (Express)</span>
      <span class="perf-latency">2.8 ms</span>
    </div>
    <div class="perf-bar">
      <span class="perf-value">18,900</span>
      <div class="perf-fill" style="height: 16.4%"></div>
      <span class="perf-label">🟢 Express</span>
      <span class="perf-latency">5.2 ms</span>
    </div>
  </div>
  <p class="perf-axis">Requests / Sec (Avg) · higher is better</p>
</div>

<p style="text-align: center; font-size: 0.9rem; color: var(--vp-c-text-2); margin-top: 24px;">
  <strong>Benchmark Setup:</strong> c6i.xlarge instance (4 vCPU, 8GB RAM) using <code>autocannon</code> targeting a simple JSON response with 100 concurrent connections.
</p>

<div class="docs-screenshot">

## Built for AI Agents

Superman is forged for the age of autonomous agents — a native MCP server, predictable declarative structure, and agent-ready tooling let AI agents understand and operate your backend with minimal context.

![Superman AI Agents](/agents-illustration.png)

</div>

<div class="docs-screenshot">

## Interactive API Reference

Superman automatically serves a gorgeous, interactive Scalar UI populated directly from your OpenAPI 3.1 schema. Simply enable `openapi.docs.enabled: true` in your configuration and head to `/docs`.

![Scalar API Reference](/openapi-scalar.png)

</div>

</div>
