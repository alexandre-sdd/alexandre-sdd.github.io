# Design direction

The subject is an engineer whose decisions can be questioned and inspected. The interview is the working artifact. The interface should feel like a conversation with a specific person, with the documentary evidence close at hand.

## Palette
Paper `#f7f9fb`; white input surface `#ffffff`; ink `#172c3e`; secondary ink `#506273`; action blue `#235cc5`; quiet separators `#c9d3df`. Blue comes from the real portrait's clothing and serves actions, links, and focus. The existing amber palette carries no content meaning; replace it. No gradient washes or decorative shadows.

## Typography
Self-host IBM Plex Sans at 400, 500, and 600. One family supplies a human, technical voice without a display-serif costume. Identity 24–30px, interview heading 32–40px, question 21–26px, answer 17–18px with 1.7 line height, sources and controls 14–16px. Left alignment, ordinary sentence case, comfortable reading measure.

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

No chat window inside the page. Whitespace groups the conversation; a full border belongs to the editable input. Ask is a solid blue rectangle with a small radius. Navigation is text; role selection is a native select behind optional disclosure; suggestions are line-based buttons; sources are descriptive underlined links. Questions and their answers stay close, exchanges stay farther apart.

## Interaction
Display actual stream events immediately. Brief color and focus changes answer user actions; no animated entrances or moving hover targets. Respect reduced motion. Preserve native scrolling. Save the thread, role, draft, evidence disclosure, and reading position in session storage. Keep technical routing details behind developer mode.

## Work and case studies
The work page presents projects according to their actual evidence: an interactive interview, the CHANEL method note, a scheduling prototype, and a voice-enabled hackathon project. Use explicit document and repository titles instead of placeholder thumbnails. Preserve all career, education, skills, and contact material. Case studies remain readable at their established URLs with links to Work and the interview.
