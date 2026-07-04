"use strict";

hexo.extend.filter.register("after_render:html", function forceTitle(html) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, "<title>Aleph_null's Blog</title>");
});
