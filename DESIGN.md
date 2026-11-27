# Design direction

The subject is an engineer whose decisions can be questioned and inspected. The interview is the working artifact. The interface should feel like a conversation with a specific person, with the documentary evidence close at hand.

## Palette
Paper `#f7f9fb`; white input surface `#ffffff`; ink `#172c3e`; secondary ink `#506273`; action blue `#235cc5`; quiet separators `#c9d3df`. Blue comes from the real portrait's clothing and serves actions, links, and focus. The existing amber palette carries no content meaning; replace it. No gradient washes or decorative shadows.

## Typography
Self-host IBM Plex Sans at 400, 500, and 600. The opening interview heading is 32–40px. In the conversation, questions are 16px and answers are 16–17px with a 1.65 line height. Both use left-aligned text.

## Layout hypotheses
Compare the same portrait, identity, questions, and long answer in two structures:

```
Compact identity above          Narrow identity beside
[portrait identity    links]    [portrait]   [AI-lexandre]
[AI-lexandre explanation   ]    [identity]   [question + Ask]
[question + Ask            ]    [work    ]   [suggestions]
[suggestions               ]    [résumé  ]   [answer + evidence]
[answer + evidence         ]
```

The conversation scrolls with the page. Each visitor message sits in a quiet blue bubble on the right. AI-lexandre replies on the left with a small portrait and name. A single disclosure beneath each reply opens its descriptive source links and excerpts. The follow-up composer stays within reach on long threads. Visitors can also open suggested replies beside the role control and edit one before sending.

## Interaction
Display actual stream events immediately. Brief color and focus changes answer user actions; no animated entrances or moving hover targets. Respect reduced motion. Preserve native scrolling. Save the thread, role, draft, evidence disclosure, and reading position in session storage. Keep technical routing details behind developer mode.

## Work and case studies
The work page presents projects according to their actual evidence: an interactive interview, the CHANEL method note, a scheduling prototype, and a voice-enabled hackathon project. Use explicit document and repository titles instead of placeholder thumbnails. Preserve all career, education, skills, and contact material. Case studies remain readable at their established URLs with links to Work and the interview.
