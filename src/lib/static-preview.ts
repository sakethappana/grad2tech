/**
 * Builds a single HTML document for previewing a static (HTML/CSS/JS) project inside a
 * sandboxed iframe (`sandbox="allow-scripts"` without allow-same-origin), so student code
 * runs in an opaque origin with no access to portal cookies, storage or parent APIs.
 */
export function buildStaticPreview(files: Record<string, string>, entry = "index.html"): string {
  const html = files[entry];
  if (html === undefined) {
    return `<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;padding:24px;color:#475569">No ${entry} in this project.</body>`;
  }
  const norm = (p: string) => p.replace(/^\.\//, "").replace(/^\//, "");
  const esc = (s: string) => s.replace(/<\/(script|style)/gi, "<\\/$1");
  let out = html.replace(/<link\b([^>]*?)href=["']([^"']+)["']([^>]*)>/gi, (m, pre: string, href: string, post: string) => {
    if (!/rel=["']?stylesheet/i.test(pre + post)) return m;
    const css = files[norm(href)];
    return css === undefined ? m : `<style data-file="${norm(href)}">\n${esc(css)}\n</style>`;
  });
  out = out.replace(/<script\b([^>]*?)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (m, pre: string, src: string, post: string) => {
    const js = files[norm(src)];
    if (js === undefined) return m;
    const attrs = `${pre} ${post}`.replace(/\s+/g, " ").trim();
    return `<script ${attrs} data-file="${norm(src)}">\n${esc(js)}\n</script>`;
  });
  // Forward console output to the parent for the logs panel (validated by the parent).
  const bridge = `<script>(function(){var send=function(level,args){try{parent.postMessage({__g2tPreview:true,level:level,text:Array.prototype.map.call(args,function(a){try{return typeof a==="string"?a:JSON.stringify(a)}catch(e){return String(a)}}).join(" ")},"*")}catch(e){}};["log","info","warn","error"].forEach(function(k){var o=console[k];console[k]=function(){send(k,arguments);o.apply(console,arguments)}});window.addEventListener("error",function(e){send("error",[e.message+" ("+(e.lineno||"?")+":"+(e.colno||"?")+")"])});})();</script>`;
  return /<head[^>]*>/i.test(out) ? out.replace(/<head([^>]*)>/i, `<head$1>${bridge}`) : bridge + out;
}
