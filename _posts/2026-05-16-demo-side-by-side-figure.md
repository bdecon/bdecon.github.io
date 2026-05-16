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

## Side-by-side (image right, text left)

Wrap a paragraph plus a figure in `<div class="post-split">` to put them
side by side. The image gets pushed into the right margin, the text stays
left at prose width. On mobile this stacks vertically.

<div class="post-split">
<p>When wages adjust to match prices, both paychecks rise in a two-earner household. In a one-earner household with four dependents, only one paycheck rises, and that paycheck still has to feed five mouths. Each person in the household has consumption needs whose prices have risen.</p>
<figure>
<img src="/assets/blog/2026/05/chart_1.png" alt="">
<figcaption>The chart spills into the margin.</figcaption>
</figure>
</div>

## Side-by-side (image left, text right)

Same pattern, with `.post-split--reverse` flips the columns.

<div class="post-split post-split--reverse">
<figure>
<img src="/assets/blog/2026/05/chart_2.png" alt="">
<figcaption>Image on the left.</figcaption>
</figure>
<p>The text sits to the right of the image. Useful when you want the chart to set the visual hook and the explanation flows from it. Both layouts collapse to a single column on small screens so mobile readers see image-then-text in natural order.</p>
</div>

## Pull quote

> A blockquote in the body becomes a pull quote: larger italic, accent left
> border, set off from the surrounding flow.

End of demo.
