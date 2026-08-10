/* The one place markup is allowed through to dangerouslySetInnerHTML.

   The document builders in lib/docs.js escape every value they interpolate, so
   what arrives here should already be safe. This exists because that guarantee
   rests on roughly three thousand lines of template strings staying perfect
   forever — and the values being interpolated are buyer names, addresses,
   shipping marks and item descriptions, which is to say whatever somebody
   typed into the database. One field added without esc() would be stored XSS
   running on a page every admin opens, with their session attached.

   Escaping is what should stop that. This is what stops it mattering when the
   escaping is missed.

   The allowed set is deliberately small: the previews are tables, headings and
   text. No <script>, no <iframe>, no event handlers, no href — none of which
   any document needs, and each of which is a way out. */
import DOMPurify from "dompurify";

const CONFIG = {
  ALLOWED_TAGS: [
    "div", "span", "p", "br", "hr", "b", "i", "u", "em", "strong", "small", "sub", "sup",
    "table", "thead", "tbody", "tfoot", "tr", "td", "th", "colgroup", "col",
    "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "pre", "img",
  ],
  // `style` and `class` carry the whole layout of these documents; `src` is
  // needed for the letterhead logo, which is a data: URI built in the bundle.
  ALLOWED_ATTR: ["class", "style", "colspan", "rowspan", "width", "height", "align", "valign", "src", "alt"],
  // Only inline images. An external URL here would leak which document was
  // opened, and when, to whoever hosts it.
  ALLOWED_URI_REGEXP: /^data:image\//i,
  /* DOMPurify runs that regexp over the value of every attribute it does not
     already hold to be URI-safe — not only over the ones that carry a URL. A
     rule this narrow therefore threw away `colspan` and its neighbours, since
     "3" is not a data:image URI, and every form and letter in the library came
     out on screen with its merged cells collapsed into single columns while
     the printed copy (which never passes through here) was correct. Naming
     them as URI-safe exempts them from the URL test and nothing else: `src` is
     deliberately not in this list, so images stay data: only. */
  ADD_URI_SAFE_ATTR: ["colspan", "rowspan", "width", "height", "align", "valign"],
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "link", "base"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "href", "formaction", "xlink:href"],
  ALLOW_DATA_ATTR: false,
};

const EMPTY = '<div class="sub">No preview for this document.</div>';

export function safeHtml(html) {
  if (!html) return EMPTY;
  return DOMPurify.sanitize(String(html), CONFIG);
}

export default safeHtml;
