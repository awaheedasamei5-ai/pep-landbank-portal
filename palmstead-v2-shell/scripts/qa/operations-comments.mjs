import assert from "node:assert/strict";
import { OPERATION_COMMENT_TEXT_LIMIT, operationCommentTextToHtml, safeOperationCommentHtml } from "../../src/lib/palmstead/operations-comment-html.ts";

let passed = 0;
function check(name, run) { run(); passed++; console.log(`PASS ${name}`); }
check("plain text escapes all markup-sensitive characters", () => assert.equal(operationCommentTextToHtml('<script>"A & B"</script>\' fish > chips'), '<p>&lt;script&gt;&quot;A &amp; B&quot;&lt;/script&gt;&#39; fish &gt; chips</p>'));
check("new lines normalize and survive", () => assert.equal(operationCommentTextToHtml('First\r\nSecond\rThird\nFourth'), '<p>First<br />Second<br />Third<br />Fourth</p>'));
check("Unicode and company names survive", () => assert.equal(operationCommentTextToHtml('Adams · Accra — Côte d’Ivoire 🌴'), '<p>Adams · Accra — Côte d’Ivoire 🌴</p>'));
check("empty input rejected", () => assert.throws(() => operationCommentTextToHtml(' \n '), /Enter a comment/));
check("length boundary accepted", () => assert.ok(operationCommentTextToHtml('x'.repeat(OPERATION_COMMENT_TEXT_LIMIT))));
check("oversized input rejected", () => assert.throws(() => operationCommentTextToHtml('x'.repeat(OPERATION_COMMENT_TEXT_LIMIT + 1)), /20,000/));
check("null legacy content is empty", () => assert.equal(safeOperationCommentHtml(null), ''));

const safe = [
  '<p>Work completed &amp; reviewed.</p>',
  '<p><strong>Urgent</strong> <em>site visit</em></p>',
  '<ul><li>Survey</li><li>Demarcation</li></ul>',
  '<ol><li>First</li><li>Second</li></ol>',
  '<blockquote><p>Agreed plan</p></blockquote>',
  '<pre><code>&lt;item&gt; &amp; detail</code></pre>',
  '<a href="https://example.invalid/plan?x=1&amp;y=2" title="Plan">Read plan</a>',
  '<a href="mailto:team@example.invalid">Email</a>',
];
for (const html of safe) check(`preserve supported legacy formatting: ${html}`, () => assert.equal(safeOperationCommentHtml(html), html));
const attacks = [
  '<script>alert(1)</script><p>Visible</p>',
  '<SCRIPT SRC="https://example.invalid/code.js"></SCRIPT>Visible',
  '<p onclick="alert(1)" onmouseover="alert(1)">Visible</p>',
  '<img src="https://example.invalid/tracker" onerror="alert(1)">Visible',
  '<svg onload="alert(1)"><a xlink:href="javascript:alert(1)">Bad</a></svg>Visible',
  '<math><mtext><img src=x onerror=alert(1)></mtext></math>Visible',
  '<iframe srcdoc="<script>alert(1)</script>"></iframe>Visible',
  '<object data="javascript:alert(1)">Bad</object>Visible',
  '<embed src="data:text/html,unsafe">Visible',
  '<video autoplay src="https://example.invalid/media"></video>Visible',
  '<audio src="https://example.invalid/audio"></audio>Visible',
  '<form action="https://example.invalid"><input autofocus onfocus="alert(1)"></form>Visible',
  '<style>body{display:none}</style><p style="position:fixed">Visible</p>',
  '<a href="javascript:alert(1)">Visible</a>',
  '<a href="JaVaScRiPt:alert(1)">Visible</a>',
  '<a href="java&#x09;script:alert(1)">Visible</a>',
  '<a href="data:text/html,unsafe">Visible</a>',
  '<a href="vbscript:unsafe">Visible</a>',
  '<a href="//example.invalid/track">Visible</a>',
  '<a href="https://example.invalid" ping="https://example.invalid/track" target="_blank" download>Visible</a>',
  '<p id="app" class="fixed" hidden contenteditable>Visible</p>',
  '<!-- hidden payload --><p>Visible</p>',
  '<textarea><img src=x onerror=alert(1)></textarea>Visible',
  '<p><strong>Visible</p></strong><img src=x onerror=alert(1)>',
];
for (const [index, html] of attacks.entries()) {
  const clean = safeOperationCommentHtml(html);
  check(`remove executable markup/attributes/media ${index + 1}`, () => {
    assert.doesNotMatch(clean, /<(?:script|style|img|svg|math|iframe|object|embed|video|audio|form|input|textarea)\b/i);
    assert.doesNotMatch(clean, /\s(?:on\w+|style|src|srcdoc|ping|target|download|id|class|hidden|contenteditable)\s*[=>]/i);
    assert.doesNotMatch(clean, /href="(?:javascript|data|vbscript|\/\/)/i);
    assert.match(clean, /Visible/);
  });
  check(`sanitization is idempotent ${index + 1}`, () => assert.equal(safeOperationCommentHtml(clean), clean));
}
check("literal typed markup stays text after final sanitization", () => assert.equal(safeOperationCommentHtml(operationCommentTextToHtml('<img src=x onerror=alert(1)>')), '<p>&lt;img src=x onerror=alert(1)&gt;</p>'));
console.log(JSON.stringify({ passed }));
