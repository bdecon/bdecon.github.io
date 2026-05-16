---
title: "Demo: side-by-side figure"
date: 2026-05-16T09:00:00-04:00
categories:
  - "Meta"
---

This is a demo post to show layout patterns available in blog posts. The body
is plain markdown but you can drop in `<div class="post-split">` for a
side-by-side image + text layout that breaks out of the prose column into the
right margin.

## Standard inline figure (centered)

A normal figure is centered inside the 600px prose column with an italic
caption beneath.

<figure>
<img src="/assets/blog/2026/05/chart_1.png" alt="">
<figcaption>Source: CPS microdata, March 2026 — the standard inline figure presentation.</figcaption>
</figure>

The text continues normally below.

## Side-by-side figure

Wrap a paragraph plus a figure in `<div class="post-split">`. The text keeps
its prose-column left alignment; the figure bumps out past the right edge of
the prose column into the right margin. Source order is always **text first,
figure second**. Below 880px viewport it stacks vertically (text above,
figure below).

<div class="post-split">
<p>When wages adjust to match prices, both paychecks rise in a two-earner household. In a one-earner household with four dependents, only one paycheck rises, and that paycheck still has to feed five mouths. Each person in the household has consumption needs whose prices have risen.</p>
<figure>
<img src="/assets/blog/2026/05/chart_1.png" alt="">
<figcaption>The chart spills into the right margin.</figcaption>
</figure>
</div>

A second one to confirm rhythm with the surrounding prose:

<div class="post-split">
<p>The text sits in its usual prose column position so the reading rhythm doesn't break when the layout shifts. The chart simply takes advantage of the empty space to its right.</p>
<figure>
<img src="/assets/blog/2026/05/chart_2.png" alt="">
<figcaption>Same pattern, different figure.</figcaption>
</figure>
</div>

## Pull quote

> A blockquote in the body becomes a pull quote: larger italic, accent left
> border, set off from the surrounding flow.

End of demo.
