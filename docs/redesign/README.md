# Interview-first portfolio review

AI-lexandre now lives at `/`; the complete static portfolio lives at `/work/`. `/interview/` shares the homepage shell, client, and session. Established case-study URLs remain in place. Nothing was deployed or pushed as part of this redesign.

## Direction and composition comparison

The interview is the working artifact. The portrait, modest identity column, cool paper background, IBM Plex Sans, and restrained blue action color keep the person and question in view without adding a decorative visual theme. Blue relates to the real portrait and consistently identifies links, focus, and Ask. Project evidence uses descriptive text and real document/repository links instead of placeholder thumbnails.

The two prototypes use identical identity, portrait, questions, and a static answer paraphrased from the published CHANEL case study. They are composition studies, not model responses.

The [composition study](compositions.html) supports both layouts and their answered states.

The side composition wins on desktop: the input begins about 150px earlier and the answer has a stable reading column. On mobile the two compositions converge to a compact identity block above the composer. The implemented conversation places the next composer after the exchange, so readers encounter the question, answer, and evidence together.

## Initial screenshot critique

1. The question field began at approximately y=702 at 1280×720 and y=797 at 390×844: the first interaction was effectively outside the opening viewport.
2. A nested chat shell, dashed starter panel, and repeated instructions consumed more attention than the task.
3. Amber washes, repeated shadows, pill controls, and placeholder project visuals weakened hierarchy and made unrelated controls look alike.

## Three final visual findings and fixes

The next review used the actual `review-*` screenshots, then recaptured the result as `after-*`.

| Before | After | Why |
| --- | --- | --- |
| Desktop surname broke into an awkward third line | Slightly wider identity column and a smaller name scale; the answer column stays aligned | The real name reads as one identity rather than a stack of fragments |
| Mobile composer used excess height and small, wrapped desktop keyboard instructions | Shorter editable field, 14px hint, compact mobile wording, and a clear 44px Ask target | The question is easier to begin and the suggestions fit naturally below it |
| Work opening repeated the long biography and delayed the first project | Concise factual introduction and tighter header/section spacing; full biography retained below | The actual work appears earlier at desktop and mobile sizes |

The final screenshots show clear identity/question/answer/source scale changes, no nested chat container, no gradients, no decorative typography, and no repeated pill system. Navigation, role disclosure, suggested questions, evidence, and Ask have different treatments. Long answers stay left aligned and readable. The long-answer source screenshots deliberately include the last answer paragraph so the evidence remains visually associated with it.

## Interaction and animation review

The answered state now uses a chat layout.

| Before | After | Why |
| --- | --- | --- |
| Token queue introduced 22ms client delays; timed progress narration implied work stages | Render real received text on the next frame; no artificial token waits or fabricated progress stages | Submission feedback represents actual request state |
| Every conversation render forced scrolling to the bottom | Scroll once in response to submission; never scroll on incoming tokens | Readers can scroll back during a response |
| A prominent heading introduced each question | A right-aligned visitor bubble precedes a signed reply on the left | Speaker changes are visible between turns |
| Links, descriptions, and follow-up suggestions interrupted each answer | One source count opens the titled links and excerpts. Suggested replies live beside the reply field | Reading and sending a reply take priority |
| The full-size form moved below long replies and focus jumped to the submitted question | A compact composer stays within reach and keeps a draft through stream completion | Visitors can type the next question while reading |
| Motion-heavy hover and broad transitions | No moving hover targets or entrances; only brief explicit color transitions, with reduced motion respected | Frequent keyboard and reading actions stay immediate |
| Raw SSE bypassed Fastify's prepared CORS headers | Copy prepared headers into the raw stream and emit errors in valid SSE frames | Cross-origin streaming works without silently falling back |

Animation verdict: **Approve** for the implemented scope. No purposeful spatial animation is needed here. Token updates are data, not simulated typing. The remaining color feedback is brief and interruptible. Reduced-motion browser checks report no running animations. Keyboard submission does not animate. Mock API word output also has no artificial delay; a separate fixture supplies controlled network pacing for verification.

## Evidence and routing

