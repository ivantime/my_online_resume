---
title: Redesigning JHU's COVID Line Chart
date: 2022-07-07
summary: Expanding Data Visualizations with Multi-Line Charts of COVID-19 Cases
tags: [Data Engineering, Software Engineering]
role: Solo Project
tools: [Python, CSV, HTML/CSS, JavaScript]
cover: /images/covid_line_chart/covid_line_chart_headline_gif.gif
coverScale: 50
coverAlt: COVID_GIF
coverSource: https://upload.wikimedia.org/wikipedia/commons/c/c5/Covid-19-curves-graphic-social-v3.gif
links:
  - Source on GitHub | https://github.com/ivantime/COVID_Multi_Line_Chart_CSC3007_Milestone2
---
From Cluttered Chart to Interactive Drill-Through Chart

## The Problem

```pdf src="https://raw.githubusercontent.com/ivantime/COVID_Multi_Line_Chart_CSC3007_Milestone2/main/slide_pdf/IV_Milestone_1(GitHub).pdf" page="4" width="90%" ratio="16/9" title="" caption="Slide 4 of the project deck." interactive="false"
```

Data showcasing COVID-19 Cases (presented by John Hopkins University) was a good idea, however, the chart presented brought up a few unintended issues with:
- Too many line overlaps with the compressed data lines plotted.
- Lacked the ability to focus on regions, not just whole countries to provide a less cluttered screen, for easier viewing.

## First: The Elephant
We decided to retain John Hopkin's <a href="https://www.bloomberg.com/graphics/2020-coronavirus-cases-world-map/#dvz-cases-since">Overview of All Countries Chart Design</a> as the first of many instances to:
- Give the user all countries to then filter on which (country) regions they would prefer to focus on
![alt text](/images/covid_line_chart/covid_line_chart_1_the_elephant_1.gif)

Then the twist:
- Adding a selectable (dotted) reference line at a selectable time instance
- Filter (on hover over) the preferred countries, in how they faired in COVID cases from the reference line to the last day of recorded cases
![alt text](/images/covid_line_chart/covid_line_chart_1_the_elephant_2.gif)


## Finally the Drill-Through (into Country's Region)
We implemented the ability to toggle from 'All Countries' to 'By Regions' (eg. Europe, Asia, etc) with the aim of:
- Giving a consistent experience of a selecting a time reference line as usual
- Give the user the ability to selectively focus on a region (i.e. Group of Countries in a Region)
- Then selectively pick which countries within that region to focus on (thus reducing the clutter of other countries outside of our scope)
![alt text](/images/covid_line_chart/covid_line_chart_1_the_revamp.gif)


## Interactive Demo of Revamped Line Chart (Try it out)
```embed src="https://ivantime.github.io/COVID_Multi_Line_Chart_CSC3007_Milestone2/" button="Click To Try Our Interactive Line Chart" width="90%" ratio="16/9" title="Interactive COVID multi-line chart" caption="Our Revamped Version of JHU: COVID Line Chart"
```


## Moving Ahead: Possible Future Improvements
As with all Projects future improvements are in order, such as:
- To better optimize the text pop-up (on hovering over countries/regions) to resize and fit the user's view, preventing text cut-off on the screen
![alt text](/images/covid_line_chart/covid_line_chart_3_revamp_improvements_text_cut_off.png)
