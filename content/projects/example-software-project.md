---
title: Example software project
date: 2026-09-01
summary: A sample write-up showing the typing terminal, the output image beside it, and the step rail.
tags: [software-engineering]
featured: true
role: Solo project
tools: [Python, NumPy]
cover: /img/output-sample.svg
coverAlt: Line chart trending upward
links:
  - Source on GitHub | https://github.com/your-username/example
---

Replace this with a short introduction: what problem you were solving and what the constraints were.

## Define the problem

Describe the goal, what already existed, and what you decided not to build. Plain paragraphs, lists and images all work here.

## Build the first version

The block below is a terminal block. The code types itself when it scrolls into view, then the output picture beside it fades in.

```python terminal file="fit.py" img="/img/output-sample.svg" alt="Chart produced by fit.py" caption="Output of fit.py: the fitted trend."
import numpy as np

# generate noisy data around a rising trend
x = np.linspace(0, 10, 50)
y = 2.1 * x + np.random.normal(0, 1.5, x.size)

# fit a straight line
slope, intercept = np.polyfit(x, y, 1)
print(f"slope={slope:.2f} intercept={intercept:.2f}")
```

Explain what the code does and why you wrote it this way, after the demo rather than before it.

## Test and measure

A normal code block, without the typing effect:

```bash
python fit.py
```

![Placeholder photo of the setup](/img/placeholder.svg "Captions come from the image title.")

## Result

Summarise what worked, any numbers, and what you would change next time.

## Report

Embed a PDF and open it at a given page (drop the file in `content/files/`):

```pdf src="/files/report.pdf" page="3" height="700" title="Project report" caption="The full report, opened at the results page."
```