- CHANEL's case study supports the two-detector question and links the actual public **Combination Outlier Detection** PDF. Company data, internal dashboards, and source code remain confidential.
- Tiffany's public, sanitized internship account describes 68 validated price changes, source reconciliation, event dates/joins, alternative baselines/windows, and review of extreme or low-volume results. It explicitly qualifies causal inference and the partial planning prototype.
- Zeit's published README was retrieved and checked: it reports unscheduled tasks/reasons, hard due dates/events, persisted diagnostics, and a deterministic greedy fallback when OR-Tools is unavailable.
- New generated citations use root-relative routes, with experience links pointing to the corresponding Work entry. The client also normalizes the old `../index.html#…` and case-study citation forms, so an older deployed API remains navigable.
- Legacy homepage section fragments forward to Work with JavaScript enabled. Work and résumé links remain plain static links without JavaScript.

## Verification

- `npm run build`: passed.
- `npm test`: 145 passing tests — 20 corpus/retrieval, 114 API/policy, 11 frontend/content/navigation.
- `npm run test:browser`: 14 passing scenarios. Results are recorded in the locally generated `verification.json`.
- Actual local deterministic mock API: submit an edited suggestion, choose a role, receive genuine SSE, ask a follow-up with compact memory, open a case-study citation, and return with conversation, role, disclosure, and reading position restored. This flow passes at 1280×720 and 390×844. The test asserts both turns use the stream endpoint with no silent fallback.
- Explicitly failed stream: actual local non-streaming endpoint completes the same exchange.
- Unavailable service: recovery notice, retry, saved question, Work and résumé routes checked at 1280, 390, and 320px.
- No JavaScript: static Work projects, all career/education content, and résumé remain reachable.
- Keyboard: skip link and link/input order, visible field focus, multiline input, Enter submission, optional role controls, and undo for clearing the conversation.
- Long-answer fixture: 1,406 characters of published CHANEL facts sent over a paced local SSE test server. Desktop, mobile, and 320px layouts retain sources, avoid horizontal overflow, and do not steal scroll position. These screenshots test presentation and streaming behavior, not live model quality.
- Axe WCAG A/AA/2.1 AA scans: zero violations on the opening, Work, both case studies, architecture page, unavailable state, and long-answer/source states at all three widths. Two horizontally scrolling architecture tables were made keyboard focusable.
- Local link audit: static page links/assets and generated citation destinations/fragments resolve.
- Impeccable deterministic source detector: final result `[]`; a skip-link hover contrast finding was fixed. Visual review remains separate from that detector result.
- `git diff --check`: passed.

## Local screenshots

Start the static site and mock API using the [repository instructions](../../README.md), then run `npm run test:browser`. It writes current desktop and mobile screenshots to `docs/redesign/screenshots/`, including the interview, expanded sources, Work, case studies, and service failure states. The original comparison captures are available in the Git history preceding the screenshot cleanup.

## Skills actually used

- **frontend-design:** primary composition, palette, typography, real-content, and restraint guidance.
- **Impeccable:** `context` and deterministic `detect` commands ran; local craft-floor, simplification, typesetting, critique, and polish guidance informed the reviews. Context reported the account was not signed in. No hosted critique or independent dual-agent critique was claimed.
- **design-taste-frontend:** rendered-page critique for generic patterns, weak hierarchy, repetitive containers, and decorative type. Its site-generation/dealing kit and mandatory decorative-motion patterns were not applied: the brief explicitly assigns it a review role and takes precedence.
- **emil-design-eng:** composer focus/press states, submission feedback, source navigation, mobile targets, and interruption behavior.
- **review-animations:** frequency, motion purpose, immediate keyboard feedback, streaming, transitions, and reduced-motion review using its standards.
- **web-design-guidelines:** local bundled rules reviewed against implementation. Semantic controls, labels, skip links, focus, static navigation, reduced motion, image dimensions, and mobile overflow were checked; axe's table-focus findings were fixed.
- **Sites:** local repository/preview routing guidance only; no hosting or publication workflow was invoked.

## Remaining limits

Verification used installed desktop Chrome with emulated viewport sizes, not physical phones or Safari/Firefox. The production model/API was not used for answer-quality verification. Actual local mock responses and the explicitly labeled long-answer fixture are distinct. Existing external project links were preserved; Zeit's README and all local destinations were verified, not every remote service. The API/header fix requires a separate API deployment to affect production. Session restoration depends on session storage in the same tab; blocked storage preserves the interview's basic operation but cannot retain the conversation across navigation.
